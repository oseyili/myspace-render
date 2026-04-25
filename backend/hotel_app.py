from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from typing import Optional
import os, requests, uuid, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

# =========================
# CONFIG
# =========================
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "booking-com.p.rapidapi.com")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USERNAME", "")
SMTP_PASS = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")

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
# EMAIL
# =========================
def send_email(to, subject, html):
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SMTP_FROM, [to], msg.as_string())

        return True
    except Exception as e:
        return str(e)

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {
        "status": "live",
        "hotel_source": "RAPIDAPI_BOOKING",
        "real_data": True
    }

# =========================
# GET DESTINATION ID
# =========================
def get_destination_id(city: str):
    url = "https://booking-com.p.rapidapi.com/v1/hotels/locations"

    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST
    }

    params = {
        "name": city,
        "locale": "en-gb"
    }

    res = requests.get(url, headers=headers, params=params)

    if res.status_code != 200:
        return None

    data = res.json()

    if not data:
        return None

    return data[0].get("dest_id")

# =========================
# REAL HOTEL SEARCH
# =========================
@app.get("/api/hotels")
def search_hotels(
    city: str = Query(...),
    page: int = Query(1),
    page_size: int = Query(24),
):
    if not RAPIDAPI_KEY:
        return {"error": "API not configured"}

    dest_id = get_destination_id(city)

    if not dest_id:
        return {
            "count": 0,
            "hotels": [],
            "message": "No real hotels found for this destination."
        }

    url = "https://booking-com.p.rapidapi.com/v1/hotels/search"

    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST
    }

    params = {
        "dest_id": dest_id,
        "dest_type": "city",
        "checkin_date": "2026-05-01",
        "checkout_date": "2026-05-05",
        "adults_number": "2",
        "room_number": "1",
        "order_by": "popularity",
        "units": "metric",
        "locale": "en-gb",
        "page_number": str(page),
        "include_adjacency": "true"
    }

    res = requests.get(url, headers=headers, params=params)

    if res.status_code != 200:
        return {
            "count": 0,
            "hotels": [],
            "message": "Live hotel provider is unavailable. Please try again."
        }

    data = res.json()
    results = data.get("result", [])

    hotels = []

    for h in results:
        hotels.append({
            "id": str(h.get("hotel_id")),
            "name": h.get("hotel_name"),
            "city": h.get("city"),
            "country": h.get("country_trans"),
            "price": h.get("min_total_price"),
            "currency": h.get("currencycode"),
            "rating": h.get("review_score"),
            "image": h.get("max_1440_photo_url"),
            "latitude": h.get("latitude"),
            "longitude": h.get("longitude"),
            "map_url": f"https://www.google.com/maps?q={h.get('latitude')},{h.get('longitude')}"
        })

    return {
        "count": len(hotels),
        "hotels": hotels
    }

# =========================
# RESERVATION
# =========================
@app.post("/api/request")
def request_booking(req: ReservationRequest):
    booking_id = str(uuid.uuid4())

    html = f"""
    <h2>Reservation Request</h2>
    <p><b>Hotel ID:</b> {req.hotel_id}</p>
    <p><b>Name:</b> {req.name}</p>
    <p><b>Email:</b> {req.email}</p>
    <p><b>Message:</b> {req.message}</p>
    <p><b>Booking ID:</b> {booking_id}</p>
    """

    support = send_email(SUPPORT_EMAIL, "New Reservation", html)
    customer = send_email(req.email, "Your Reservation Request", html)

    return {
        "status": "received",
        "booking_id": booking_id,
        "email_delivery": {
            "support": support,
            "customer": customer
        }
    }