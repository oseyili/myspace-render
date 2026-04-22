from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Any, Dict, List, Optional
from datetime import datetime
import os
import sqlite3
import uuid
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import requests
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="My Space Hotel Booking API")

# =========================================================
# CONFIG
# =========================================================
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").strip()

SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()
ADMIN_NOTIFICATION_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", SUPPORT_EMAIL).strip()

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587").strip() or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "").strip()
RAPIDAPI_AUTOCOMPLETE_URL = os.getenv("RAPIDAPI_AUTOCOMPLETE_URL", "").strip()
RAPIDAPI_PROPERTIES_URL = os.getenv("RAPIDAPI_PROPERTIES_URL", "").strip()

DB_PATH = os.path.join(os.path.dirname(__file__), "hotel_app.db")

# =========================================================
# CORS
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://myspace-hotel.com",
        "https://www.myspace-hotel.com",
        "https://myspace-hotel.vercel.app",
        FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# MODELS
# =========================================================
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
    notes: str = ""


# =========================================================
# DB
# =========================================================
def db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS reservation_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reservation_reference TEXT NOT NULL,
            hotel_id TEXT NOT NULL,
            hotel_name TEXT NOT NULL,
            city TEXT NOT NULL,
            country TEXT NOT NULL,
            checkin_date TEXT NOT NULL,
            checkout_date TEXT NOT NULL,
            nights INTEGER NOT NULL,
            price REAL NOT NULL,
            currency TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


init_db()

# =========================================================
# FALLBACK INVENTORY
# =========================================================
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
        "summary": "Stay close to leading attractions, fast transport, and dependable comfort in the heart of the city.",
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
        "summary": "River-facing rooms, business convenience, and strong transport links for a premium city stay.",
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
        "summary": "A smart base for theatre, shopping, dining, and efficient movement across central London.",
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
        "summary": "Comfort-focused rooms with reliable access to the business district and airport routes.",
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
        "summary": "Elegant surroundings, quiet comfort, and direct access to museums, parks, and refined dining.",
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
        "summary": "Excellent value for rail access, airport transfers, and flexible city travel planning.",
    },
    {
        "id": "ht-007",
        "name": "Mayfair Executive Stay",
        "city": "London",
        "country": "United Kingdom",
        "area": "Mayfair",
        "price": 310,
        "currency": "GBP",
        "rating": 9.1,
        "image": "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?auto=format&fit=crop&w=1400&q=80",
        "summary": "Polished luxury for high-value travel, premium comfort, and prestigious central positioning.",
    },
    {
        "id": "ht-008",
        "name": "Soho Corner Hotel",
        "city": "London",
        "country": "United Kingdom",
        "area": "Soho",
        "price": 205,
        "currency": "GBP",
        "rating": 8.6,
        "image": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1400&q=80",
        "summary": "Stylish rooms and energetic surroundings for guests who want nightlife, food, and city pace.",
    },
    {
        "id": "ht-009",
        "name": "Dubai Marina Horizon",
        "city": "Dubai",
        "country": "United Arab Emirates",
        "area": "Dubai Marina",
        "price": 290,
        "currency": "AED",
        "rating": 8.9,
        "image": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=80",
        "summary": "Modern waterfront comfort with skyline views, dining access, and a premium leisure atmosphere.",
    },
    {
        "id": "ht-010",
        "name": "Paris Left Bank House",
        "city": "Paris",
        "country": "France",
        "area": "Left Bank",
        "price": 240,
        "currency": "EUR",
        "rating": 8.7,
        "image": "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80",
        "summary": "Classic Paris charm with culture, cafés, and effortless access to major landmarks.",
    },
    {
        "id": "ht-011",
        "name": "New York Midtown Select",
        "city": "New York",
        "country": "United States",
        "area": "Midtown",
        "price": 325,
        "currency": "USD",
        "rating": 8.4,
        "image": "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=1400&q=80",
        "summary": "Strong Manhattan positioning for business trips, city breaks, and flexible urban itineraries.",
    },
    {
        "id": "ht-012",
        "name": "Cape Town Atlantic Stay",
        "city": "Cape Town",
        "country": "South Africa",
        "area": "Atlantic Seaboard",
        "price": 210,
        "currency": "ZAR",
        "rating": 8.8,
        "image": "https://images.unsplash.com/photo-1505692952047-1a78307da8f2?auto=format&fit=crop&w=1400&q=80",
        "summary": "Scenic coastal setting with high-comfort rooms and easy access to leisure destinations.",
    },
]

# =========================================================
# HELPERS
# =========================================================
def smtp_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD)


def format_money(value: float, currency: str) -> str:
    try:
        code = (currency or "").upper()
        symbols = {"GBP": "£", "USD": "$", "EUR": "€", "AED": "AED ", "ZAR": "R "}
        prefix = symbols.get(code, f"{code} ")
        if prefix.endswith(" "):
            return f"{prefix}{int(round(value))}"
        return f"{prefix}{int(round(value))}"
    except Exception:
        return f"{currency} {value}"


def send_email(to_email: str, subject: str, plain_text: str, html_body: str) -> Optional[str]:
    if not smtp_configured():
        return "SMTP is not configured."

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SUPPORT_EMAIL
    msg["To"] = to_email

    part1 = MIMEText(plain_text, "plain", "utf-8")
    part2 = MIMEText(html_body, "html", "utf-8")
    msg.attach(part1)
    msg.attach(part2)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            if SMTP_USE_TLS:
                server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SUPPORT_EMAIL, [to_email], msg.as_string())
        return None
    except Exception as exc:
        return str(exc)


def build_customer_email_html(reference: str, payload: ReservationRequest) -> str:
    displayed_price = format_money(payload.price, payload.currency)
    return f"""
    <html>
      <body style="margin:0;padding:0;background:#f4f7fc;font-family:Arial,sans-serif;color:#12367c;">
        <div style="max-width:700px;margin:0 auto;padding:32px;">
          <div style="background:linear-gradient(135deg,#1a3e92 0%,#2f58b6 50%,#69a3e3 100%);border-radius:28px;padding:34px;color:#ffffff;">
            <div style="font-size:14px;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:14px;">My Space Hotel</div>
            <div style="font-size:36px;line-height:1.15;font-weight:800;margin-bottom:10px;">Your reservation request has been received</div>
            <div style="font-size:18px;line-height:1.6;color:#eef5ff;">
              Thank you for choosing My Space Hotel. Your request is now being checked for availability.
            </div>
          </div>

          <div style="background:#ffffff;border:1px solid #dce6f5;border-radius:24px;padding:28px;margin-top:22px;">
            <div style="font-size:24px;font-weight:800;margin-bottom:16px;">Reservation details</div>
            <div style="font-size:16px;line-height:1.8;">
              <strong>Reference:</strong> {reference}<br/>
              <strong>Hotel:</strong> {payload.hotel_name}<br/>
              <strong>City:</strong> {payload.city}, {payload.country}<br/>
              <strong>Check-in:</strong> {payload.checkin_date}<br/>
              <strong>Check-out:</strong> {payload.checkout_date}<br/>
              <strong>Nights:</strong> {payload.nights}<br/>
              <strong>Displayed rate:</strong> {displayed_price}
            </div>
          </div>

          <div style="background:#ffffff;border:1px solid #dce6f5;border-radius:24px;padding:28px;margin-top:22px;">
            <div style="font-size:22px;font-weight:800;margin-bottom:14px;">What happens next</div>
            <div style="font-size:16px;line-height:1.8;color:#456287;">
              Your request will be reviewed and availability will be confirmed by email.<br/>
              No payment is required at this stage.<br/>
              If the selected room is available, you will receive the next booking step directly from My Space Hotel.
            </div>
          </div>

          <div style="padding:20px 4px 0;color:#5f769b;font-size:15px;line-height:1.8;">
            Need help? Reply to this email or contact <strong>{SUPPORT_EMAIL}</strong>.
          </div>
        </div>
      </body>
    </html>
    """


def build_customer_email_text(reference: str, payload: ReservationRequest) -> str:
    return (
        f"Your reservation request has been received.\n\n"
        f"Reference: {reference}\n"
        f"Hotel: {payload.hotel_name}\n"
        f"City: {payload.city}, {payload.country}\n"
        f"Check-in: {payload.checkin_date}\n"
        f"Check-out: {payload.checkout_date}\n"
        f"Nights: {payload.nights}\n"
        f"Displayed rate: {format_money(payload.price, payload.currency)}\n\n"
        f"No payment is required at this stage.\n"
        f"Availability will be checked and confirmed by email.\n\n"
        f"Support: {SUPPORT_EMAIL}"
    )


def fallback_search(city: str, country: str, area: str) -> Dict[str, Any]:
    city_q = (city or "").strip().lower()
    country_q = (country or "").strip().lower()
    area_q = (area or "").strip().lower()

    items = []
    for hotel in FALLBACK_HOTELS:
        if city_q and city_q not in hotel["city"].lower():
            continue
        if country_q and country_q not in hotel["country"].lower():
            continue
        if area_q and area_q not in hotel["area"].lower() and area_q not in hotel["name"].lower():
            continue
        items.append(hotel)

    if not items:
        items = FALLBACK_HOTELS[:8]

    return {
        "source": "fallback",
        "hotels": items,
        "meta": {
            "visible_count": len(items),
            "total_results": len(items),
            "using_live_inventory": False,
        },
    }


def pick_destination_id(raw: Any) -> Optional[str]:
    if isinstance(raw, list) and raw:
        item = raw[0]
        for key in ["dest_id", "id", "city_id"]:
            if key in item and item[key]:
                return str(item[key])
    if isinstance(raw, dict):
        for list_key in ["data", "results", "result"]:
            seq = raw.get(list_key)
            if isinstance(seq, list) and seq:
                item = seq[0]
                for key in ["dest_id", "id", "city_id"]:
                    if key in item and item[key]:
                        return str(item[key])
    return None


def map_rapid_hotel(item: Dict[str, Any], idx: int) -> Optional[Dict[str, Any]]:
    name = (
        item.get("hotel_name")
        or item.get("name")
        or item.get("property_name")
        or item.get("title")
    )
    if not name:
        return None

    city = (
        item.get("city")
        or item.get("city_name")
        or item.get("district")
        or item.get("address", "")
    )
    country = item.get("country") or item.get("country_trans") or ""
    area = item.get("district") or item.get("zip") or city or ""
    image = (
        item.get("main_photo_url")
        or item.get("image")
        or item.get("photo_url")
        or item.get("max_1440_photo_url")
        or ""
    )

    price = (
        item.get("min_total_price")
        or item.get("price")
        or item.get("gross_price")
        or item.get("price_breakdown", {}).get("gross_price")
        or 0
    )
    try:
        price = float(price)
    except Exception:
        price = 0.0

    currency = (
        item.get("currencycode")
        or item.get("currency")
        or item.get("currency_code")
        or "USD"
    )

    rating = item.get("review_score") or item.get("rating") or item.get("review")
    try:
        rating = float(rating) if rating is not None else 0.0
    except Exception:
        rating = 0.0

    summary = (
        item.get("review_score_word")
        or item.get("wishlist_name")
        or item.get("hotel_include_breakfast")
        or "Explore this stay and review its location, price, and guest rating."
    )
    if isinstance(summary, bool):
        summary = "Breakfast information available for this stay."

    hotel_id = str(
        item.get("hotel_id")
        or item.get("id")
        or item.get("property_id")
        or f"rapid-{idx}"
    )

    return {
        "id": hotel_id,
        "name": name,
        "city": city or "",
        "country": country or "",
        "area": area or "",
        "price": price if price > 0 else 0,
        "currency": currency,
        "rating": rating,
        "image": image,
        "summary": str(summary),
    }


def rapid_search(city: str, country: str, checkin: str, checkout: str, rooms: int, guests: int) -> Dict[str, Any]:
    if not (RAPIDAPI_KEY and RAPIDAPI_HOST and RAPIDAPI_AUTOCOMPLETE_URL and RAPIDAPI_PROPERTIES_URL):
        return fallback_search(city, country, "")

    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

    try:
        auto_resp = requests.get(
            RAPIDAPI_AUTOCOMPLETE_URL,
            headers=headers,
            params={"query": city or "London"},
            timeout=25,
        )
        auto_resp.raise_for_status()
        auto_data = auto_resp.json()
        dest_id = pick_destination_id(auto_data)

        if not dest_id:
            return fallback_search(city, country, "")

        props_resp = requests.get(
            RAPIDAPI_PROPERTIES_URL,
            headers=headers,
            params={
                "dest_id": dest_id,
                "search_type": "CITY",
                "arrival_date": checkin or "",
                "departure_date": checkout or "",
                "adults": guests or 1,
                "room_qty": rooms or 1,
                "page_number": 1,
            },
            timeout=35,
        )
        props_resp.raise_for_status()
        props_data = props_resp.json()

        raw_list = []
        if isinstance(props_data, dict):
            for key in ["data", "result", "results", "properties"]:
                if isinstance(props_data.get(key), list):
                    raw_list = props_data[key]
                    break
        elif isinstance(props_data, list):
            raw_list = props_data

        hotels: List[Dict[str, Any]] = []
        for idx, item in enumerate(raw_list[:40], start=1):
            if isinstance(item, dict):
                mapped = map_rapid_hotel(item, idx)
                if mapped:
                    hotels.append(mapped)

        if not hotels:
            return fallback_search(city, country, "")

        total_results = (
            props_data.get("total_count")
            or props_data.get("count")
            or props_data.get("total_results")
            or len(hotels)
        )
        try:
            total_results = int(total_results)
        except Exception:
            total_results = len(hotels)

        return {
            "source": "rapidapi",
            "hotels": hotels,
            "meta": {
                "visible_count": len(hotels),
                "total_results": total_results,
                "using_live_inventory": True,
            },
        }
    except Exception:
        return fallback_search(city, country, "")

# =========================================================
# ROUTES
# =========================================================
@app.get("/health")
def health():
    return {
        "ok": True,
        "app": "My Space Hotel Booking API",
        "version": "2026-04-22-global-portal",
        "frontend_url": FRONTEND_URL,
        "smtp_configured": smtp_configured(),
        "support_email": SUPPORT_EMAIL,
        "admin_notification_email": ADMIN_NOTIFICATION_EMAIL,
        "rapidapi_configured": bool(
            RAPIDAPI_KEY and RAPIDAPI_HOST and RAPIDAPI_AUTOCOMPLETE_URL and RAPIDAPI_PROPERTIES_URL
        ),
    }


@app.get("/api/hotels")
def api_hotels(
    city: str = "London",
    country: str = "",
    area: str = "",
    checkin: str = "",
    checkout: str = "",
    rooms: int = 1,
    guests: int = 1,
):
    data = rapid_search(city, country, checkin, checkout, rooms, guests)

    if area:
        area_q = area.strip().lower()
        filtered = []
        for hotel in data["hotels"]:
            if area_q in hotel["area"].lower() or area_q in hotel["name"].lower():
                filtered.append(hotel)
        if filtered:
            data["hotels"] = filtered
            data["meta"]["visible_count"] = len(filtered)

    return data


@app.post("/reservations/request")
def reservation_request(payload: ReservationRequest):
    reference = f"MSH-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6].upper()}"

    conn = db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO reservation_requests (
            reservation_reference, hotel_id, hotel_name, city, country,
            checkin_date, checkout_date, nights, price, currency,
            customer_name, customer_email, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            reference,
            payload.hotel_id,
            payload.hotel_name,
            payload.city,
            payload.country,
            payload.checkin_date,
            payload.checkout_date,
            payload.nights,
            payload.price,
            payload.currency,
            payload.customer_name,
            payload.customer_email,
            payload.notes,
            datetime.utcnow().isoformat(),
        ),
    )
    conn.commit()
    conn.close()

    plain_text = build_customer_email_text(reference, payload)
    html_body = build_customer_email_html(reference, payload)
    email_error = send_email(
        payload.customer_email,
        "Your Reservation Request Has Been Received – My Space Hotel",
        plain_text,
        html_body,
    )

    return {
        "success": True,
        "reservation_reference": reference,
        "email_sent": email_error is None,
        "email_error": email_error,
        "message": (
            "Reservation request received successfully."
            if email_error is None
            else "Reservation request received, but confirmation email could not be sent yet."
        ),
    }