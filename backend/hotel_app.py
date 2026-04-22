from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
import os
import uuid
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import requests

app = FastAPI(title="My Space Hotel Booking API")

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://www.myspace-hotel.com").strip()
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()
ADMIN_NOTIFICATION_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", SUPPORT_EMAIL).strip()

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587").strip() or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "").strip()
RAPID_LOCATIONS_PATH = os.getenv("RAPID_LOCATIONS_PATH", "/locations/v3/search").strip()
RAPID_HOTELS_PATH = os.getenv("RAPID_HOTELS_PATH", "/properties/list").strip()

ALLOWED_ORIGINS = [
    "https://www.myspace-hotel.com",
    "https://myspace-hotel.com",
    "https://myspace-hotel.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FALLBACK_HOTELS: List[Dict[str, Any]] = [
    {
        "id": "ht-001",
        "name": "My Space London Central",
        "city": "London",
        "country": "United Kingdom",
        "area": "Central London",
        "price": 185,
        "currency": "GBP",
        "rating": 8.8,
        "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80",
        "summary": "Stay close to landmarks, dining, shopping, and fast transport links in central London.",
    },
    {
        "id": "ht-002",
        "name": "Canary Riverside Suites",
        "city": "London",
        "country": "United Kingdom",
        "area": "Canary Wharf",
        "price": 220,
        "currency": "GBP",
        "rating": 8.9,
        "image": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1400&q=80",
        "summary": "A polished riverside stay for business trips, city breaks, and longer London stays.",
    },
    {
        "id": "ht-003",
        "name": "West End Urban Stay",
        "city": "London",
        "country": "United Kingdom",
        "area": "West End",
        "price": 165,
        "currency": "GBP",
        "rating": 8.5,
        "image": "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1400&q=80",
        "summary": "Close to theatres, restaurants, and shopping with easy city access throughout the day.",
    },
    {
        "id": "ht-004",
        "name": "Docklands Comfort Hotel",
        "city": "London",
        "country": "United Kingdom",
        "area": "Docklands",
        "price": 198,
        "currency": "GBP",
        "rating": 8.4,
        "image": "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?auto=format&fit=crop&w=1400&q=80",
        "summary": "A smooth and practical London base with clean rooms and strong transport access.",
    },
    {
        "id": "ht-005",
        "name": "Kensington Boutique Rooms",
        "city": "London",
        "country": "United Kingdom",
        "area": "Kensington",
        "price": 245,
        "currency": "GBP",
        "rating": 9.0,
        "image": "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=80",
        "summary": "Quiet elegance near museums, parks, and premium London neighbourhoods.",
    },
    {
        "id": "ht-006",
        "name": "Paddington Gateway Hotel",
        "city": "London",
        "country": "United Kingdom",
        "area": "Paddington",
        "price": 176,
        "currency": "GBP",
        "rating": 8.3,
        "image": "https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&w=1400&q=80",
        "summary": "A convenient choice for rail links, airport access, and efficient city travel.",
    },
]

class ReservationRequest(BaseModel):
    hotel_id: str
    hotel_name: str
    city: str
    country: str
    checkin_date: str
    checkout_date: str
    nights: int
    price: float
    currency: str
    customer_name: str
    customer_email: EmailStr
    notes: Optional[str] = ""

def smtp_configured() -> bool:
    return all([SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SUPPORT_EMAIL])

def _rapid_headers() -> Dict[str, str]:
    if not RAPIDAPI_KEY or not RAPIDAPI_HOST:
        raise RuntimeError("RapidAPI environment variables are not configured.")
    return {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

def _rapid_base_url() -> str:
    if not RAPIDAPI_HOST:
        raise RuntimeError("RAPIDAPI_HOST is missing.")
    return f"https://{RAPIDAPI_HOST}"

def _fallback_search(city: str, country: str, area: str) -> Dict[str, Any]:
    city_l = city.strip().lower()
    country_l = country.strip().lower()
    area_l = area.strip().lower()

    hotels = []
    for hotel in FALLBACK_HOTELS:
        if city_l and city_l not in hotel["city"].lower():
            continue
        if country_l and country_l not in hotel["country"].lower():
            continue
        if area_l and area_l not in hotel["area"].lower() and area_l not in hotel["name"].lower():
            continue
        hotels.append(hotel)

    if not hotels:
        hotels = FALLBACK_HOTELS

    return {
        "source": "fallback",
        "count": len(hotels),
        "approx_total_results": max(len(hotels) * 400, len(hotels)),
        "hotels": hotels,
    }

def _format_price(value: Any) -> float:
    try:
        if value is None:
            return 0.0
        return float(value)
    except Exception:
        return 0.0

def _search_rapid(city: str, country: str, checkin: str, checkout: str, adults: int, page: int) -> Dict[str, Any]:
    headers = _rapid_headers()
    base_url = _rapid_base_url()

    # Step 1: search location
    location_params = {
        "name": city,
        "locale": "en-gb",
    }
    if country:
        location_params["country"] = country

    location_response = requests.get(
        f"{base_url}{RAPID_LOCATIONS_PATH}",
        headers=headers,
        params=location_params,
        timeout=35,
    )
    location_response.raise_for_status()
    location_payload = location_response.json()

    location_results = []
    if isinstance(location_payload, list):
        location_results = location_payload
    elif isinstance(location_payload, dict):
        for key in ("result", "data", "results"):
            if isinstance(location_payload.get(key), list):
                location_results = location_payload[key]
                break

    if not location_results:
        raise RuntimeError("No destination results returned from RapidAPI.")

    first = location_results[0]
    dest_id = (
        first.get("dest_id")
        or first.get("id")
        or first.get("destination_id")
        or first.get("city_ufi")
    )
    search_type = (
        first.get("dest_type")
        or first.get("search_type")
        or first.get("type")
        or "CITY"
    )

    if dest_id is None:
        raise RuntimeError("RapidAPI destination id was not found.")

    # Step 2: hotel search
    hotel_params = {
        "dest_id": str(dest_id),
        "search_type": str(search_type),
        "arrival_date": checkin,
        "departure_date": checkout,
        "adults": str(max(adults, 1)),
        "children_age": "0,0",
        "room_qty": "1",
        "page_number": str(max(page, 1)),
        "languagecode": "en-gb",
        "currency_code": "GBP",
    }

    hotels_response = requests.get(
        f"{base_url}{RAPID_HOTELS_PATH}",
        headers=headers,
        params=hotel_params,
        timeout=45,
    )
    hotels_response.raise_for_status()
    hotels_payload = hotels_response.json()

    results = []
    total_results = 0

    if isinstance(hotels_payload, dict):
        for key in ("result", "data", "results"):
            if isinstance(hotels_payload.get(key), list):
                results = hotels_payload[key]
                break
        total_results = (
            hotels_payload.get("count")
            or hotels_payload.get("total_count")
            or hotels_payload.get("total_results")
            or 0
        )

    hotels: List[Dict[str, Any]] = []
    for index, item in enumerate(results):
        hotel_name = item.get("hotel_name") or item.get("name") or "Hotel"
        city_name = item.get("city") or city or ""
        country_name = item.get("country_trans") or item.get("country") or country or ""
        area_name = item.get("district") or item.get("address") or city_name
        image = (
            item.get("main_photo_url")
            or item.get("photoMainUrl")
            or item.get("image")
            or "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80"
        )
        rating = item.get("review_score") or item.get("rating") or 0
        price = (
            item.get("min_total_price")
            or item.get("price")
            or item.get("gross_price")
            or item.get("min_price")
            or 0
        )

        hotels.append(
            {
                "id": str(item.get("hotel_id") or item.get("id") or f"rapid-{page}-{index}"),
                "name": hotel_name,
                "city": city_name,
                "country": country_name,
                "area": area_name,
                "price": _format_price(price),
                "currency": item.get("currencycode") or item.get("currency") or "GBP",
                "rating": round(float(rating), 1) if rating else 0,
                "image": image,
                "summary": item.get("wishlist_name")
                or item.get("unit_configuration_label")
                or "Live hotel result returned from global search inventory.",
            }
        )

    if not hotels:
        raise RuntimeError("RapidAPI returned no hotel results.")

    return {
        "source": "rapidapi",
        "count": len(hotels),
        "approx_total_results": int(total_results) if total_results else len(hotels),
        "hotels": hotels,
    }

def send_reservation_email(payload: ReservationRequest, reference: str) -> None:
    if not smtp_configured():
        raise RuntimeError("SMTP is not configured on the backend.")

    subject = f"Your Reservation Request Has Been Received – My Space Hotel"

    customer_html = f"""
    <html>
      <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#17315f;">
        <div style="max-width:680px;margin:0 auto;padding:28px;">
          <div style="background:linear-gradient(135deg,#1b4499 0%,#4f7ed9 100%);padding:34px;border-radius:26px;color:#ffffff;">
            <div style="font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;opacity:0.92;">My Space Hotel</div>
            <h1 style="margin:14px 0 8px 0;font-size:34px;line-height:1.15;">Your reservation request has been received</h1>
            <p style="margin:0;font-size:18px;line-height:1.6;color:#eef4ff;">
              Thank you for choosing My Space Hotel. Your request is now being reviewed and availability will be confirmed by email.
            </p>
          </div>

          <div style="background:#ffffff;border:1px solid #d8e4f4;border-radius:24px;padding:28px;margin-top:22px;">
            <h2 style="margin:0 0 18px 0;font-size:24px;color:#17315f;">Reservation summary</h2>
            <p style="margin:8px 0;"><strong>Reference:</strong> {reference}</p>
            <p style="margin:8px 0;"><strong>Hotel:</strong> {payload.hotel_name}</p>
            <p style="margin:8px 0;"><strong>Location:</strong> {payload.city}, {payload.country}</p>
            <p style="margin:8px 0;"><strong>Check-in:</strong> {payload.checkin_date}</p>
            <p style="margin:8px 0;"><strong>Check-out:</strong> {payload.checkout_date}</p>
            <p style="margin:8px 0;"><strong>Nights:</strong> {payload.nights}</p>
            <p style="margin:8px 0;"><strong>Displayed rate:</strong> {payload.currency} {payload.price:.2f}</p>
          </div>

          <div style="background:#ffffff;border:1px solid #d8e4f4;border-radius:24px;padding:28px;margin-top:22px;">
            <h2 style="margin:0 0 18px 0;font-size:24px;color:#17315f;">What happens next</h2>
            <p style="margin:0 0 10px 0;font-size:17px;line-height:1.7;">
              Your room request will be reviewed first. Payment is <strong>not</strong> requested at this stage.
            </p>
            <p style="margin:0 0 10px 0;font-size:17px;line-height:1.7;">
              Once availability is confirmed, we will contact you with the next booking step.
            </p>
            <p style="margin:0;font-size:17px;line-height:1.7;">
              For help, reply to this email or contact <strong>{SUPPORT_EMAIL}</strong>.
            </p>
          </div>

          <div style="padding:18px 6px;color:#6c7f9e;font-size:14px;line-height:1.7;">
            My Space Hotel · Global hotel search, clear comparison, and direct reservation handling.
          </div>
        </div>
      </body>
    </html>
    """

    admin_html = f"""
    <html>
      <body style="font-family:Arial,sans-serif;color:#17315f;">
        <h2>New reservation request received</h2>
        <p><strong>Reference:</strong> {reference}</p>
        <p><strong>Name:</strong> {payload.customer_name}</p>
        <p><strong>Email:</strong> {payload.customer_email}</p>
        <p><strong>Hotel:</strong> {payload.hotel_name}</p>
        <p><strong>Location:</strong> {payload.city}, {payload.country}</p>
        <p><strong>Check-in:</strong> {payload.checkin_date}</p>
        <p><strong>Check-out:</strong> {payload.checkout_date}</p>
        <p><strong>Nights:</strong> {payload.nights}</p>
        <p><strong>Displayed rate:</strong> {payload.currency} {payload.price:.2f}</p>
        <p><strong>Notes:</strong> {payload.notes or "-"}</p>
      </body>
    </html>
    """

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        if SMTP_USE_TLS:
            server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)

        customer_msg = MIMEMultipart("alternative")
        customer_msg["Subject"] = subject
        customer_msg["From"] = SUPPORT_EMAIL
        customer_msg["To"] = payload.customer_email
        customer_msg.attach(MIMEText(customer_html, "html"))
        server.sendmail(SUPPORT_EMAIL, [payload.customer_email], customer_msg.as_string())

        admin_msg = MIMEMultipart("alternative")
        admin_msg["Subject"] = f"New Reservation Request – {reference}"
        admin_msg["From"] = SUPPORT_EMAIL
        admin_msg["To"] = ADMIN_NOTIFICATION_EMAIL
        admin_msg.attach(MIMEText(admin_html, "html"))
        server.sendmail(SUPPORT_EMAIL, [ADMIN_NOTIFICATION_EMAIL], admin_msg.as_string())

@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "app": "My Space Hotel Booking API",
        "version": "2026-04-22-global-search-portal",
        "frontend_url": FRONTEND_URL,
        "smtp_configured": smtp_configured(),
        "support_email": SUPPORT_EMAIL,
        "admin_notification_email": ADMIN_NOTIFICATION_EMAIL,
        "rapidapi_configured": bool(RAPIDAPI_KEY and RAPIDAPI_HOST),
        "rapid_locations_path": RAPID_LOCATIONS_PATH,
        "rapid_hotels_path": RAPID_HOTELS_PATH,
    }

@app.get("/api/hotels")
def api_hotels(
    city: str = "London",
    country: str = "United Kingdom",
    area: str = "",
    checkin: str = "2026-04-25",
    checkout: str = "2026-04-26",
    adults: int = 1,
    page: int = 1,
) -> Dict[str, Any]:
    if RAPIDAPI_KEY and RAPIDAPI_HOST:
        try:
            return _search_rapid(city=city, country=country, checkin=checkin, checkout=checkout, adults=adults, page=page)
        except Exception as exc:
            return {
                "source": "rapidapi_error_fallback",
                "error": str(exc),
                **_fallback_search(city=city, country=country, area=area),
            }

    return _fallback_search(city=city, country=country, area=area)

@app.post("/reservations/request")
def reservation_request(payload: ReservationRequest) -> Dict[str, Any]:
    reference = f"MSH-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"

    email_sent = False
    email_error = ""

    try:
        send_reservation_email(payload, reference)
        email_sent = True
    except Exception as exc:
        email_error = str(exc)

    return {
        "success": True,
        "reservation_reference": reference,
        "email_sent": email_sent,
        "email_error": email_error,
        "message": "Reservation request received. Availability will be confirmed by email.",
    }