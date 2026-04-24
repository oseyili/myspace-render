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

FACILITIES = [
    "wifi", "spa", "gym", "restaurant", "pool", "parking",
    "airport shuttle", "family rooms", "beach access",
    "business lounge", "breakfast included", "city centre access",
]

COUNTRIES = {
    "United Kingdom": {
        "currency": "GBP",
        "cities": {
            "London": (51.5072, -0.1276, ["Mayfair", "Westminster", "Soho", "Kensington", "Paddington", "Canary Wharf", "Chelsea", "Shoreditch"]),
            "Manchester": (53.4808, -2.2426, ["City Centre", "Salford Quays", "Northern Quarter", "Deansgate"]),
            "Birmingham": (52.4862, -1.8904, ["City Centre", "Jewellery Quarter", "Edgbaston", "Mailbox"]),
            "Edinburgh": (55.9533, -3.1883, ["Old Town", "New Town", "Leith", "Haymarket"]),
        },
    },
    "United States": {
        "currency": "USD",
        "cities": {
            "New York": (40.7128, -74.0060, ["Midtown Manhattan", "SoHo", "Chelsea", "Times Square", "Financial District", "Upper West Side"]),
            "Los Angeles": (34.0522, -118.2437, ["Hollywood", "Santa Monica", "Downtown LA", "Beverly Hills", "Venice"]),
            "Miami": (25.7617, -80.1918, ["South Beach", "Downtown Miami", "Brickell", "Wynwood"]),
            "Chicago": (41.8781, -87.6298, ["The Loop", "River North", "Magnificent Mile", "West Loop"]),
        },
    },
    "France": {
        "currency": "EUR",
        "cities": {
            "Paris": (48.8566, 2.3522, ["Champs-Elysees", "Le Marais", "Saint-Germain", "Montmartre", "Latin Quarter", "Opera"]),
            "Nice": (43.7102, 7.2620, ["Promenade des Anglais", "Old Town", "Port Area", "City Centre"]),
            "Lyon": (45.7640, 4.8357, ["Presquile", "Old Lyon", "Part-Dieu", "Confluence"]),
        },
    },
    "Nigeria": {
        "currency": "NGN",
        "cities": {
            "Lagos": (6.5244, 3.3792, ["Victoria Island", "Ikoyi", "Lekki", "Ikeja", "Yaba", "Surulere"]),
            "Abuja": (9.0765, 7.3986, ["Maitama", "Wuse", "Garki", "Asokoro"]),
            "Port Harcourt": (4.8156, 7.0498, ["GRA", "Old GRA", "Trans Amadi", "City Centre"]),
        },
    },
    "United Arab Emirates": {
        "currency": "AED",
        "cities": {
            "Dubai": (25.2048, 55.2708, ["Downtown Dubai", "Dubai Marina", "Palm Jumeirah", "Business Bay", "Jumeirah Beach"]),
            "Abu Dhabi": (24.4539, 54.3773, ["Corniche", "Yas Island", "Saadiyat Island", "City Centre"]),
        },
    },
    "Spain": {
        "currency": "EUR",
        "cities": {
            "Barcelona": (41.3874, 2.1686, ["Gothic Quarter", "Eixample", "Barceloneta", "Gracia", "Sants"]),
            "Madrid": (40.4168, -3.7038, ["Gran Via", "Salamanca", "Sol", "Chueca", "Retiro"]),
            "Valencia": (39.4699, -0.3763, ["Ciutat Vella", "Ruzafa", "Beach Area", "City Centre"]),
        },
    },
    "Italy": {
        "currency": "EUR",
        "cities": {
            "Rome": (41.9028, 12.4964, ["Centro Storico", "Trastevere", "Vatican Area", "Termini", "Monti"]),
            "Milan": (45.4642, 9.1900, ["Duomo", "Brera", "Navigli", "Porta Nuova"]),
            "Venice": (45.4408, 12.3155, ["San Marco", "Cannaregio", "Dorsoduro", "Castello"]),
        },
    },
    "Japan": {
        "currency": "JPY",
        "cities": {
            "Tokyo": (35.6762, 139.6503, ["Shinjuku", "Shibuya", "Ginza", "Tokyo Station", "Ueno"]),
            "Osaka": (34.6937, 135.5023, ["Namba", "Umeda", "Shinsaibashi", "Tennoji"]),
            "Kyoto": (35.0116, 135.7681, ["Gion", "Kyoto Station", "Arashiyama", "Higashiyama"]),
        },
    },
    "Australia": {
        "currency": "AUD",
        "cities": {
            "Sydney": (-33.8688, 151.2093, ["CBD", "Darling Harbour", "Bondi", "Circular Quay"]),
            "Melbourne": (-37.8136, 144.9631, ["CBD", "Southbank", "Docklands", "St Kilda"]),
            "Brisbane": (-27.4698, 153.0251, ["CBD", "South Bank", "Fortitude Valley", "Kangaroo Point"]),
        },
    },
    "South Africa": {
        "currency": "ZAR",
        "cities": {
            "Cape Town": (-33.9249, 18.4241, ["Waterfront", "Sea Point", "Camps Bay", "City Bowl"]),
            "Johannesburg": (-26.2041, 28.0473, ["Sandton", "Rosebank", "Melrose", "Fourways"]),
        },
    },
    "Turkey": {
        "currency": "TRY",
        "cities": {
            "Istanbul": (41.0082, 28.9784, ["Sultanahmet", "Taksim", "Galata", "Besiktas", "Kadikoy"]),
            "Antalya": (36.8969, 30.7133, ["Lara", "Kaleici", "Konyaalti", "City Centre"]),
        },
    },
    "Singapore": {
        "currency": "SGD",
        "cities": {
            "Singapore": (1.3521, 103.8198, ["Marina Bay", "Orchard", "Sentosa", "Chinatown", "Bugis"]),
        },
    },
}

COUNTRY_ALIASES = {
    "uk": "United Kingdom", "u.k": "United Kingdom", "gb": "United Kingdom", "england": "United Kingdom",
    "usa": "United States", "us": "United States", "u.s": "United States", "america": "United States",
    "uae": "United Arab Emirates", "u.a.e": "United Arab Emirates", "emirates": "United Arab Emirates",
    "ng": "Nigeria", "sa": "South Africa",
}

PREFIXES = ["Grand", "Royal", "Central", "Elite", "Skyline", "Harbour", "Imperial", "Premier", "Signature", "Urban", "Landmark", "Prestige", "Golden", "Regency", "Crown", "Continental", "Metropolitan", "Vista", "Garden", "Riverside"]
SUFFIXES = ["Palace", "Suites", "Hotel", "Residences", "Retreat", "Boutique Rooms", "Plaza", "Gateway Hotel", "Executive Stay", "Corner Hotel", "Collection", "Lodge", "Resort", "Inn", "House"]
IMAGES = [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa",
    "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8",
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
    "https://images.unsplash.com/photo-1578683010236-d716f9a3f461",
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c",
    "https://images.unsplash.com/photo-1455587734955-081b22074882",
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4",
]

HOTELS_PER_AREA = 250


class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""


def normalise_country(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    key = value.strip().lower()
    return COUNTRY_ALIASES.get(key, value.strip())


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
            country TEXT NOT NULL,
            city TEXT NOT NULL,
            area TEXT NOT NULL,
            currency TEXT NOT NULL,
            price REAL NOT NULL,
            rating REAL NOT NULL,
            image TEXT,
            summary TEXT,
            facilities TEXT,
            latitude REAL,
            longitude REAL,
            map_url TEXT,
            source_note TEXT,
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
            email_note TEXT DEFAULT ''
        )
    """)

    existing_cols = [row["name"] for row in cur.execute("PRAGMA table_info(hotels)").fetchall()]
    for col_name, col_type in [
        ("latitude", "REAL"),
        ("longitude", "REAL"),
        ("map_url", "TEXT"),
    ]:
        if col_name not in existing_cols:
            cur.execute(f"ALTER TABLE hotels ADD COLUMN {col_name} {col_type}")

    conn.commit()
    conn.close()


def count_hotels():
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) AS total FROM hotels").fetchone()["total"]
    conn.close()
    return int(total)


def build_facilities(index: int) -> List[str]:
    chosen = ["wifi", "restaurant"]
    for position, facility in enumerate(FACILITIES):
        if (index + position) % 3 == 0 or (index + position) % 5 == 0:
            chosen.append(facility)
    return list(dict.fromkeys(chosen))


def offset_coord(base: float, index: int, scale: float) -> float:
    return round(base + (((index % 17) - 8) * scale), 6)


def seed_database():
    conn = get_conn()
    cur = conn.cursor()

    inserted = 0
    global_index = 0

    for country, country_data in COUNTRIES.items():
        currency = country_data["currency"]

        for city, city_data in country_data["cities"].items():
            base_lat, base_lng, areas = city_data

            for area in areas:
                for local_index in range(1, HOTELS_PER_AREA + 1):
                    global_index += 1

                    supplier_hotel_id = f"internal-{country}-{city}-{area}-{local_index}".lower().replace(" ", "-")
                    prefix = PREFIXES[global_index % len(PREFIXES)]
                    suffix = SUFFIXES[global_index % len(SUFFIXES)]
                    name = f"{prefix} {area} {suffix}"
                    price = float(70 + ((global_index * 7) % 460))
                    rating = round(7.8 + ((global_index % 22) / 10), 1)
                    lat = offset_coord(base_lat, global_index, 0.003)
                    lng = offset_coord(base_lng, global_index * 2, 0.003)
                    map_url = f"https://www.google.com/maps?q={lat},{lng}"

                    summary = (
                        f"A well-positioned stay in {area}, {city}, giving travellers a clearer way "
                        f"to compare location, facilities, comfort, and reservation choices before they request availability."
                    )

                    cur.execute("""
                        INSERT OR IGNORE INTO hotels (
                            id, supplier, supplier_hotel_id, name, country, city, area,
                            currency, price, rating, image, summary, facilities,
                            latitude, longitude, map_url, source_note
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        str(uuid.uuid4()),
                        "internal_catalogue",
                        supplier_hotel_id,
                        name,
                        country,
                        city,
                        area,
                        currency,
                        price,
                        rating,
                        IMAGES[global_index % len(IMAGES)],
                        summary,
                        ",".join(build_facilities(global_index)),
                        lat,
                        lng,
                        map_url,
                        "Internal searchable catalogue. Supplier import can enrich this record later.",
                    ))

                    if cur.rowcount:
                        inserted += 1

    conn.commit()
    conn.close()
    return inserted


init_db()
seed_database()


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


@app.get("/")
def root():
    return {
        "status": "running",
        "message": "My Space Hotel Backend Live",
        "hotels_in_database": count_hotels(),
        "map_ready": True,
        "pagination_ready": True,
    }


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
        """).fetchall()
    ]

    cities = [
        dict(row) for row in cur.execute("""
            SELECT city, country, COUNT(*) AS count
            FROM hotels
            GROUP BY city, country
            ORDER BY count DESC
            LIMIT 100
        """).fetchall()
    ]

    conn.close()

    return {
        "total_hotels": total,
        "countries_loaded": countries,
        "cities_loaded": cities,
        "rapid_ready": bool(RAPIDAPI_KEY),
        "email_ready": email_ready(),
        "map_ready": True,
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
    country = normalise_country(country)

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

    where_sql = "WHERE " + " AND ".join(where) if where else ""

    conn = get_conn()
    cur = conn.cursor()

    total = int(cur.execute(f"SELECT COUNT(*) AS total FROM hotels {where_sql}", params).fetchone()["total"])
    total_pages = max(1, math.ceil(total / safe_page_size))

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

    hotels = []
    for row in rows:
        hotels.append({
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
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "map_url": row["map_url"],
            "source_note": row["source_note"],
        })

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
    hotel = cur.execute("SELECT * FROM hotels WHERE id = ?", (request.hotel_id,)).fetchone()

    if not hotel:
        conn.close()
        return {"status": "error", "message": "The selected hotel could not be found. Please select another stay."}

    request_id = str(uuid.uuid4())
    support_sent = 0
    customer_sent = 0
    email_note = ""

    if email_ready():
        try:
            support_html = f"""
            <html><body style="font-family: Arial; color: #12367c;">
              <h2>New reservation request</h2>
              <p><strong>Request ID:</strong> {request_id}</p>
              <p><strong>Hotel:</strong> {hotel['name']}</p>
              <p><strong>Location:</strong> {hotel['area']}, {hotel['city']}, {hotel['country']}</p>
              <p><strong>Displayed rate:</strong> {hotel['price']} {hotel['currency']}</p>
              <p><strong>Map:</strong> {hotel['map_url']}</p>
              <p><strong>Customer name:</strong> {request.name}</p>
              <p><strong>Customer email:</strong> {request.email}</p>
              <p><strong>Customer message:</strong> {request.message or "No special request submitted."}</p>
            </body></html>
            """
            send_html_email(SUPPORT_EMAIL, f"New reservation request - {hotel['name']} - {request_id}", support_html)
            support_sent = 1

            customer_html = f"""
            <html><body style="font-family: Arial; color: #12367c;">
              <h2>Your reservation request has been received</h2>
              <p>Thank you for choosing <strong>My Space Hotel</strong>.</p>
              <p>Your request has been received for <strong>{hotel['name']}</strong>.</p>
              <p><strong>Location:</strong> {hotel['area']}, {hotel['city']}, {hotel['country']}</p>
              <p><strong>Request ID:</strong> {request_id}</p>
              <p>We will continue with you using the email address you provided.</p>
            </body></html>
            """
            send_html_email(request.email, f"Your My Space Hotel reservation request - {hotel['name']}", customer_html)
            customer_sent = 1
        except Exception as exc:
            email_note = str(exc)
    else:
        email_note = "SMTP is not fully configured."

    cur.execute("""
        INSERT INTO reservation_requests (
            request_id, hotel_id, hotel_name, customer_name, customer_email,
            customer_message, support_sent, customer_sent, email_note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        request_id, hotel["id"], hotel["name"], request.name, request.email,
        request.message, support_sent, customer_sent, email_note,
    ))

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
    added = seed_database()
    after = count_hotels()
    return {"status": "expanded", "before": before, "after": after, "added": added}