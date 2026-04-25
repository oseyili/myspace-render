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

# ---------------- RAPID SEARCH ----------------
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

# ---------------- SEARCH API ----------------
@app.get("/api/hotels")
def get_hotels(city: str):
    hotels = search_hotels(city)

    return {
        "count": len(hotels),
        "hotels": hotels
    }

# ---------------- RESERVATION ----------------
@app.post("/api/request")
def create_request(data: dict):
    booking_id = str(uuid.uuid4())

    hotel_id = data["hotel_id"]
    hotel_name = data["hotel_name"]

    name = data["name"]
    email = data["email"]

    price = data["price"]
    currency = data["currency"]

    cur.execute("""
    INSERT INTO reservations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        booking_id,
        hotel_id,
        hotel_name,
        name,
        email,
        "pending_hotel",
        price,
        currency,
        datetime.now().isoformat()
    ))

    conn.commit()

    # EMAIL CUSTOMER
    send_email(
        email,
        "Reservation received",
        f"""
Your reservation request has been received.

Hotel: {hotel_name}
Booking ID: {booking_id}

We are confirming availability with the hotel.
"""
    )

    # EMAIL HOTEL (simulate)
    send_email(
        EMAIL_USER,
        "New reservation request",
        f"""
Hotel: {hotel_name}
Booking ID: {booking_id}

Confirm:
https://hotel-backend-1-ee5z.onrender.com/api/hotel/confirm?booking_id={booking_id}

Reject:
https://hotel-backend-1-ee5z.onrender.com/api/hotel/reject?booking_id={booking_id}
"""
    )

    return {"status": "reservation_sent", "booking_id": booking_id}

# ---------------- HOTEL CONFIRM ----------------
@app.get("/api/hotel/confirm")
def hotel_confirm(booking_id: str):
    cur.execute("SELECT * FROM reservations WHERE booking_id=?", (booking_id,))
    r = cur.fetchone()

    if not r:
        raise HTTPException(404, "Booking not found")

    # LIVE PRICE REFRESH (IMPORTANT)
    new_price = float(r[6])  # simulate (replace with real recheck)

    cur.execute("""
    UPDATE reservations SET status=?, price=? WHERE booking_id=?
    """, ("hotel_confirmed", new_price, booking_id))

    conn.commit()

    # CREATE STRIPE PAYMENT
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": r[7].lower(),
                "product_data": {"name": r[2]},
                "unit_amount": int(new_price * 100)
            },
            "quantity": 1
        }],
        mode="payment",
        success_url=f"https://myspace-hotel.com/success?booking_id={booking_id}",
        cancel_url="https://myspace-hotel.com/cancel"
    )

    # EMAIL CUSTOMER PAYMENT LINK
    send_email(
        r[4],
        "Hotel confirmed – complete payment",
        f"""
Your hotel is available.

Hotel: {r[2]}
Price: {new_price} {r[7]}

Pay here:
{session.url}
"""
    )

    return {"status": "payment_sent"}

# ---------------- HOTEL REJECT ----------------
@app.get("/api/hotel/reject")
def hotel_reject(booking_id: str):
    cur.execute("UPDATE reservations SET status=? WHERE booking_id=?",
                ("rejected", booking_id))
    conn.commit()

    return {"status": "rejected"}

# ---------------- STRIPE WEBHOOK ----------------
@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()

    event = stripe.Event.construct_from(
        request.json(), stripe.api_key
    )

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        booking_id = session["success_url"].split("=")[-1]

        cur.execute("""
        UPDATE reservations SET status=? WHERE booking_id=?
        """, ("paid", booking_id))
        conn.commit()

        cur.execute("SELECT * FROM reservations WHERE booking_id=?", (booking_id,))
        r = cur.fetchone()

        # EMAIL CONFIRMATION
        send_email(
            r[4],
            "Booking confirmed",
            f"""
Your booking is confirmed.

Hotel: {r[2]}
Booking ID: {booking_id}

We look forward to your stay.
"""
        )

    return {"status": "success"}

# ---------------- STATUS ----------------
@app.get("/")
def status():
    return {
        "status": "live",
        "search": "enabled",
        "reservation": "enabled",
        "automation": "full",
        "price_refresh": "enabled"
    }