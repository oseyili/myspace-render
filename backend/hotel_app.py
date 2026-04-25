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

def rapid_headers():
    return {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

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
        "raw": first,
    }, ""

def find_hotel_list(data):
    paths = [
        ["result"],
        ["results"],
        ["hotels"],
        ["data"],
        ["data", "result"],
        ["data", "results"],
        ["data", "hotels"],
        ["searchResults", "results"],
        ["search_results"],
        ["propertySearchListings"],
    ]

    for path in paths:
        cur = data
        ok = True
        for key in path:
            if isinstance(cur, dict) and key in cur:
                cur = cur[key]
            else:
                ok = False
                break
        if ok and isinstance(cur, list):
            return cur

    if isinstance(data, dict):
        for value in data.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value
            if isinstance(value, dict):
                nested = find_hotel_list(value)
                if nested:
                    return nested

    return []

def clean_hotel(item):
    hotel_id = item.get("hotel_id") or item.get("id") or item.get("propertyId")
    name = item.get("hotel_name") or item.get("name") or item.get("propertyName")

    if not hotel_id or not name:
        basic = item.get("basicPropertyData") or {}
        hotel_id = hotel_id or basic.get("id")
        name = name or basic.get("name")

    if not hotel_id or not name:
        return None

    lat = item.get("latitude") or item.get("lat")
    lng = item.get("longitude") or item.get("lng")

    location = item.get("location") or {}
    if not lat:
        lat = location.get("latitude")
    if not lng:
        lng = location.get("longitude")

    image = (
        item.get("max_1440_photo_url")
        or item.get("main_photo_url")
        or item.get("photo_url")
        or ""
    )

    if not image:
        photos = item.get("photoUrls") or []
        if photos:
            image = photos[0]

    price_breakdown = item.get("priceBreakdown") or {}
    gross_price = price_breakdown.get("grossPrice") or {}

    return {
        "id": f"rapid-{hotel_id}",
        "name": name,
        "city": item.get("city") or item.get("city_name") or location.get("city") or "",
        "country": item.get("country_trans") or item.get("country") or location.get("country") or "",
        "price": item.get("min_total_price") or gross_price.get("value"),
        "currency": item.get("currencycode") or gross_price.get("currency") or "LOCAL",
        "rating": item.get("review_score") or item.get("reviewScore"),
        "image": image,
        "latitude": lat,
        "longitude": lng,
        "map_url": f"https://www.google.com/maps?q={lat},{lng}" if lat and lng else f"https://www.google.com/maps?q={name}",
        "fake_data": False,
    }

@app.get("/api/debug/rapid")
def debug_rapid(city: str = Query("London")):
    dest, err = get_dest(city)
    if err:
        return {"stage": "location", "error": err}

    url = f"https://{RAPIDAPI_HOST}/properties/list"
    params = {
        "offset": 0,
        "guest_qty": 2,
        "children_qty": 0,
        "room_qty": 1,
        "search_type": dest["dest_type"],
        "dest_ids": dest["dest_id"],
        "price_filter_currencycode": "GBP",
        "order_by": "popularity",
        "languagecode": "en-us",
        "units": "imperial",
        "timezone": "UTC",
    }

    r = requests.get(url, headers=rapid_headers(), params=params, timeout=40)

    try:
        body = r.json()
    except Exception:
        body = r.text[:1000]

    keys = list(body.keys()) if isinstance(body, dict) else []

    return {
        "status_code": r.status_code,
        "destination": dest,
        "top_level_keys": keys,
        "sample": body if isinstance(body, dict) else str(body)[:1000],
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

    url = f"https://{RAPIDAPI_HOST}/properties/list"
    params = {
        "offset": max(0, (page - 1) * page_size),
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
            "provider_error": r.text[:500],
        }

    data = r.json()
    results = find_hotel_list(data)

    hotels = []
    for item in results[:page_size]:
        if isinstance(item, dict):
            h = clean_hotel(item)
            if h:
                hotels.append(h)

    return {
        "count": len(hotels),
        "page": page,
        "page_size": page_size,
        "total_pages": 1,
        "showing": len(hotels),
        "hotels": hotels,
        "fake_data": False,
        "debug_keys": list(data.keys()) if isinstance(data, dict) else [],
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
    booking_id = str(uuid.uuid4())
    hotel_name = req.hotel_id
    stripe_url = create_stripe_checkout(booking_id, hotel_name, req.email)

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
    return {"status": "paid", "message": "Booking confirmed."}