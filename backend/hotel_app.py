from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from typing import Optional
from pathlib import Path
from datetime import datetime, timedelta
import os
import math
import uuid
import sqlite3
import smtplib
import random
import requests
import stripe
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hotel_catalog.db"

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "booking-com.p.rapidapi.com").strip()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
stripe.api_key = STRIPE_SECRET_KEY or None

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
EMAIL_USER = os.getenv("EMAIL_USER", "").strip()
SMTP_USER = SMTP_USERNAME or EMAIL_USER
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()
PUBLIC_FRONTEND_URL = os.getenv("PUBLIC_FRONTEND_URL", "https://www.myspace-hotel.com").strip()

app = FastAPI(title="My Space Hotel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://myspace-hotel.com",
        "https://www.myspace-hotel.com",
        "https://myspace-hotel.vercel.app",
        "https://hotel-frontend-vlwa.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FACILITIES = [
    "wifi", "spa", "gym", "restaurant", "pool", "parking",
    "airport shuttle", "family rooms", "beach access", "business lounge",
]

COUNTRY_ALIASES = {
    "uk": "United Kingdom",
    "gb": "United Kingdom",
    "england": "United Kingdom",
    "usa": "United States",
    "us": "United States",
    "america": "United States",
    "uae": "United Arab Emirates",
    "ng": "Nigeria",
}

CURRENCY_BY_COUNTRY = {
    "United Kingdom": "GBP",
    "United States": "USD",
    "Nigeria": "NGN",
    "France": "EUR",
    "Spain": "EUR",
    "Italy": "EUR",
    "Germany": "EUR",
    "United Arab Emirates": "AED",
    "Japan": "JPY",
    "Australia": "AUD",
    "South Africa": "ZAR",
    "Turkey": "TRY",
    "Singapore": "SGD",
    "Canada": "CAD",
    "Ghana": "GHS",
    "Kenya": "KES",
    "India": "INR",
}


class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""


class PaymentCodeSendRequest(BaseModel):
    hotel_id: str
    email: EmailStr


class PaymentCodeVerifyRequest(BaseModel):
    hotel_id: str
    email: EmailStr
    code: str


class CheckoutRequest(BaseModel):
    hotel_id: str
    hotel_name: str = "Selected hotel stay"
    email: EmailStr
    amount: int = 15000


def normalise_country(value: Optional[str]) -> str:
    if not value:
        return ""
    cleaned = value.strip()
    key = cleaned.lower().replace(".", "")
    return COUNTRY_ALIASES.get(key, cleaned.title())


def currency_for_country(country: Optional[str]) -> str:
    if not country:
        return "USD"
    return CURRENCY_BY_COUNTRY.get(normalise_country(country), "USD")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS hotels (
            id TEXT PRIMARY KEY,
            supplier TEXT NOT NULL,
            supplier_hotel_id TEXT NOT NULL,
            name TEXT NOT NULL,
            country TEXT,
            city TEXT,
            area TEXT,
            address TEXT,
            currency TEXT,
            price REAL,
            rating REAL,
            review_count INTEGER,
            image TEXT,
            latitude REAL,
            longitude REAL,
            map_url TEXT,
            booking_url TEXT,
            source_note TEXT,
            imported_at TEXT,
            UNIQUE(supplier, supplier_hotel_id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS reservation_requests (
            request_id TEXT PRIMARY KEY,
            hotel_id TEXT,
            hotel_name TEXT,
            customer_name TEXT,
            customer_email TEXT,
            customer_message TEXT,
            support_sent INTEGER DEFAULT 0,
            customer_sent INTEGER DEFAULT 0,
            email_note TEXT DEFAULT '',
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS payment_codes (
            code_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            hotel_id TEXT NOT NULL,
            code TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            verified INTEGER DEFAULT 0,
            attempts INTEGER DEFAULT 0
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            booking_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            hotel_id TEXT NOT NULL,
            hotel_name TEXT NOT NULL,
            amount INTEGER NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL,
            stripe_session_id TEXT,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_country ON hotels(country)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels(city)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_area ON hotels(area)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_supplier_id ON hotels(supplier_hotel_id)")
    conn.commit()
    conn.close()


init_db()


def email_ready():
    return all([SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM])


def send_html_email(to_address: str, subject: str, html_body: str):
    if not email_ready():
        return False, "SMTP is not fully configured on the server."

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_address
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, [to_address], msg.as_string())

        return True, ""
    except Exception as exc:
        return False, str(exc)


def rapid_headers():
    return {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }


def rapid_get(path: str, params: dict):
    if not RAPIDAPI_KEY:
        return None, "RAPIDAPI_KEY is not configured."

    url = f"https://{RAPIDAPI_HOST}{path}"
    try:
        res = requests.get(url, headers=rapid_headers(), params=params, timeout=35)
        if res.status_code != 200:
            return None, f"RapidAPI returned {res.status_code}: {res.text[:300]}"
        return res.json(), ""
    except Exception as exc:
        return None, str(exc)


def find_destination(city: str):
    data, error = rapid_get(
        "/v1/hotels/locations",
        {"name": city, "locale": "en-gb"},
    )

    if error or not data:
        return None, error or "No destination found."

    for item in data:
        if item.get("dest_id") and item.get("dest_type"):
            return {
                "dest_id": item.get("dest_id"),
                "dest_type": item.get("dest_type"),
                "name": item.get("name") or city,
                "country": item.get("country") or item.get("country_trans") or "",
            }, ""

    return None, "No usable destination returned by RapidAPI."


def clean_hotel(raw: dict, city_hint: str, country_hint: str):
    hotel_id = raw.get("hotel_id") or raw.get("id")
    name = raw.get("hotel_name") or raw.get("name")
    if not hotel_id or not name:
        return None

    latitude = raw.get("latitude")
    longitude = raw.get("longitude")

    city = raw.get("city") or raw.get("city_name") or city_hint or ""
    country = raw.get("country_trans") or raw.get("country") or country_hint or ""
    area = raw.get("district") or raw.get("district_name") or raw.get("address") or city
    currency = raw.get("currencycode") or raw.get("currency_code") or currency_for_country(country)
    price = raw.get("min_total_price") or raw.get("price_breakdown", {}).get("gross_price")
    rating = raw.get("review_score")
    review_count = raw.get("review_nr") or raw.get("review_count")
    image = (
        raw.get("max_1440_photo_url")
        or raw.get("main_photo_url")
        or raw.get("photo_url")
        or ""
    )

    booking_url = raw.get("url") or raw.get("hotel_url") or ""
    map_url = ""
    if latitude and longitude:
        map_url = f"https://www.google.com/maps?q={latitude},{longitude}"
    else:
        map_url = f"https://www.google.com/maps?q={name},{city},{country}"

    return {
        "id": f"rapid-{hotel_id}",
        "supplier": "rapidapi_booking",
        "supplier_hotel_id": str(hotel_id),
        "name": name,
        "country": country,
        "city": city,
        "area": area,
        "address": raw.get("address") or "",
        "currency": currency,
        "price": price,
        "rating": rating,
        "review_count": review_count,
        "image": image,
        "latitude": latitude,
        "longitude": longitude,
        "map_url": map_url,
        "booking_url": booking_url,
        "source_note": "Real hotel imported from RapidAPI Booking provider.",
        "imported_at": datetime.utcnow().isoformat(),
    }


def save_hotels(hotels):
    if not hotels:
        return 0

    conn = get_conn()
    cur = conn.cursor()
    saved = 0

    for h in hotels:
        cur.execute("""
            INSERT OR REPLACE INTO hotels (
                id, supplier, supplier_hotel_id, name, country, city, area, address,
                currency, price, rating, review_count, image, latitude, longitude,
                map_url, booking_url, source_note, imported_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            h["id"], h["supplier"], h["supplier_hotel_id"], h["name"],
            h["country"], h["city"], h["area"], h["address"],
            h["currency"], h["price"], h["rating"], h["review_count"],
            h["image"], h["latitude"], h["longitude"], h["map_url"],
            h["booking_url"], h["source_note"], h["imported_at"],
        ))
        saved += 1

    conn.commit()
    conn.close()
    return saved


def import_from_rapid(city: str, country: str = "", page: int = 1, page_size: int = 24):
    destination, error = find_destination(city)
    if error or not destination:
        return [], error

    checkin = (datetime.utcnow() + timedelta(days=30)).date().isoformat()
    checkout = (datetime.utcnow() + timedelta(days=34)).date().isoformat()

    data, error = rapid_get(
        "/v1/hotels/search",
        {
            "dest_id": destination["dest_id"],
            "dest_type": destination["dest_type"],
            "checkin_date": checkin,
            "checkout_date": checkout,
            "adults_number": "2",
            "room_number": "1",
            "units": "metric",
            "order_by": "popularity",
            "locale": "en-gb",
            "page_number": str(max(0, page - 1)),
            "include_adjacency": "true",
            "filter_by_currency": currency_for_country(country or destination.get("country")),
        },
    )

    if error or not data:
        return [], error or "No RapidAPI search data returned."

    raw_results = data.get("result") or data.get("hotels") or []
    cleaned = []

    for raw in raw_results[:page_size]:
        hotel = clean_hotel(raw, city, country or destination.get("country", ""))
        if hotel:
            cleaned.append(hotel)

    save_hotels(cleaned)
    return cleaned, ""


def row_to_hotel(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "country": row["country"],
        "city": row["city"],
        "area": row["area"],
        "address": row["address"],
        "currency": row["currency"],
        "price": row["price"],
        "rating": row["rating"],
        "review_count": row["review_count"],
        "image": row["image"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "map_url": row["map_url"],
        "booking_url": row["booking_url"],
        "source_note": row["source_note"],
        "facilities": [],
    }


@app.get("/")
def root():
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) AS total FROM hotels").fetchone()["total"]
    conn.close()

    return {
        "status": "live",
        "hotel_source": "RapidAPI imported real hotels only",
        "fake_data": False,
        "rapidapi_configured": bool(RAPIDAPI_KEY),
        "hotels_in_database": total,
        "email_ready": email_ready(),
        "payment_ready": bool(STRIPE_SECRET_KEY),
    }


@app.get("/api/facilities")
def get_facilities():
    return {"facilities": FACILITIES}


@app.get("/api/admin/catalogue-status")
def catalogue_status():
    conn = get_conn()
    cur = conn.cursor()
    total = cur.execute("SELECT COUNT(*) AS total FROM hotels").fetchone()["total"]
    countries = [dict(r) for r in cur.execute("""
        SELECT country, COUNT(*) AS count
        FROM hotels
        GROUP BY country
        ORDER BY count DESC
        LIMIT 100
    """).fetchall()]
    conn.close()

    return {
        "total_hotels": total,
        "countries_loaded": countries,
        "rapidapi_configured": bool(RAPIDAPI_KEY),
        "email_ready": email_ready(),
        "payment_ready": bool(STRIPE_SECRET_KEY),
        "fake_data": False,
    }


@app.post("/api/admin/import-rapid")
def admin_import_rapid(
    city: str = Query(...),
    country: str = Query(""),
    pages: int = Query(1),
    page_size: int = Query(24),
):
    safe_pages = min(max(1, pages), 10)
    safe_page_size = min(max(1, page_size), 24)

    total_saved = 0
    last_error = ""

    for p in range(1, safe_pages + 1):
        hotels, error = import_from_rapid(city, country, p, safe_page_size)
        if error:
            last_error = error
            break
        total_saved += save_hotels(hotels)

    return {
        "status": "completed" if not last_error else "partial_or_failed",
        "city": city,
        "country": normalise_country(country) if country else "",
        "pages_requested": safe_pages,
        "saved": total_saved,
        "error": last_error,
    }


@app.get("/api/hotels")
def search_hotels(
    country: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    area: Optional[str] = Query(None),
    facilities: Optional[str] = Query(None),
    adults: int = Query(2),
    page: int = Query(1),
    page_size: int = Query(24),
):
    safe_page = max(1, page)
    safe_page_size = min(max(1, page_size), 24)
    offset = (safe_page - 1) * safe_page_size

    where = []
    params = []

    norm_country = normalise_country(country) if country else ""

    if norm_country:
        where.append("LOWER(country) LIKE ?")
        params.append(f"%{norm_country.lower()}%")

    if city and city.strip():
        where.append("LOWER(city) LIKE ?")
        params.append(f"%{city.strip().lower()}%")

    if area and area.strip():
        where.append("(LOWER(area) LIKE ? OR LOWER(address) LIKE ?)")
        params.append(f"%{area.strip().lower()}%")
        params.append(f"%{area.strip().lower()}%")

    where_sql = "WHERE " + " AND ".join(where) if where else ""

    conn = get_conn()
    cur = conn.cursor()
    total = int(cur.execute(f"SELECT COUNT(*) AS total FROM hotels {where_sql}", params).fetchone()["total"])

    if total == 0 and city:
        conn.close()
        imported, error = import_from_rapid(city.strip(), norm_country, safe_page, safe_page_size)

        if not imported:
            return {
                "count": 0,
                "page": safe_page,
                "page_size": safe_page_size,
                "total_pages": 0,
                "showing": 0,
                "hotels": [],
                "message": "No live RapidAPI hotels are available for this search yet.",
                "provider_error": error,
                "fake_data": False,
            }

        return {
            "count": len(imported),
            "page": safe_page,
            "page_size": safe_page_size,
            "total_pages": 1,
            "showing": len(imported),
            "hotels": imported,
            "message": "Real hotels imported from RapidAPI.",
            "fake_data": False,
        }

    rows = cur.execute(
        f"""
        SELECT *
        FROM hotels
        {where_sql}
        ORDER BY rating DESC, price ASC, name ASC
        LIMIT ? OFFSET ?
        """,
        params + [safe_page_size, offset],
    ).fetchall()

    conn.close()

    hotels = [row_to_hotel(r) for r in rows]

    return {
        "count": total,
        "page": safe_page,
        "page_size": safe_page_size,
        "total_pages": max(1, math.ceil(total / safe_page_size)) if total else 0,
        "showing": len(hotels),
        "hotels": hotels,
        "fake_data": False,
    }


@app.post("/api/payment-code/send")
def send_payment_code(request: PaymentCodeSendRequest):
    clean_email = request.email.strip().lower()
    code = str(random.randint(100000, 999999))
    now = datetime.utcnow()
    expires = now + timedelta(minutes=10)

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM payment_codes WHERE email=? AND hotel_id=? AND verified=0", (clean_email, request.hotel_id))
    cur.execute("""
        INSERT INTO payment_codes VALUES (?, ?, ?, ?, ?, ?, 0, 0)
    """, (str(uuid.uuid4()), clean_email, request.hotel_id, code, now.isoformat(), expires.isoformat()))
    conn.commit()
    conn.close()

    sent, note = send_html_email(
        clean_email,
        "Your My Space Hotel payment access code",
        f"<h2>Your payment access code</h2><h1>{code}</h1><p>This code expires in 10 minutes.</p>",
    )

    return {
        "status": "sent" if sent else "email_failed",
        "message": "Payment access code sent to your email." if sent else "Payment code created, but email did not send.",
        "note": note,
        "expires_minutes": 10,
    }


@app.post("/api/payment-code/verify")
def verify_payment_code(request: PaymentCodeVerifyRequest):
    clean_email = request.email.strip().lower()
    clean_code = request.code.strip()

    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute("""
        SELECT * FROM payment_codes
        WHERE email=? AND hotel_id=? AND verified=0
        ORDER BY created_at DESC
        LIMIT 1
    """, (clean_email, request.hotel_id)).fetchone()

    if not row:
        conn.close()
        return {"verified": False, "message": "No active code found."}

    if int(row["attempts"]) >= 5:
        conn.close()
        return {"verified": False, "message": "Too many attempts. Request a new code."}

    if datetime.utcnow() > datetime.fromisoformat(row["expires_at"]):
        conn.close()
        return {"verified": False, "message": "Code expired."}

    if clean_code != row["code"]:
        cur.execute("UPDATE payment_codes SET attempts=attempts+1 WHERE code_id=?", (row["code_id"],))
        conn.commit()
        conn.close()
        return {"verified": False, "message": "Incorrect code."}

    cur.execute("UPDATE payment_codes SET verified=1 WHERE code_id=?", (row["code_id"],))
    conn.commit()
    conn.close()

    return {"verified": True, "message": "Email verified. You can now pay."}


@app.post("/api/payment/checkout")
def create_checkout(request: CheckoutRequest):
    if not STRIPE_SECRET_KEY:
        return {"error": "Stripe is not configured on the server."}

    clean_email = request.email.strip().lower()

    conn = get_conn()
    cur = conn.cursor()
    verified = cur.execute("""
        SELECT * FROM payment_codes
        WHERE email=? AND hotel_id=? AND verified=1
        ORDER BY created_at DESC
        LIMIT 1
    """, (clean_email, request.hotel_id)).fetchone()

    if not verified:
        conn.close()
        return {"error": "Email payment code is not verified."}

    booking_id = str(uuid.uuid4())
    currency = "usd"

    cur.execute("""
        INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        booking_id,
        clean_email,
        request.hotel_id,
        request.hotel_name,
        request.amount,
        currency,
        "pending",
        "",
        datetime.utcnow().isoformat(),
    ))
    conn.commit()
    conn.close()

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        customer_email=clean_email,
        line_items=[{
            "price_data": {
                "currency": currency,
                "product_data": {"name": request.hotel_name},
                "unit_amount": request.amount,
            },
            "quantity": 1,
        }],
        mode="payment",
        metadata={"booking_id": booking_id, "hotel_id": request.hotel_id},
        success_url=f"{PUBLIC_FRONTEND_URL}/?payment=success&booking_id={booking_id}",
        cancel_url=f"{PUBLIC_FRONTEND_URL}/?payment=cancelled&booking_id={booking_id}",
    )

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE bookings SET stripe_session_id=? WHERE booking_id=?", (session.id, booking_id))
    conn.commit()
    conn.close()

    return {"url": session.url, "booking_id": booking_id}


@app.get("/api/booking/confirm")
def confirm_booking(booking_id: str):
    conn = get_conn()
    cur = conn.cursor()
    booking = cur.execute("SELECT * FROM bookings WHERE booking_id=?", (booking_id,)).fetchone()

    if not booking:
        conn.close()
        return {"status": "error", "message": "Booking not found."}

    cur.execute("UPDATE bookings SET status='paid' WHERE booking_id=?", (booking_id,))
    conn.commit()

    paid_booking = cur.execute("SELECT * FROM bookings WHERE booking_id=?", (booking_id,)).fetchone()
    conn.close()

    send_html_email(
        paid_booking["email"],
        "My Space Hotel booking confirmed",
        f"""
        <h2>Your booking is confirmed</h2>
        <p><strong>Hotel:</strong> {paid_booking["hotel_name"]}</p>
        <p><strong>Booking ID:</strong> {paid_booking["booking_id"]}</p>
        <p><strong>Amount paid:</strong> ${paid_booking["amount"] / 100:.2f}</p>
        """,
    )

    return {"status": "paid", "message": "Booking confirmed.", "booking": dict(paid_booking)}


@app.post("/api/request")
def request_booking(request: ReservationRequest):
    conn = get_conn()
    cur = conn.cursor()
    hotel = cur.execute("SELECT * FROM hotels WHERE id = ?", (request.hotel_id,)).fetchone()

    if not hotel:
        conn.close()
        return {"status": "error", "message": "Hotel not found in real RapidAPI database."}

    request_id = str(uuid.uuid4())

    support_html = f"""
    <h2>New reservation request</h2>
    <p><strong>Request ID:</strong> {request_id}</p>
    <p><strong>Hotel:</strong> {hotel["name"]}</p>
    <p><strong>Location:</strong> {hotel["area"]}, {hotel["city"]}, {hotel["country"]}</p>
    <p><strong>Customer:</strong> {request.name}</p>
    <p><strong>Email:</strong> {request.email}</p>
    <p><strong>Message:</strong> {request.message or "No special request submitted."}</p>
    """

    customer_html = f"""
    <h2>Your reservation request has been received</h2>
    <p>Thank you for choosing <strong>My Space Hotel</strong>.</p>
    <p><strong>Hotel:</strong> {hotel["name"]}</p>
    <p><strong>Location:</strong> {hotel["area"]}, {hotel["city"]}, {hotel["country"]}</p>
    <p><strong>Request ID:</strong> {request_id}</p>
    <p>We will continue with you using this email address.</p>
    """

    support_sent, support_note = send_html_email(SUPPORT_EMAIL, f"New reservation request - {hotel['name']}", support_html)
    customer_sent, customer_note = send_html_email(request.email, f"Your My Space Hotel reservation request - {hotel['name']}", customer_html)

    email_note = "; ".join([x for x in [support_note, customer_note] if x])

    cur.execute("""
        INSERT INTO reservation_requests (
            request_id, hotel_id, hotel_name, customer_name, customer_email,
            customer_message, support_sent, customer_sent, email_note, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        request_id,
        hotel["id"],
        hotel["name"],
        request.name,
        request.email,
        request.message,
        int(bool(support_sent)),
        int(bool(customer_sent)),
        email_note,
        datetime.utcnow().isoformat(),
    ))
    conn.commit()
    conn.close()

    return {
        "status": "received",
        "message": "Reservation request received.",
        "request_id": request_id,
        "email_delivery": {
            "support_sent": bool(support_sent),
            "customer_sent": bool(customer_sent),
            "note": email_note,
        },
    }


@app.get("/api/admin/bookings")
def admin_bookings():
    conn = get_conn()
    cur = conn.cursor()
    rows = cur.execute("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200").fetchall()
    conn.close()
    return {"bookings": [dict(r) for r in rows]}