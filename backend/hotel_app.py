from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime
from typing import Optional
import os, sqlite3, uuid, smtplib, requests, stripe
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hotel_catalog.db"

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = "apidojo-booking-v1.p.rapidapi.com"

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
stripe.api_key = STRIPE_SECRET_KEY or None

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USER = os.getenv("SMTP_USERNAME", "").strip() or os.getenv("EMAIL_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()
PUBLIC_FRONTEND_URL = os.getenv("PUBLIC_FRONTEND_URL", "https://www.myspace-hotel.com").strip()

app = FastAPI(title="My Space Hotel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""

class CheckoutRequest(BaseModel):
    booking_id: str

def conn():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    db = conn()
    cur = db.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hotels (
            id TEXT PRIMARY KEY,
            name TEXT,
            city TEXT,
            country TEXT,
            price REAL,
            currency TEXT,
            rating REAL,
            image TEXT,
            latitude REAL,
            longitude REAL,
            map_url TEXT,
            imported_at TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            booking_id TEXT PRIMARY KEY,
            hotel_id TEXT,
            hotel_name TEXT,
            customer_name TEXT,
            customer_email TEXT,
            customer_message TEXT,
            status TEXT,
            stripe_url TEXT,
            created_at TEXT
        )
    """)
    db.commit()
    db.close()

init_db()

def email_ready():
    return all([SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM])

def send_email(to_email, subject, html):
    if not email_ready():
        return False, "SMTP is not fully configured on Render."

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [to_email], msg.as_string())

        return True, ""
    except Exception as exc:
        return False, str(exc)

def rapid_headers():
    return {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

def get_dest(city):
    url = f"https://{RAPIDAPI_HOST}/locations/auto-complete"
    params = {"text": city, "languagecode": "en-us"}

    r = requests.get(url, headers=rapid_headers(), params=params, timeout=35)
    if r.status_code != 200:
        return None, f"Location error {r.status_code}: {r.text[:300]}"

    data = r.json()
    if isinstance(data, dict):
        data = data.get("data") or data.get("result") or data.get("results") or []

    if not data:
        return None, "No destination found."

    first = data[0]
    return {
        "dest_id": first.get("dest_id") or first.get("id") or first.get("ufi"),
        "dest_type": first.get("dest_type") or first.get("type") or "city",
    }, ""

def clean_hotel(item):
    hotel_id = item.get("hotel_id") or item.get("id")
    name = item.get("hotel_name") or item.get("name")
    if not hotel_id or not name:
        return None

    lat = item.get("latitude")
    lng = item.get("longitude")

    return {
        "id": f"rapid-{hotel_id}",
        "name": name,
        "city": item.get("city") or item.get("city_name") or "",
        "country": item.get("country_trans") or item.get("country") or "",
        "price": item.get("min_total_price"),
        "currency": item.get("currencycode") or item.get("currency") or "LOCAL",
        "rating": item.get("review_score") or item.get("reviewScore"),
        "image": item.get("max_1440_photo_url") or item.get("main_photo_url") or item.get("photo_url") or "",
        "latitude": lat,
        "longitude": lng,
        "map_url": f"https://www.google.com/maps?q={lat},{lng}" if lat and lng else f"https://www.google.com/maps?q={name}",
    }

def save_hotels(hotels):
    db = conn()
    cur = db.cursor()
    for h in hotels:
        cur.execute("""
            INSERT OR REPLACE INTO hotels
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            h["id"], h["name"], h["city"], h["country"], h["price"],
            h["currency"], h["rating"], h["image"], h["latitude"],
            h["longitude"], h["map_url"], datetime.utcnow().isoformat()
        ))
    db.commit()
    db.close()

@app.get("/")
def root():
    return {
        "status": "live",
        "search": "enabled",
        "reservation": "enabled",
        "payment_after_email": "enabled",
        "rapidapi_key_loaded": bool(RAPIDAPI_KEY),
        "email_ready": email_ready(),
        "stripe_ready": bool(STRIPE_SECRET_KEY),
    }

@app.get("/api/hotels")
def search_hotels(
    country: Optional[str] = Query(None),
    city: str = Query(...),
    area: Optional[str] = Query(None),
    adults: int = Query(2),
    page: int = Query(1),
    page_size: int = Query(24),
):
    if not RAPIDAPI_KEY:
        return {"count": 0, "hotels": [], "message": "RapidAPI key is not configured."}

    dest, err = get_dest(city)
    if err or not dest or not dest.get("dest_id"):
        return {"count": 0, "hotels": [], "message": err or "Destination not found."}

    offset = max(0, (page - 1) * page_size)

    url = f"https://{RAPIDAPI_HOST}/properties/list"
    params = {
        "offset": offset,
        "guest_qty": adults,
        "children_qty": 0,
        "room_qty": 1,
        "search_type": dest["dest_type"],
        "dest_ids": dest["dest_id"],
        "price_filter_currencycode": "GBP" if (country or "").lower() in ["uk", "united kingdom"] else "USD",
        "order_by": "popularity",
        "languagecode": "en-us",
        "units": "imperial",
        "timezone": "UTC",
    }

    r = requests.get(url, headers=rapid_headers(), params=params, timeout=40)

    if r.status_code != 200:
        return {
            "count": 0,
            "hotels": [],
            "message": "Live hotel provider error.",
            "provider_error": r.text[:400],
        }

    data = r.json()
    results = data.get("result") or data.get("results") or data.get("data") or []

    if isinstance(results, dict):
        results = results.get("result") or results.get("results") or results.get("hotels") or []

    hotels = []
    for item in results[:page_size]:
        if isinstance(item, dict):
            h = clean_hotel(item)
            if h:
                hotels.append(h)

    save_hotels(hotels)

    return {
        "count": len(hotels),
        "page": page,
        "page_size": page_size,
        "total_pages": 1,
        "showing": len(hotels),
        "hotels": hotels,
        "fake_data": False,
    }

def create_stripe_checkout(booking_id, hotel_name, email):
    if not STRIPE_SECRET_KEY:
        return ""

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        customer_email=email,
        line_items=[{
            "price_data": {
                "currency": "gbp",
                "product_data": {"name": hotel_name},
                "unit_amount": 15000,
            },
            "quantity": 1,
        }],
        mode="payment",
        metadata={"booking_id": booking_id},
        success_url=f"{PUBLIC_FRONTEND_URL}/?payment=success&booking_id={booking_id}",
        cancel_url=f"{PUBLIC_FRONTEND_URL}/?payment=cancelled&booking_id={booking_id}",
    )
    return session.url

@app.post("/api/request")
def request_booking(req: ReservationRequest):
    db = conn()
    cur = db.cursor()

    hotel = cur.execute("SELECT * FROM hotels WHERE id=?", (req.hotel_id,)).fetchone()
    hotel_name = hotel["name"] if hotel else req.hotel_id

    booking_id = str(uuid.uuid4())
    stripe_url = create_stripe_checkout(booking_id, hotel_name, req.email)

    cur.execute("""
        INSERT INTO reservations
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        booking_id,
        req.hotel_id,
        hotel_name,
        req.name,
        req.email,
        req.message,
        "reservation_received",
        stripe_url,
        datetime.utcnow().isoformat(),
    ))

    db.commit()
    db.close()

    support_html = f"""
    <h2>New reservation request</h2>
    <p><b>Booking ID:</b> {booking_id}</p>
    <p><b>Hotel:</b> {hotel_name}</p>
    <p><b>Customer:</b> {req.name}</p>
    <p><b>Email:</b> {req.email}</p>
    <p><b>Message:</b> {req.message or "No special request submitted."}</p>
    <p><b>Payment link:</b> {stripe_url or "Stripe not configured"}</p>
    """

    customer_html = f"""
    <h2>Your reservation request has been received</h2>
    <p>Thank you for choosing <b>My Space Hotel</b>.</p>
    <p><b>Booking ID:</b> {booking_id}</p>
    <p><b>Hotel:</b> {hotel_name}</p>
    <p>To continue securely, use the payment link below:</p>
    <p><a href="{stripe_url}">Continue to secure payment</a></p>
    <p>If you did not request this, ignore this email.</p>
    """

    support_sent, support_error = send_email(SUPPORT_EMAIL, f"New reservation request - {booking_id}", support_html)
    customer_sent, customer_error = send_email(req.email, "Your My Space Hotel reservation and payment link", customer_html)

    return {
        "status": "received",
        "message": "Reservation received. Payment link has been sent by email if email delivery is configured.",
        "booking_id": booking_id,
        "payment_url": stripe_url,
        "email_delivery": {
            "support_sent": support_sent,
            "customer_sent": customer_sent,
            "support_error": support_error,
            "customer_error": customer_error,
        },
    }

@app.get("/api/booking/confirm")
def confirm_booking(booking_id: str):
    db = conn()
    cur = db.cursor()
    row = cur.execute("SELECT * FROM reservations WHERE booking_id=?", (booking_id,)).fetchone()

    if not row:
        db.close()
        return {"status": "error", "message": "Booking not found."}

    cur.execute("UPDATE reservations SET status='paid' WHERE booking_id=?", (booking_id,))
    db.commit()
    db.close()

    send_email(
        row["customer_email"],
        "My Space Hotel booking confirmed",
        f"""
        <h2>Your booking payment has been received</h2>
        <p><b>Booking ID:</b> {booking_id}</p>
        <p><b>Hotel:</b> {row["hotel_name"]}</p>
        """
    )

    return {"status": "paid", "message": "Booking confirmed."}