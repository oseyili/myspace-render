from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from datetime import datetime, timedelta
from typing import Optional
import os
import uuid
import smtplib
import requests
import stripe
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# =========================
# LOAD ENV
# =========================
load_dotenv()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = "apidojo-booking-v1.p.rapidapi.com"

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()

stripe.api_key = STRIPE_SECRET_KEY if STRIPE_SECRET_KEY else None

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()

SUPPORT_EMAIL = "reservations@myspace-hotel.com"
FRONTEND_URL = "https://www.myspace-hotel.com"

# =========================
# APP INIT
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# MODELS
# =========================
class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""

# =========================
# HELPERS
# =========================
def send_email(to_email, subject, html):
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM, to_email, msg.as_string())

        return True
    except Exception as e:
        return False

def get_dates():
    arrival = datetime.utcnow().date() + timedelta(days=30)
    departure = arrival + timedelta(days=3)
    return arrival.isoformat(), departure.isoformat()

def rapid_headers():
    return {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {
        "status": "live",
        "search": "enabled",
        "reservation": "enabled",
        "payment_after_email": "enabled",
        "rapidapi_key_loaded": bool(RAPIDAPI_KEY),
        "stripe_ready": bool(STRIPE_SECRET_KEY),
    }

# =========================
# LOCATION
# =========================
def get_destination(city):
    url = f"https://{RAPIDAPI_HOST}/locations/auto-complete"

    r = requests.get(
        url,
        headers=rapid_headers(),
        params={"text": city, "languagecode": "en-us"},
    )

    if r.status_code != 200:
        return None

    data = r.json()

    if not data:
        return None

    item = data[0]

    return {
        "dest_id": item.get("dest_id"),
        "dest_type": item.get("dest_type"),
    }

# =========================
# SEARCH HOTELS
# =========================
@app.get("/api/hotels")
def hotels(
    city: str,
    page: int = 1,
    page_size: int = 24,
):
    dest = get_destination(city)

    if not dest:
        return {"count": 0, "hotels": []}

    arrival, departure = get_dates()

    params = {
        "offset": (page - 1) * page_size,
        "arrival_date": arrival,
        "departure_date": departure,
        "guest_qty": 2,
        "room_qty": 1,
        "search_type": dest["dest_type"],
        "dest_ids": dest["dest_id"],
        "order_by": "popularity",
        "languagecode": "en-us",
    }

    r = requests.get(
        f"https://{RAPIDAPI_HOST}/properties/list",
        headers=rapid_headers(),
        params=params,
    )

    if r.status_code != 200:
        return {"count": 0, "hotels": []}

    data = r.json()
    results = data.get("result", [])

    hotels = []

    for h in results[:page_size]:
        hotels.append({
            "id": f"rapid-{h.get('hotel_id')}",
            "name": h.get("hotel_name"),
            "city": h.get("city"),
            "country": h.get("country_trans"),
            "price": h.get("min_total_price"),
            "currency": h.get("currencycode"),
            "rating": h.get("review_score"),
            "image": h.get("max_1440_photo_url"),
            "latitude": h.get("latitude"),
            "longitude": h.get("longitude"),
            "map_url": f"https://www.google.com/maps?q={h.get('latitude')},{h.get('longitude')}",
        })

    return {
        "count": len(hotels),
        "hotels": hotels,
    }

# =========================
# STRIPE
# =========================
def create_checkout(booking_id, hotel, email):
    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        customer_email=email,
        line_items=[{
            "price_data": {
                "currency": "gbp",
                "product_data": {"name": hotel},
                "unit_amount": 15000,
            },
            "quantity": 1,
        }],
        mode="payment",
        metadata={"booking_id": booking_id},
        success_url=f"{FRONTEND_URL}/?success={booking_id}",
        cancel_url=f"{FRONTEND_URL}/?cancel={booking_id}",
    )

    return session.url

# =========================
# RESERVATION
# =========================
@app.post("/api/request")
def request_booking(req: ReservationRequest):
    booking_id = str(uuid.uuid4())

    payment_url = create_checkout(
        booking_id,
        req.hotel_id,
        req.email,
    )

    customer_html = f"""
    <h2>Your reservation request</h2>
    <p>Booking ID: {booking_id}</p>
    <p><a href="{payment_url}">Pay now</a></p>
    """

    send_email(req.email, "Complete your booking", customer_html)
    send_email(SUPPORT_EMAIL, "New reservation", customer_html)

    return {
        "status": "received",
        "payment_url": payment_url,
    }

# =========================
# STRIPE WEBHOOK
# =========================
@app.post("/api/stripe/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig = request.headers.get("stripe-signature")

    event = stripe.Webhook.construct_event(
        payload, sig, STRIPE_WEBHOOK_SECRET
    )

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        booking_id = session["metadata"]["booking_id"]
        email = session["customer_email"]

        html = f"""
        <h2>Booking Confirmed</h2>
        <p>Booking ID: {booking_id}</p>
        """

        send_email(email, "Booking Confirmed", html)
        send_email(SUPPORT_EMAIL, "Booking Paid", html)

    return {"ok": True}