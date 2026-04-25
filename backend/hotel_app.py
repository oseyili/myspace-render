from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
import os
import math
import uuid
import sqlite3
import smtplib
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hotel_catalog.db"

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = "apidojo-booking-v1.p.rapidapi.com"

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USER = os.getenv("SMTP_USERNAME", "").strip() or os.getenv("EMAIL_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()

app = FastAPI(title="My Space Hotel Backend - Real Hotel Database")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FACILITIES = [
    "wifi", "spa", "gym", "restaurant", "pool", "parking",
    "airport shuttle", "family rooms", "beach access", "business lounge",
]

class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""


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

    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_country ON hotels(country)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_city ON hotels(city)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_area ON hotels(area)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_name ON hotels(name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hotels_supplier_id ON hotels(supplier_hotel_id)")

    conn.commit()
    conn.close()


init_db()


def email_ready():
    return all([SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM])


def send_email(to_email, subject, html):
    if not email_ready():
        return False, "SMTP is not fully configured."

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


def get_destination(city: str):
    url = f"https://{RAPIDAPI_HOST}/locations/auto-complete"
    params = {"text": city, "languagecode": "en-us"}

    response = requests.get(url, headers=rapid_headers(), params=params, timeout=35)

    if response.status_code != 200:
        return None, f"Location API error {response.status_code}: {response.text[:300]}"

    data = response.json()

    if isinstance(data, dict):
        data = data.get("data") or data.get("result") or data.get("results") or []

    if not data:
        return None, "No destination found."

    best = None
    for item in data:
        if item.get("dest_id") and item.get("dest_type") in ["city", "district", "region"]:
            best = item
            break

    if not best:
        best = data[0]

    return {
        "dest_id": best.get("dest_id") or best.get("id") or best.get("ufi"),
        "dest_type": best.get("dest_type") or best.get("type") or "city",
        "label": best.get("label") or best.get("name") or city,
        "country": best.get("country") or "",
        "city_name": best.get("city_name") or city,
    }, ""


def find_hotel_list(data):
    if isinstance(data, list):
        return data

    if not isinstance(data, dict):
        return []

    paths = [
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

    for path in paths:
        current = data
        ok = True

        for key in path:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                ok = False
                break

        if ok and isinstance(current, list):
            return current

    for value in data.values():
        if isinstance(value, list) and value and isinstance(value[0], dict):
            return value
        if isinstance(value, dict):
            nested = find_hotel_list(value)
            if nested:
                return nested

    return []


def nested(obj, path, default=None):
    current = obj

    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        elif isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        else:
            return default

    return current if current not in [None, ""] else default


def clean_hotel(item, city_hint="", country_hint=""):
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

    city = item.get("city") or item.get("city_name") or location.get("city") or city_hint or ""
    country = item.get("country_trans") or item.get("country") or location.get("country") or country_hint or ""
    address = item.get("address") or nested(item, "basicPropertyData.location.address") or ""
    area = item.get("district") or item.get("district_name") or item.get("wishlistName") or address or city

    return {
        "id": f"rapid-{hotel_id}",
        "supplier": "rapidapi_booking",
        "supplier_hotel_id": str(hotel_id),
        "name": str(name),
        "country": str(country or ""),
        "city": str(city or ""),
        "area": str(area or ""),
        "address": str(address or ""),
        "currency": str(item.get("currencycode") or gross_price.get("currency") or "LOCAL").upper(),
        "price": item.get("min_total_price") or gross_price.get("value"),
        "rating": item.get("review_score") or item.get("reviewScore") or nested(item, "basicPropertyData.reviewScore.score"),
        "review_count": item.get("review_nr") or item.get("review_count") or nested(item, "basicPropertyData.reviewScore.reviewCount"),
        "image": image,
        "latitude": lat,
        "longitude": lng,
        "map_url": f"https://www.google.com/maps?q={lat},{lng}" if lat and lng else f"https://www.google.com/maps?q={name},{city},{country}",
        "source_note": "Real hotel imported from RapidAPI Booking provider.",
        "imported_at": datetime.utcnow().isoformat(),
    }


def save_hotels(hotels):
    if not hotels:
        return 0

    conn = get_conn()
    cur = conn.cursor()
    saved = 0

    for hotel in hotels:
        cur.execute("""
            INSERT OR REPLACE INTO hotels (
                id, supplier, supplier_hotel_id, name, country, city, area, address,
                currency, price, rating, review_count, image, latitude, longitude,
                map_url, source_note, imported_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            hotel["id"], hotel["supplier"], hotel["supplier_hotel_id"], hotel["name"],
            hotel["country"], hotel["city"], hotel["area"], hotel["address"],
            hotel["currency"], hotel["price"], hotel["rating"], hotel["review_count"],
            hotel["image"], hotel["latitude"], hotel["longitude"], hotel["map_url"],
            hotel["source_note"], hotel["imported_at"],
        ))

        saved += 1

    conn.commit()
    conn.close()
    return saved


def import_from_rapid(city: str, country: str = "", page: int = 1, page_size: int = 24):
    if not RAPIDAPI_KEY:
        return [], "RAPIDAPI_KEY is not configured."

    destination, error = get_destination(city)

    if error or not destination:
        return [], error or "Destination not found."

    arrival, departure = travel_dates()

    params = {
        "offset": max(0, (page - 1) * page_size),
        "arrival_date": arrival,
        "departure_date": departure,
        "guest_qty": 2,
        "children_qty": 0,
        "room_qty": 1,
        "search_type": destination["dest_type"],
        "dest_ids": destination["dest_id"],
        "price_filter_currencycode": "GBP" if (country or "").lower() in ["uk", "united kingdom", "gb", "england"] else "USD",
        "order_by": "popularity",
        "languagecode": "en-us",
        "units": "imperial",
        "timezone": "UTC",
    }

    response = requests.get(
        f"https://{RAPIDAPI_HOST}/properties/list",
        headers=rapid_headers(),
        params=params,
        timeout=40,
    )

    if response.status_code != 200:
        return [], f"RapidAPI property error {response.status_code}: {response.text[:500]}"

    data = response.json()
    raw_hotels = find_hotel_list(data)

    cleaned = []
    for item in raw_hotels[:page_size]:
        if isinstance(item, dict):
            hotel = clean_hotel(
                item,
                city_hint=destination.get("city_name") or city,
                country_hint=destination.get("country") or country,
            )
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
        "summary": f"Real hotel option in {row['city'] or 'this destination'} from the live supplier database.",
        "facilities": [],
        "fake_data": False,
    }


@app.get("/")
def root():
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) AS total FROM hotels").fetchone()["total"]
    conn.close()

    return {
        "status": "live",
        "database": "enabled",
        "hotel_source": "RapidAPI real hotels only",
        "fake_data": False,
        "rapidapi_key_loaded": bool(RAPIDAPI_KEY),
        "email_ready": email_ready(),
        "hotels_in_database": total,
    }


@app.get("/api/facilities")
def get_facilities():
    return {"facilities": FACILITIES}


@app.get("/api/admin/catalogue-status")
def catalogue_status():
    conn = get_conn()
    cur = conn.cursor()

    total = cur.execute("SELECT COUNT(*) AS total FROM hotels").fetchone()["total"]

    countries = [
        dict(row) for row in cur.execute("""
            SELECT country, COUNT(*) AS count
            FROM hotels
            GROUP BY country
            ORDER BY count DESC
            LIMIT 100
        """).fetchall()
    ]

    cities = [
        dict(row) for row in cur.execute("""
            SELECT city, country, COUNT(*) AS count
            FROM hotels
            GROUP BY city, country
            ORDER BY count DESC
            LIMIT 200
        """).fetchall()
    ]

    conn.close()

    return {
        "total_hotels": total,
        "countries_loaded": countries,
        "cities_loaded": cities,
        "fake_data": False,
        "rapidapi_key_loaded": bool(RAPIDAPI_KEY),
        "email_ready": email_ready(),
    }


@app.post("/api/admin/import-rapid")
def admin_import_rapid(
    city: str = Query(...),
    country: str = Query(""),
    pages: int = Query(1),
    page_size: int = Query(24),
):
    safe_pages = min(max(1, pages), 20)
    safe_page_size = min(max(1, page_size), 24)

    total_saved = 0
    last_error = ""

    for page_number in range(1, safe_pages + 1):
        hotels, error = import_from_rapid(city, country, page_number, safe_page_size)

        if error:
            last_error = error
            break

        total_saved += len(hotels)

    return {
        "status": "completed" if not last_error else "partial_or_failed",
        "city": city,
        "country": country,
        "pages": safe_pages,
        "saved": total_saved,
        "error": last_error,
        "fake_data": False,
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

    if country and country.strip():
        where.append("LOWER(country) LIKE ?")
        params.append(f"%{country.strip().lower()}%")

    if city and city.strip():
        where.append("LOWER(city) LIKE ?")
        params.append(f"%{city.strip().lower()}%")

    if area and area.strip():
        where.append("(LOWER(area) LIKE ? OR LOWER(address) LIKE ? OR LOWER(name) LIKE ?)")
        params.append(f"%{area.strip().lower()}%")
        params.append(f"%{area.strip().lower()}%")
        params.append(f"%{area.strip().lower()}%")

    where_sql = "WHERE " + " AND ".join(where) if where else ""

    conn = get_conn()
    cur = conn.cursor()

    total = int(cur.execute(f"SELECT COUNT(*) AS total FROM hotels {where_sql}", params).fetchone()["total"])

    if total == 0 and city and city.strip():
        conn.close()

        imported, error = import_from_rapid(city.strip(), country or "", safe_page, safe_page_size)

        if not imported:
            return {
                "count": 0,
                "page": safe_page,
                "page_size": safe_page_size,
                "total_pages": 0,
                "showing": 0,
                "hotels": [],
                "message": "No live hotels available from RapidAPI for this search yet.",
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
            "message": "Real hotels imported into the app database from RapidAPI.",
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

    hotels = [row_to_hotel(row) for row in rows]

    return {
        "count": total,
        "page": safe_page,
        "page_size": safe_page_size,
        "total_pages": max(1, math.ceil(total / safe_page_size)) if total else 0,
        "showing": len(hotels),
        "hotels": hotels,
        "fake_data": False,
    }


@app.post("/api/request")
def request_booking(request: ReservationRequest):
    conn = get_conn()
    cur = conn.cursor()

    hotel = cur.execute("SELECT * FROM hotels WHERE id = ?", (request.hotel_id,)).fetchone()

    if not hotel:
        conn.close()
        return {
            "status": "error",
            "message": "Hotel not found in the real app database. Please search again and select a live hotel.",
        }

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

    support_sent, support_note = send_email(
        SUPPORT_EMAIL,
        f"New reservation request - {hotel['name']}",
        support_html,
    )

    customer_sent, customer_note = send_email(
        request.email,
        f"Your My Space Hotel reservation request - {hotel['name']}",
        customer_html,
    )

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