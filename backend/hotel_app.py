from fastapi import FastAPI, Query
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

load_dotenv()

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

def travel_dates():
    arrival = datetime.utcnow().date() + timedelta(days=30)
    departure = arrival + timedelta(days=4)
    return arrival.isoformat(), departure.isoformat()

def get_dest(city):
    url = f"https://{RAPIDAPI_HOST}/locations/auto-complete"
    params = {"text": city, "languagecode": "en-us"}

    r = requests.get(url, headers=rapid_headers(), params=params, timeout=35)
    if r.status_code != 200:
        return None, f"Location error {r.status_code}: {r.text[:500]}"

    data = r.json()
    if isinstance(data, dict):
        data = data.get("data") or data.get("result") or data.get("results") or []

    if not data:
        return None, "No destination found."

    best = None

    for item in data:
        if item.get("dest_type") in ["city", "district", "region"] and (item.get("dest_id") or item.get("id") or item.get("ufi")):
            best = item
            break

    if not best:
        best = data[0]

    return {
        "dest_id": best.get("dest_id") or best.get("id") or best.get("ufi"),
        "dest_type": best.get("dest_type") or best.get("type") or "city",
        "label": best.get("label") or best.get("name") or city,
    }, ""

def find_hotel_list(data):
    if isinstance(data, list):
        return data

    if not isinstance(data, dict):
        return []

    direct_paths = [
        ["result"],
        ["results"],
        ["hotels"],
        ["data"],
        ["data", "result"],
        ["data", "results"],
        ["data", "hotels"],
        ["searchResults", "results"],
        ["propertySearchListings"],
    ]

    for path in direct_paths:
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

    for value in data.values():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            return value
        if isinstance(value, dict):
            nested = find_hotel_list(value)
            if nested:
                return nested

    return []

def nested(obj, path, default=None):
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
            cur = cur[int(part)]
        else:
            return default
    return cur if cur not in [None, ""] else default

def clean_hotel(item):
    basic = item.get("basicPropertyData") or {}
    location = item.get("location") or basic.get("location") or {}
    price_breakdown = item.get("priceBreakdown") or {}
    gross_price = price_breakdown.get("grossPrice") or {}

    hotel_id = (
        item.get("hotel_id")
        or item.get("id")
        or item.get("propertyId")
        or basic.get("id")
    )

    name = (
        item.get("hotel_name")
        or item.get("name")
        or item.get("propertyName")
        or basic.get("name")
        or nested(item, "displayName.text")
    )

    if not hotel_id or not name:
        return None

    lat = item.get("latitude") or item.get("lat") or location.get("latitude")
    lng = item.get("longitude") or item.get("lng") or location.get("longitude")

    image = (
        item.get("max_1440_photo_url")
        or item.get("main_photo_url")
        or item.get("photo_url")
        or nested(item, "photoUrls.0")
        or nested(item, "basicPropertyData.photos.main.highResUrl")
        or nested(item, "basicPropertyData.photos.main.lowResUrl")
        or ""
    )

    return {
        "id": f"rapid-{hotel_id}",
        "name": name,
        "city": item.get("city") or item.get("city_name") or location.get("city") or "",
        "country": item.get("country_trans") or item.get("country") or location.get("country") or "",
        "price": item.get("min_total_price") or gross_price.get("value"),
        "currency": item.get("currencycode") or gross_price.get("currency") or "LOCAL",
        "rating": item.get("review_score") or item.get("reviewScore") or nested(item, "basicPropertyData.reviewScore.score"),
        "review_count": item.get("review_nr") or item.get("review_count") or nested(item, "basicPropertyData.reviewScore.reviewCount"),
        "image": image,
        "latitude": lat,
        "longitude": lng,
        "map_url": f"https://www.google.com/maps?q={lat},{lng}" if lat and lng else f"https://www.google.com/maps?q={name}",
        "fake_data": False,
    }

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

@app.get("/api/debug/rapid")
def debug_rapid(city: str = Query("London")):
    dest, err = get_dest(city)
    if err:
        return {"stage": "location", "error": err}

    arrival, departure = travel_dates()

    params = {
        "offset": 0,
        "arrival_date": arrival,
        "departure_date": departure,
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

    r = requests.get(
        f"https://{RAPIDAPI_HOST}/properties/list",
        headers=rapid_headers(),
        params=params,
        timeout=40,
    )

    try:
        body = r.json()
    except Exception:
        body = r.text[:1000]

    hotel_list = find_hotel_list(body)

    return {
        "status_code": r.status_code,
        "destination": dest,
        "arrival_date": arrival,
        "departure_date": departure,
        "top_level_keys": list(body.keys()) if isinstance(body, dict) else [],
        "hotel_list_found": len(hotel_list),
        "sample_hotel_keys": list(hotel_list[0].keys()) if hotel_list and isinstance(hotel_list[0], dict) else [],
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
        return {
            "count": 0,
            "hotels": [],
            "message": "RapidAPI key is not configured.",
            "fake_data": False,
        }

    dest, err = get_dest(city)
    if err or not dest or not dest.get("dest_id"):
        return {
            "count": 0,
            "hotels": [],
            "message": err or "Destination not found.",
            "fake_data": False,
        }

    arrival, departure = travel_dates()
    safe_page_size = min(max(1, page_size), 24)

    params = {
        "offset": max(0, (page - 1) * safe_page_size),
        "arrival_date": arrival,
        "departure_date": departure,
        "guest_qty": adults,
        "children_qty": 0,
        "room_qty": 1,
        "search_type": dest["dest_type"],
        "dest_ids": dest["dest_id"],
        "price_filter_currencycode": "GBP" if (country or "").lower() in ["uk", "united kingdom", "gb", "england"] else "USD",
        "order_by": "popularity",
        "languagecode": "en-us",
        "units": "imperial",
        "timezone": "UTC",
    }

    r = requests.get(
        f"https://{RAPIDAPI_HOST}/properties/list",
        headers=rapid_headers(),
        params=params,
        timeout=40,
    )

    if r.status_code != 200:
        return {
            "count": 0,
            "hotels": [],
            "message": "Live hotel provider error.",
            "provider_error": r.text[:500],
            "fake_data": False,
        }

    data = r.json()
    results = find_hotel_list(data)

    hotels = []
    for item in results[:safe_page_size]:
        if isinstance(item, dict):
            hotel = clean_hotel(item)
            if hotel:
                hotels.append(hotel)

    if area:
        area_lower = area.lower()
        hotels = [
            h for h in hotels
            if area_lower in (h.get("name") or "").lower()
            or area_lower in (h.get("city") or "").lower()
            or area_lower in (h.get("country") or "").lower()
        ]

    return {
        "count": len(hotels),
        "page": page,
        "page_size": safe_page_size,
        "total_pages": 1,
        "showing": len(hotels),
        "hotels": hotels,
        "fake_data": False,
        "arrival_date": arrival,
        "departure_date": departure,
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

    support_sent, support_error = send_email(
        SUPPORT_EMAIL,
        f"New reservation request - {booking_id}",
        support_html,
    )

    customer_sent, customer_error = send_email(
        req.email,
        "Your My Space Hotel reservation and payment link",
        customer_html,
    )

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
    return {
        "status": "paid",
        "message": "Booking confirmed.",
        "booking_id": booking_id,
    }