from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from typing import Optional, List
from pathlib import Path
import os
import math
import uuid
import sqlite3
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

# =========================================================
# ENV
# =========================================================
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587").strip() or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
EMAIL_USER = os.getenv("EMAIL_USER", "").strip()
SMTP_USER = SMTP_USERNAME or EMAIL_USER
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST", "").strip()

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
# GLOBAL CATALOGUE SEEDING
# This creates a large searchable internal database safely.
# It does NOT claim to be live supplier inventory.
# Rapid can replace/add real supplier records later.
# =========================================================
FACILITIES = [
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

COUNTRY_CITY_AREA_MAP = {
    "United Kingdom": {
        "currency": "GBP",
        "cities": {
            "London": ["Mayfair", "Westminster", "Soho", "Kensington", "Paddington", "Canary Wharf", "Chelsea", "Shoreditch"],
            "Manchester": ["City Centre", "Salford Quays", "Northern Quarter", "Deansgate"],
            "Birmingham": ["City Centre", "Jewellery Quarter", "Edgbaston", "Mailbox"],
            "Edinburgh": ["Old Town", "New Town", "Leith", "Haymarket"],
        },
    },
    "France": {
        "currency": "EUR",
        "cities": {
            "Paris": ["Champs-Elysees", "Le Marais", "Saint-Germain", "Montmartre", "Latin Quarter", "Opera"],
            "Nice": ["Promenade des Anglais", "Old Town", "Port Area", "City Centre"],
            "Lyon": ["Presquile", "Old Lyon", "Part-Dieu", "Confluence"],
        },
    },
    "United States": {
        "currency": "USD",
        "cities": {
            "New York": ["Midtown Manhattan", "SoHo", "Chelsea", "Times Square", "Financial District", "Upper West Side"],
            "Los Angeles": ["Hollywood", "Santa Monica", "Downtown LA", "Beverly Hills", "Venice"],
            "Miami": ["South Beach", "Downtown Miami", "Brickell", "Wynwood"],
            "Chicago": ["The Loop", "River North", "Magnificent Mile", "West Loop"],
        },
    },
    "United Arab Emirates": {
        "currency": "AED",
        "cities": {
            "Dubai": ["Downtown Dubai", "Dubai Marina", "Palm Jumeirah", "Business Bay", "Jumeirah Beach"],
            "Abu Dhabi": ["Corniche", "Yas Island", "Saadiyat Island", "City Centre"],
        },
    },
    "Nigeria": {
        "currency": "NGN",
        "cities": {
            "Lagos": ["Victoria Island", "Ikoyi", "Lekki", "Ikeja", "Yaba", "Surulere"],
            "Abuja": ["Maitama", "Wuse", "Garki", "Asokoro"],
            "Port Harcourt": ["GRA", "Old GRA", "Trans Amadi", "City Centre"],
        },
    },
    "Spain": {
        "currency": "EUR",
        "cities": {
            "Barcelona": ["Gothic Quarter", "Eixample", "Barceloneta", "Gracia", "Sants"],
            "Madrid": ["Gran Via", "Salamanca", "Sol", "Chueca", "Retiro"],
            "Valencia": ["Ciutat Vella", "Ruzafa", "Beach Area", "City Centre"],
        },
    },
    "Italy": {
        "currency": "EUR",
        "cities": {
            "Rome": ["Centro Storico", "Trastevere", "Vatican Area", "Termini", "Monti"],
            "Milan": ["Duomo", "Brera", "Navigli", "Porta Nuova"],
            "Venice": ["San Marco", "Cannaregio", "Dorsoduro", "Castello"],
        },
    },
    "Turkey": {
        "currency": "TRY",
        "cities": {
            "Istanbul": ["Sultanahmet", "Taksim", "Galata", "Besiktas", "Kadikoy"],
            "Antalya": ["Lara", "Kaleici", "Konyaalti", "City Centre"],
        },
    },
    "Japan": {
        "currency": "JPY",
        "cities": {
            "Tokyo": ["Shinjuku", "Shibuya", "Ginza", "Tokyo Station", "Ueno"],
            "Osaka": ["Namba", "Umeda", "Shinsaibashi", "Tennoji"],
            "Kyoto": ["Gion", "Kyoto Station", "Arashiyama", "Higashiyama"],
        },
    },
    "Singapore": {
        "currency": "SGD",
        "cities": {
            "Singapore": ["Marina Bay", "Orchard", "Sentosa", "Chinatown", "Bugis"],
        },
    },
    "Australia": {
        "currency": "AUD",
        "cities": {
            "Sydney": ["CBD", "Darling Harbour", "Bondi", "Circular Quay"],
            "Melbourne": ["CBD", "Southbank", "Docklands", "St Kilda"],
            "Brisbane": ["CBD", "South Bank", "Fortitude Valley", "Kangaroo Point"],
        },
    },
    "South Africa": {
        "currency": "ZAR",
        "cities": {
            "Cape Town": ["Waterfront", "Sea Point", "Camps Bay", "City Bowl"],
            "Johannesburg": ["Sandton", "Rosebank", "Melrose", "Fourways"],
        },
    },
}

HOTEL_PREFIXES = [
    "Grand",
    "Royal",
    "Central",
    "Elite",
    "Skyline",
    "Harbour",
    "Imperial",
    "Premier",
    "Signature",
    "Urban",
    "Landmark",
    "Prestige",
    "Golden",
    "Regency",
    "Crown",
    "Continental",
    "Metropolitan",
    "Vista",
    "Garden",
    "Riverside",
]

HOTEL_SUFFIXES = [
    "Palace",
    "Suites",
    "Hotel",
    "Residences",
    "Retreat",
    "Boutique Rooms",
    "Plaza",
    "Gateway Hotel",
    "Executive Stay",
    "Corner Hotel",
    "Collection",
    "Lodge",
    "Resort",
    "Inn",
    "House",
]

IMAGE_POOL = [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa",
    "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8",
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
    "https://images.unsplash.com/photo-1578683010236-d716f9a3f461",
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c",
    "https://images.unsplash.com/photo-1455587734955-081b22074882",
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4",
]

# Increase this later in stages.
# 50 per area creates thousands safely.
HOTELS_PER_AREA = 50


# =========================================================
# MODELS
# =========================================================
class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""


# =========================================================
# DATABASE
# =========================================================
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS hotels (
            id TEXT PRIMARY KEY,
            supplier TEXT NOT NULL,
            supplier_hotel_id TEXT NOT NULL,
            name TEXT NOT NULL,
            country TEXT NOT NULL,
            city TEXT NOT NULL,
            area TEXT NOT NULL,
            currency TEXT NOT NULL,
            price REAL NOT NULL,
            rating REAL NOT NULL,
            image TEXT,
            summary TEXT,
            facilities TEXT,
            source_note TEXT,
            UNIQUE(supplier, supplier_hotel_id)
        )
        """
    )

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS reservation_requests (
            request_id TEXT PRIMARY KEY,
            hotel_id TEXT,
            hotel_name TEXT,
            customer_name TEXT,
            customer_email TEXT,
            customer_message TEXT,
            support_sent INTEGER DEFAULT 0,
            customer_sent INTEGER DEFAULT 0,
            email_note TEXT DEFAULT ''
        )
        """
    )

    conn.commit()
    conn.close()


def count_hotels():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS total FROM hotels")
    total = cur.fetchone()["total"]
    conn.close()
    return int(total)


def build_facilities(index: int) -> List[str]:
    chosen = ["wifi", "restaurant"]
    for position, facility in enumerate(FACILITIES):
        if (index + position) % 3 == 0 or (index + position) % 5 == 0:
            chosen.append(facility)
    return list(dict.fromkeys(chosen))


def seed_database_if_small():
    current = count_hotels()

    # Do not rebuild every deploy if already seeded.
    expected_minimum = 5000
    if current >= expected_minimum:
        return current

    conn = get_conn()
    cur = conn.cursor()

    inserted = 0
    global_index = 0

    for country, country_data in COUNTRY_CITY_AREA_MAP.items():
        currency = country_data["currency"]

        for city, areas in country_data["cities"].items():
            for area in areas:
                for local_index in range(1, HOTELS_PER_AREA + 1):
                    global_index += 1
                    prefix = HOTEL_PREFIXES[global_index % len(HOTEL_PREFIXES)]
                    suffix = HOTEL_SUFFIXES[global_index % len(HOTEL_SUFFIXES)]
                    supplier_hotel_id = f"internal-{country}-{city}-{area}-{local_index}".lower().replace(" ", "-")
                    price_base = 70 + ((global_index * 7) % 340)
                    rating = round(7.8 + ((global_index % 22) / 10), 1)
                    facilities = build_facilities(global_index)

                    name = f"{prefix} {area} {suffix}"
                    summary = (
                        f"A searchable stay option in {area}, {city}, designed to help travellers "
                        f"compare location, facilities, and reservation choices with more confidence."
                    )

                    cur.execute(
                        """
                        INSERT OR IGNORE INTO hotels (
                            id, supplier, supplier_hotel_id, name, country, city, area,
                            currency, price, rating, image, summary, facilities, source_note
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            "internal_catalogue",
                            supplier_hotel_id,
                            name,
                            country,
                            city,
                            area,
                            currency,
                            float(price_base),
                            float(rating),
                            IMAGE_POOL[global_index % len(IMAGE_POOL)],
                            summary,
                            ",".join(facilities),
                            "Internal searchable catalogue. Supplier import can enrich this record later.",
                        ),
                    )
                    inserted += 1

    conn.commit()
    conn.close()

    return current + inserted


init_db()
seed_database_if_small()


# =========================================================
# EMAIL
# =========================================================
def email_ready():
    return all([SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SUPPORT_EMAIL])


def send_html_email(to_address: str, subject: str, html_body: str):
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
# ROUTES
# =========================================================
@app.get("/")
def root():
    return {
        "status": "running",
        "message": "My Space Hotel Backend Live",
        "hotels_in_database": count_hotels(),
        "search_example": "/api/hotels?country=United Kingdom&page=1&page_size=12",
    }


@app.get("/api/admin/catalogue-status")
def catalogue_status():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS total FROM hotels")
    total = cur.fetchone()["total"]

    cur.execute(
        """
        SELECT country, COUNT(*) AS count
        FROM hotels
        GROUP BY country
        ORDER BY count DESC
        """
    )
    countries = [{"country": row["country"], "count": row["count"]} for row in cur.fetchall()]

    cur.execute(
        """
        SELECT city, country, COUNT(*) AS count
        FROM hotels
        GROUP BY city, country
        ORDER BY count DESC
        LIMIT 100
        """
    )
    cities = [{"city": row["city"], "country": row["country"], "count": row["count"]} for row in cur.fetchall()]

    conn.close()

    return {
        "total_hotels": total,
        "countries_loaded": countries,
        "cities_loaded": cities,
        "rapid_ready": bool(RAPIDAPI_KEY),
        "email_ready": email_ready(),
        "pagination_ready": True,
    }


@app.get("/api/facilities")
def get_facilities():
    return {"facilities": FACILITIES}


@app.get("/api/hotels")
def search_hotels(
    country: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    area: Optional[str] = Query(None),
    facilities: Optional[str] = Query(None),
    adults: int = Query(2),
    page: int = Query(1),
    page_size: int = Query(12),
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
        where.append("LOWER(area) LIKE ?")
        params.append(f"%{area.strip().lower()}%")

    selected_facilities = []
    if facilities and facilities.strip():
        selected_facilities = [x.strip().lower() for x in facilities.split(",") if x.strip()]
        for facility in selected_facilities:
            where.append("LOWER(facilities) LIKE ?")
            params.append(f"%{facility}%")

    where_sql = ""
    if where:
        where_sql = "WHERE " + " AND ".join(where)

    conn = get_conn()
    cur = conn.cursor()

    cur.execute(f"SELECT COUNT(*) AS total FROM hotels {where_sql}", params)
    total = int(cur.fetchone()["total"])

    total_pages = max(1, math.ceil(total / safe_page_size))

    cur.execute(
        f"""
        SELECT *
        FROM hotels
        {where_sql}
        ORDER BY rating DESC, price ASC, name ASC
        LIMIT ? OFFSET ?
        """,
        params + [safe_page_size, offset],
    )

    rows = cur.fetchall()
    conn.close()

    hotels = []
    for row in rows:
        hotels.append(
            {
                "id": row["id"],
                "name": row["name"],
                "country": row["country"],
                "city": row["city"],
                "area": row["area"],
                "currency": row["currency"],
                "price": row["price"],
                "rating": row["rating"],
                "image": row["image"],
                "summary": row["summary"],
                "facilities": [x.strip() for x in (row["facilities"] or "").split(",") if x.strip()],
                "source_note": row["source_note"],
            }
        )

    return {
        "count": total,
        "page": safe_page,
        "page_size": safe_page_size,
        "total_pages": total_pages,
        "showing": len(hotels),
        "hotels": hotels,
        "search_used": {
            "country": country or "",
            "city": city or "",
            "area": area or "",
            "facilities": selected_facilities,
            "adults": adults,
        },
    }


@app.post("/api/request")
def request_booking(request: ReservationRequest):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM hotels WHERE id = ?", (request.hotel_id,))
    hotel = cur.fetchone()

    if not hotel:
        conn.close()
        return {
            "status": "error",
            "message": "The selected hotel could not be found. Please select another stay.",
        }

    request_id = str(uuid.uuid4())
    support_sent = 0
    customer_sent = 0
    email_note = ""

    if email_ready():
        try:
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
            send_html_email(
                SUPPORT_EMAIL,
                f"New reservation request • {hotel['name']} • {request_id}",
                support_html,
            )
            support_sent = 1

            customer_html = f"""
            <html>
              <body style="font-family: Arial, sans-serif; color: #12367c;">
                <h2>Your reservation request has been received</h2>
                <p>Thank you for choosing <strong>My Space Hotel</strong>.</p>
                <p>Your request has been received for <strong>{hotel['name']}</strong>.</p>
                <p><strong>Location:</strong> {hotel['area']}, {hotel['city']}, {hotel['country']}</p>
                <p><strong>Request ID:</strong> {request_id}</p>
                <p>We will continue with you using the email address you provided.</p>
              </body>
            </html>
            """
            send_html_email(
                request.email,
                f"Your My Space Hotel reservation request • {hotel['name']}",
                customer_html,
            )
            customer_sent = 1

        except Exception as exc:
            email_note = str(exc)
    else:
        email_note = "SMTP is not fully configured."

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
            request.name,
            request.email,
            request.message,
            support_sent,
            customer_sent,
            email_note,
        ),
    )

    conn.commit()
    conn.close()

    return {
        "status": "received",
        "message": "Your reservation request has been received. Please check your email for confirmation.",
        "request_id": request_id,
        "email_delivery": {
            "support_sent": bool(support_sent),
            "customer_sent": bool(customer_sent),
            "note": email_note,
        },
    }


@app.get("/api/admin/expand-internal-catalogue")
def expand_internal_catalogue():
    before = count_hotels()
    after = seed_database_if_small()
    return {
        "status": "checked",
        "before": before,
        "after": after,
        "added": max(0, after - before),
    }