import os
import uuid
import sqlite3
import requests
import smtplib
import stripe
from email.mime.text import MIMEText
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# ---------------- CONFIG ----------------
RAPID_KEY = os.getenv("RAPIDAPI_KEY")
STRIPE_KEY = os.getenv("STRIPE_SECRET_KEY")
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")

stripe.api_key = STRIPE_KEY
RAPID_HOST = "apidojo-booking-v1.p.rapidapi.com"

# ---------------- DB ----------------
conn = sqlite3.connect("hotels.db", check_same_thread=False)
cur = conn.cursor()

cur.execute("""
CREATE TABLE IF NOT EXISTS hotels (
    id TEXT PRIMARY KEY,
    name TEXT,
    city TEXT,
    country TEXT,
    price REAL,
    currency TEXT,
    image TEXT,
    latitude REAL,
    longitude REAL
)
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS reservations (
    booking_id TEXT PRIMARY KEY,
    hotel_id TEXT,
    hotel_name TEXT,
    customer_name TEXT,
    customer_email TEXT,
    status TEXT,
    price REAL,
    currency TEXT,
    created_at TEXT
)
""")

conn.commit()

# ---------------- EMAIL ----------------
def send_email(to_email, subject, body):
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = EMAIL_USER
        msg["To"] = to_email

        with smtplib.SMTP_SSL("smtp.zoho.eu", 465) as server:
            server.login(EMAIL_USER, EMAIL_PASS)
            server.sendmail(EMAIL_USER, to_email, msg.as_string())
    except Exception as e:
        print("EMAIL ERROR:", e)

# ---------------- RAPID SEARCH (LIVE) ----------------
def search_hotels(city):
    url = "https://apidojo-booking-v1.p.rapidapi.com/properties/v2/list"

    headers = {
        "X-RapidAPI-Key": RAPID_KEY,
        "X-RapidAPI-Host": RAPID_HOST
    }

    params = {
        "dest_id": city,
        "dest_type": "city",
        "arrival_date": (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d"),
        "departure_date": (datetime.now() + timedelta(days=10)).strftime("%Y-%m-%d"),
        "room_qty": 1,
        "guest_qty": 2,
        "page_number": 1,
        "units": "metric",
        "currency": "GBP",
        "locale": "en-gb"
    }

    r = requests.get(url, headers=headers, params=params)

    if r.status_code != 200:
        return []

    data = r.json()

    hotels = []

    for h in data.get("result", []):
        hotels.append({
            "id": f"rapid-{h.get('hotel_id')}",
            "name": h.get("hotel_name"),
            "city": city,
            "country": h.get("country_trans"),
            "price": h.get("min_total_price"),
            "currency": h.get("currencycode"),
            "image": h.get("main_photo_url"),
            "lat": h.get("latitude"),
            "lng": h.get("longitude")
        })

    return hotels

# ---------------- DATABASE IMPORT ----------------
@app.post("/api/admin/import-rapid")
def import_hotels(city: str, country: str, pages: int = 5, page_size: int = 24):
    saved = 0

    for page in range(1, pages + 1):
        hotels = search_hotels(city)

        for h in hotels:
            try:
                cur.execute("""
                INSERT OR IGNORE INTO hotels VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    h["id"], h["name"], h["city"], h["country"],
                    h["price"], h["currency"], h["image"],
                    h["lat"], h["lng"]
                ))
                saved += 1
            except:
                pass

    conn.commit()

    return {
        "status": "completed",
        "city": city,
        "country": country,
        "pages": pages,
        "saved": saved,
        "fake_data": False
    }

# ---------------- DATABASE STATUS ----------------
@app.get("/api/admin/catalogue-status")
def catalogue_status():
    cur.execute("SELECT COUNT(*) FROM hotels")
    total = cur.fetchone()[0]

    return {
        "total_hotels": total,
        "fake_data": False,
        "rapidapi_key_loaded": RAPID_KEY is not None,
        "email_ready": EMAIL_USER is not None
    }

# ---------------- SEARCH API ----------------
@app.get("/api/hotels")
def get_hotels(city: str):
    cur.execute("SELECT * FROM hotels WHERE city LIKE ? LIMIT 50", (f"%{city}%",))
    rows = cur.fetchall()

    hotels = []
    for r in rows:
        hotels.append({
            "id": r[0],
            "name": r[1],
            "city": r[2],
            "country": r[3],
            "price": r[4],
            "currency": r[5],
            "image": r[6],
            "lat": r[7],
            "lng": r[8]
        })

    return {"count": len(hotels), "hotels": hotels}

# ---------------- RESERVATION ----------------
@app.post("/api/request")
def create_request(data: dict):
    booking_id = str(uuid.uuid4())

    cur.execute("""
    INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        booking_id,
        data["hotel_id"],
        data["hotel_name"],
        data["name"],
        data["email"],
        "pending_hotel",
        data["price"],
        data["currency"],
        datetime.now().isoformat()
    ))
    conn.commit()

    # CUSTOMER EMAIL
    send_email(
        data["email"],
        "Reservation received",
        f"Booking ID: {booking_id}\nWe are confirming availability."
    )

    # HOTEL EMAIL (SIMULATED)
    send_email(
        EMAIL_USER,
        "Confirm booking",
        f"""
Confirm:
https://hotel-backend-1-ee5z.onrender.com/api/hotel/confirm?booking_id={booking_id}

Reject:
https://hotel-backend-1-ee5z.onrender.com/api/hotel/reject?booking_id={booking_id}
"""
    )

    return {"booking_id": booking_id}

# ---------------- HOTEL CONFIRM ----------------
@app.get("/api/hotel/confirm")
def confirm(booking_id: str):
    cur.execute("SELECT * FROM reservations WHERE booking_id=?", (booking_id,))
    r = cur.fetchone()

    if not r:
        raise HTTPException(404)

    price = float(r[6])

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": r[7].lower(),
                "product_data": {"name": r[2]},
                "unit_amount": int(price * 100)
            },
            "quantity": 1
        }],
        mode="payment",
        success_url=f"https://myspace-hotel.com/success?booking_id={booking_id}",
        cancel_url="https://myspace-hotel.com/cancel"
    )

    send_email(
        r[4],
        "Pay for your booking",
        f"Complete payment:\n{session.url}"
    )

    return {"status": "payment_sent"}

# ---------------- STRIPE WEBHOOK ----------------
@app.post("/api/stripe/webhook")
async def webhook(request: Request):
    data = await request.json()

    if data.get("type") == "checkout.session.completed":
        booking_id = data["data"]["object"]["success_url"].split("=")[-1]

        cur.execute("UPDATE reservations SET status='paid' WHERE booking_id=?", (booking_id,))
        conn.commit()

    return {"ok": True}

# ---------------- ROOT ----------------
@app.get("/")
def root():
    return {
        "status": "live",
        "database": "enabled",
        "import": "enabled",
        "search": "enabled",
        "reservation": "enabled",
        "payment": "enabled"
    }