from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import List
from dotenv import load_dotenv
import os
import math
import sqlite3
import requests
import uuid
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

load_dotenv()

# =========================================================
# ENV
# =========================================================
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "booking-com.p.rapidapi.com").strip()
RAPIDAPI_PROPERTIES_URL = os.getenv(
    "RAPIDAPI_PROPERTIES_URL",
    f"https://{RAPIDAPI_HOST}/properties/v2/list",
).strip()

# Email configuration
# Priority:
# 1) SMTP_USERNAME if present
# 2) EMAIL_USER as fallback
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587").strip() or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
EMAIL_USER = os.getenv("EMAIL_USER", "").strip()
SMTP_USER = SMTP_USERNAME or EMAIL_USER
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hotel_catalog.db"

# =========================================================
# APP
# =========================================================
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

# =========================================================
# CITY IMPORT CONFIG
# Add or correct destination references over time.
# =========================================================
CITY_IMPORT_CONFIG = {
    "london": {"dest_ids": "-2601889", "search_type": "city", "currency": "GBP"},
    "paris": {"dest_ids": "-1456928", "search_type": "city", "currency": "EUR"},
    "rome": {"dest_ids": "-126693", "search_type": "city", "currency": "EUR"},
    "barcelona": {"dest_ids": "-372490", "search_type": "city", "currency": "EUR"},
    "madrid": {"dest_ids": "-390625", "search_type": "city", "currency": "EUR"},
    "berlin": {"dest_ids": "-1746443", "search_type": "city", "currency": "EUR"},
    "amsterdam": {"dest_ids": "-2140479", "search_type": "city", "currency": "EUR"},
    "dubai": {"dest_ids": "-782831", "search_type": "city", "currency": "AED"},
    "istanbul": {"dest_ids": "-755070", "search_type": "city", "currency": "TRY"},
    "new york": {"dest_ids": "20088325", "search_type": "city", "currency": "USD"},
    "los angeles": {"dest_ids": "20014181", "search_type": "city", "currency": "USD"},
    "miami": {"dest_ids": "20023181", "search_type": "city", "currency": "USD"},
    "lagos": {"dest_ids": "-2014871", "search_type": "city", "currency": "NGN"},
    "cape town": {"dest_ids": "-1217214", "search_type": "city", "currency": "ZAR"},
    "singapore": {"dest_ids": "-73635", "search_type": "city", "currency": "SGD"},
    "bangkok": {"dest_ids": "-3414440", "search_type": "city", "currency": "THB"},
    "tokyo": {"dest_ids": "-246227", "search_type": "city", "currency": "JPY"},
    "sydney": {"dest_ids": "-1603135", "search_type": "city", "currency": "AUD"},
    "toronto": {"dest_ids": "-574890", "search_type": "city", "currency": "CAD"},
    "lisbon": {"dest_ids": "-2167973", "search_type": "city", "currency": "EUR"},
}

DEFAULT_FACILITIES = [
    "wifi",
    "spa",
    "gym",
    "restaurant",
    "pool",
    "parking",
    "airport shuttle",
    "family rooms",
    "beach access",
    "business lounge",
    "breakfast included",
    "city centre access",
]

# =========================================================
# MODELS
# =========================================================
class BookingRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""


# =========================================================
# DB
# =========================================================
def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS hotels (
            id TEXT PRIMARY KEY,
            supplier TEXT NOT NULL,
            supplier_hotel_id TEXT NOT NULL,
            name TEXT NOT NULL,
            city TEXT NOT NULL,
            area TEXT,
            country TEXT,
            currency TEXT,
            price REAL DEFAULT 0,
            rating REAL DEFAULT 0,
            image TEXT,
            summary TEXT,
            facilities TEXT,
            imported_from_city TEXT,
            UNIQUE(supplier, supplier_hotel_id)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS reservation_requests (
            request_id TEXT PRIMARY KEY,
            hotel_id TEXT NOT NULL,
            hotel_name TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_message TEXT,
            support_sent INTEGER DEFAULT 0,
            customer_sent INTEGER DEFAULT 0,
            email_note TEXT DEFAULT ''
        )
        """
    )

    conn.commit()
    conn.close()


init_db()

# =========================================================
# EMAIL
# =========================================================
def email_ready() -> bool:
    return all([
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USER,
        SMTP_PASSWORD,
        SMTP_FROM,
        SUPPORT_EMAIL,
    ])


def send_html_email(to_address: str, subject: str, html_body: str) -> None:
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


# =========================================================
# RAPID IMPORT
# =========================================================
def rapid_headers() -> dict:
    return {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }


def parse_rapid_hotels(payload: dict, imported_city: str, currency_code: str) -> List[dict]:
    raw_results: List[dict] = []

    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            raw_results = payload["data"]
        elif isinstance(payload.get("properties"), list):
            raw_results = payload["properties"]
        elif isinstance(payload.get("results"), list):
            raw_results = payload["results"]
        elif isinstance(payload.get("data"), dict):
            nested = payload["data"]
            if isinstance(nested.get("hotels"), list):
                raw_results = nested["hotels"]
            elif isinstance(nested.get("properties"), list):
                raw_results = nested["properties"]
            elif isinstance(nested.get("result"), list):
                raw_results = nested["result"]

    parsed: List[dict] = []

    for item in raw_results:
        if not isinstance(item, dict):
            continue

        supplier_hotel_id = str(
            item.get("hotel_id")
            or item.get("id")
            or item.get("property_id")
            or item.get("ufi")
            or uuid.uuid4()
        )

        name = (
            item.get("name")
            or item.get("hotel_name")
            or item.get("property_name")
            or "Hotel"
        )

        image = (
            item.get("photoMainUrl")
            or item.get("main_photo_url")
            or item.get("image")
            or item.get("max_1440_photo_url")
            or ""
        )

        area = (
            item.get("district")
            or item.get("address")
            or item.get("city")
            or imported_city.title()
        )

        country = (
            item.get("country")
            or item.get("country_trans")
            or ""
        )

        price = (
            item.get("price")
            or item.get("min_total_price")
            or item.get("gross_price")
            or item.get("price_breakdown", {}).get("gross_price")
            or 0
        )

        rating = (
            item.get("reviewScore")
            or item.get("review_score")
            or item.get("review_nr")
            or 0
        )

        facilities = DEFAULT_FACILITIES[:]
        if isinstance(item.get("hotel_facilities"), list) and item["hotel_facilities"]:
            facilities = [str(x).strip().lower() for x in item["hotel_facilities"] if str(x).strip()]

        summary = (
            item.get("wishlistName")
            or item.get("reviewScoreWord")
            or item.get("accessibilityLabel")
            or f"A globally sourced stay in {area} for travellers who want more clarity before they reserve."
        )

        def safe_float(value) -> float:
            try:
                return float(value)
            except Exception:
                return 0.0

        parsed.append(
            {
                "id": str(uuid.uuid4()),
                "supplier": "rapid_booking",
                "supplier_hotel_id": supplier_hotel_id,
                "name": name,
                "city": imported_city.title(),
                "area": area,
                "country": country,
                "currency": currency_code,
                "price": safe_float(price),
                "rating": safe_float(rating),
                "image": image,
                "summary": summary,
                "facilities": ",".join(facilities),
                "imported_from_city": imported_city.title(),
            }
        )

    return parsed


def upsert_hotels(hotels: List[dict]) -> int:
    conn = get_conn()
    cur = conn.cursor()
    inserted_or_updated = 0

    for hotel in hotels:
        cur.execute(
            """
            INSERT INTO hotels (
                id, supplier, supplier_hotel_id, name, city, area, country,
                currency, price, rating, image, summary, facilities, imported_from_city
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(supplier, supplier_hotel_id) DO UPDATE SET
                name=excluded.name,
                city=excluded.city,
                area=excluded.area,
                country=excluded.country,
                currency=excluded.currency,
                price=excluded.price,
                rating=excluded.rating,
                image=excluded.image,
                summary=excluded.summary,
                facilities=excluded.facilities,
                imported_from_city=excluded.imported_from_city
            """,
            (
                hotel["id"],
                hotel["supplier"],
                hotel["supplier_hotel_id"],
                hotel["name"],
                hotel["city"],
                hotel["area"],
                hotel["country"],
                hotel["currency"],
                hotel["price"],
                hotel["rating"],
                hotel["image"],
                hotel["summary"],
                hotel["facilities"],
                hotel["imported_from_city"],
            ),
        )
        inserted_or_updated += 1

    conn.commit()
    conn.close()
    return inserted_or_updated


def import_city_from_rapid(city: str, max_pages: int = 1) -> dict:
    key = city.strip().lower()
    config = CITY_IMPORT_CONFIG.get(key)

    if not config:
        return {
            "status": "error",
            "message": f"No Rapid import config exists yet for '{city}'.",
        }

    if not RAPIDAPI_KEY:
        return {
            "status": "error",
            "message": "RAPIDAPI_KEY is missing.",
        }

    total_processed = 0
    errors = []

    for page_number in range(1, max_pages + 1):
        offset = (page_number - 1) * 20

        params = {
            "offset": str(offset),
            "arrival_date": "2026-05-01",
            "departure_date": "2026-05-05",
            "room_qty": "1",
            "guest_qty": "1",
            "children_qty": "0",
            "dest_ids": config["dest_ids"],
            "search_type": config["search_type"],
            "price_filter_currencycode": config["currency"],
            "order_by": "popularity",
            "languagecode": "en-gb",
            "units": "metric",
        }

        response = requests.get(
            RAPIDAPI_PROPERTIES_URL,
            headers=rapid_headers(),
            params=params,
            timeout=45,
        )

        if response.status_code != 200:
            errors.append(
                {
                    "page": page_number,
                    "status_code": response.status_code,
                    "details": response.text[:300],
                }
            )
            continue

        parsed_hotels = parse_rapid_hotels(response.json(), key, config["currency"])
        total_processed += upsert_hotels(parsed_hotels)

    return {
        "status": "ok" if not errors else "partial",
        "city": city.title(),
        "processed": total_processed,
        "errors": errors,
    }


# =========================================================
# ROUTES
# =========================================================
@app.get("/")
def root():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS count FROM hotels")
    count = cur.fetchone()["count"]
    conn.close()

    return {
        "status": "running",
        "message": "My Space Hotel Backend Live",
        "hotels_in_database": count,
        "endpoints": {
            "search": "/api/hotels",
            "facilities": "/api/facilities",
            "reservation": "/api/request",
            "rapid_import": "/api/admin/import-city?city=London&max_pages=1",
        },
    }


@app.get("/api/facilities")
def get_facilities():
    return {"facilities": DEFAULT_FACILITIES}


@app.get("/api/hotels")
def search_hotels(
    city: str = Query(...),
    facilities: str = Query(""),
    page: int = Query(1),
    page_size: int = Query(12),
):
    selected = [f.strip().lower() for f in facilities.split(",") if f.strip()]
    search_city = f"%{city.strip().lower()}%"

    conn = get_conn()
    cur = conn.cursor()

    base_sql = """
        SELECT * FROM hotels
        WHERE lower(city) LIKE ?
    """
    params: List[object] = [search_city]

    if selected:
        for item in selected:
            base_sql += " AND lower(facilities) LIKE ?"
            params.append(f"%{item}%")

    count_sql = f"SELECT COUNT(*) AS count FROM ({base_sql})"
    cur.execute(count_sql, params)
    total = cur.fetchone()["count"]

    total_pages = max(1, math.ceil(total / page_size))
    safe_page = max(1, min(page, total_pages))
    offset = (safe_page - 1) * page_size

    final_sql = base_sql + " ORDER BY rating DESC, price ASC LIMIT ? OFFSET ?"
    final_params = params + [page_size, offset]
    cur.execute(final_sql, final_params)
    rows = cur.fetchall()
    conn.close()

    hotels = []
    for row in rows:
        hotels.append(
            {
                "id": row["id"],
                "name": row["name"],
                "city": row["city"],
                "area": row["area"],
                "country": row["country"],
                "price": row["price"],
                "currency": row["currency"],
                "rating": row["rating"],
                "image": row["image"],
                "summary": row["summary"],
                "facilities": [x.strip() for x in (row["facilities"] or "").split(",") if x.strip()],
            }
        )

    return {
        "count": total,
        "page": safe_page,
        "page_size": page_size,
        "total_pages": total_pages,
        "hotels": hotels,
    }


@app.post("/api/request")
def request_booking(request: BookingRequest):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM hotels WHERE id = ?", (request.hotel_id,))
    hotel = cur.fetchone()

    if not hotel:
        conn.close()
        return {
            "status": "error",
            "message": "The selected hotel could not be found.",
        }

    request_id = str(uuid.uuid4())
    support_sent = 0
    customer_sent = 0
    email_note = ""

    if email_ready():
        try:
            support_subject = f"New reservation request • {hotel['name']} • {request_id}"
            support_html = f"""
            <html>
              <body style="font-family: Arial, sans-serif; color: #12367c;">
                <h2>New reservation request</h2>
                <p><strong>Request ID:</strong> {request_id}</p>
                <p><strong>Hotel:</strong> {hotel['name']}</p>
                <p><strong>Location:</strong> {hotel['area']}, {hotel['city']}, {hotel['country']}</p>
                <p><strong>Displayed rate:</strong> {hotel['price']} {hotel['currency']}</p>
                <p><strong>Customer name:</strong> {request.name}</p>
                <p><strong>Customer email:</strong> {request.email}</p>
                <p><strong>Customer message:</strong> {request.message or "No special request submitted."}</p>
              </body>
            </html>
            """
            send_html_email(SUPPORT_EMAIL, support_subject, support_html)
            support_sent = 1

            customer_subject = f"Your My Space Hotel reservation request • {hotel['name']}"
            customer_html = f"""
            <html>
              <body style="font-family: Arial, sans-serif; color: #12367c;">
                <h2>Your reservation request has been received</h2>
                <p>Thank you for choosing <strong>My Space Hotel</strong>.</p>
                <p>Your request has been received for <strong>{hotel['name']}</strong>.</p>
                <p><strong>Location:</strong> {hotel['area']}, {hotel['city']}, {hotel['country']}</p>
                <p><strong>Request ID:</strong> {request_id}</p>
                <p>We will continue with you using the email address you provided.</p>
                <p>We appreciate the opportunity to help you choose the right stay with more confidence.</p>
              </body>
            </html>
            """
            send_html_email(request.email, customer_subject, customer_html)
            customer_sent = 1
        except Exception as exc:
            email_note = str(exc)
    else:
        email_note = (
            "SMTP is not fully configured. Required keys: SMTP_HOST, SMTP_PORT, "
            "SMTP_USERNAME or EMAIL_USER, SMTP_PASSWORD, SMTP_FROM, SUPPORT_EMAIL."
        )

    cur.execute(
        """
        INSERT INTO reservation_requests (
            request_id, hotel_id, hotel_name, customer_name, customer_email,
            customer_message, support_sent, customer_sent, email_note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            request_id,
            hotel["id"],
            hotel["name"],
            request.name.strip(),
            request.email.strip(),
            request.message.strip(),
            support_sent,
            customer_sent,
            email_note,
        ),
    )
    conn.commit()
    conn.close()

    if support_sent and customer_sent:
        return {
            "status": "received",
            "message": "Your reservation request has been received and confirmation emails have been sent.",
            "request_id": request_id,
            "email_delivery": {
                "support_sent": True,
                "customer_sent": True,
            },
        }

    return {
        "status": "received",
        "message": "Your reservation request has been received. We will continue with you shortly.",
        "request_id": request_id,
        "email_delivery": {
            "support_sent": bool(support_sent),
            "customer_sent": bool(customer_sent),
            "note": email_note,
        },
    }


@app.get("/api/admin/import-city")
def admin_import_city(
    city: str = Query(...),
    max_pages: int = Query(1),
):
    return import_city_from_rapid(city, max_pages)


@app.get("/api/admin/catalogue-status")
def catalogue_status():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS count FROM hotels")
    total_hotels = cur.fetchone()["count"]

    cur.execute(
        """
        SELECT imported_from_city, COUNT(*) AS count
        FROM hotels
        GROUP BY imported_from_city
        ORDER BY count DESC, imported_from_city ASC
        """
    )
    rows = cur.fetchall()
    conn.close()

    by_city = [{"city": row["imported_from_city"], "count": row["count"]} for row in rows]

    return {
        "total_hotels": total_hotels,
        "cities_loaded": by_city,
        "rapid_ready": bool(RAPIDAPI_KEY),
        "email_ready": email_ready(),
        "email_config_debug": {
            "smtp_host_present": bool(SMTP_HOST),
            "smtp_port_present": bool(SMTP_PORT),
            "smtp_username_present": bool(SMTP_USERNAME),
            "email_user_present": bool(EMAIL_USER),
            "smtp_user_effective_present": bool(SMTP_USER),
            "smtp_password_present": bool(SMTP_PASSWORD),
            "smtp_from_present": bool(SMTP_FROM),
            "support_email_present": bool(SUPPORT_EMAIL),
        },
    }