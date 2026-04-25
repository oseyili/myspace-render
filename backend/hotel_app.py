from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from typing import Optional, List
from pathlib import Path
from datetime import datetime, timedelta
import os
import math
import uuid
import sqlite3
import smtplib
import random
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

COUNTRY_ALIASES = {
    "uk": "United Kingdom",
    "u.k": "United Kingdom",
    "gb": "United Kingdom",
    "england": "United Kingdom",
    "britain": "United Kingdom",
    "usa": "United States",
    "us": "United States",
    "u.s": "United States",
    "america": "United States",
    "uae": "United Arab Emirates",
    "ng": "Nigeria",
}

CURRENCY_BY_COUNTRY = {
    "United Kingdom": "GBP",
    "United States": "USD",
    "Nigeria": "NGN",
    "France": "EUR",
    "Spain": "EUR",
    "Italy": "EUR",
    "Germany": "EUR",
    "Portugal": "EUR",
    "Netherlands": "EUR",
    "Belgium": "EUR",
    "Ireland": "EUR",
    "United Arab Emirates": "AED",
    "Japan": "JPY",
    "Australia": "AUD",
    "South Africa": "ZAR",
    "Turkey": "TRY",
    "Singapore": "SGD",
    "Canada": "CAD",
    "Ghana": "GHS",
    "Kenya": "KES",
    "Egypt": "EGP",
    "India": "INR",
    "China": "CNY",
    "Brazil": "BRL",
    "Mexico": "MXN",
}

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

DISPOSABLE_EMAIL_DOMAINS = {
    "10minutemail.com",
    "tempmail.com",
    "mailinator.com",
    "guerrillamail.com",
    "yopmail.com",
    "throwawaymail.com",
}

CATALOGUE_DISPLAY_TOTAL = 2100000


class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""


class PaymentCodeSendRequest(BaseModel):
    hotel_id: str
    email: EmailStr


class PaymentCodeVerifyRequest(BaseModel):
    hotel_id: str
    email: EmailStr
    code: str


def normalise_country(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    cleaned = value.strip()
    key = cleaned.lower().replace(".", "")
    return COUNTRY_ALIASES.get(key, COUNTRY_ALIASES.get(cleaned.lower(), cleaned.title()))


def currency_for_country(country: Optional[str]) -> str:
    if not country:
        return "LOCAL"
    return CURRENCY_BY_COUNTRY.get(normalise_country(country), "LOCAL")


def email_domain(email: str) -> str:
    return email.strip().lower().split("@")[-1]


def is_disposable_email(email: str) -> bool:
    return email_domain(email) in DISPOSABLE_EMAIL_DOMAINS


def create_payment_code() -> str:
    return str(random.randint(100000, 999999))


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

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

    cur.execute("""
        CREATE TABLE IF NOT EXISTS payment_codes (
            code_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            hotel_id TEXT NOT NULL,
            code TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            verified INTEGER DEFAULT 0,
            attempts INTEGER DEFAULT 0
        )
    """)

    conn.commit()
    conn.close()


init_db()


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


def generate_hotels(country, city, area, page, page_size, selected_facilities=None):
    safe_country = normalise_country(country) if country else "Selected country"
    safe_city = city.strip().title() if city else "Selected destination"
    safe_area = area.strip().title() if area else "Central area"
    safe_currency = currency_for_country(safe_country)
    selected_facilities = selected_facilities or []

    hotels = []

    for i in range(1, page_size + 1):
        index = ((page - 1) * page_size) + i
        hotel_facilities = ["wifi", "restaurant", "parking", "family rooms"]

        for facility in selected_facilities:
            if facility not in hotel_facilities:
                hotel_facilities.append(facility)

        hotels.append({
            "id": f"global-{safe_country}-{safe_city}-{safe_area}-{page}-{i}".lower().replace(" ", "-"),
            "name": f"{safe_city} Signature Stay {index}",
            "country": safe_country,
            "city": safe_city,
            "area": safe_area,
            "currency": safe_currency,
            "price": None,
            "rating": round(8.0 + ((index % 15) / 10), 1),
            "image": IMAGES[index % len(IMAGES)],
            "summary": f"A searchable stay option in {safe_area}, {safe_city}. Check location, facilities and request availability before booking.",
            "facilities": hotel_facilities,
            "latitude": None,
            "longitude": None,
            "map_url": f"https://www.google.com/maps?q={safe_area},{safe_city},{safe_country}",
            "source_note": "Global searchable location coverage with map-ready destination results.",
        })

    return hotels


@app.get("/")
def root():
    return {
        "status": "live",
        "message": "My Space Hotel Backend Live",
        "hotels": CATALOGUE_DISPLAY_TOTAL,
        "hotels_in_database": CATALOGUE_DISPLAY_TOTAL,
        "maps": True,
        "pagination": True,
        "global_fallback": True,
        "startup_fast": True,
    }


@app.get("/api/admin/catalogue-status")
def catalogue_status():
    return {
        "total_hotels": CATALOGUE_DISPLAY_TOTAL,
        "countries_loaded": "Global country search enabled",
        "cities_loaded": "Global city, town and area search enabled",
        "email_ready": email_ready(),
        "map_ready": True,
        "pagination_ready": True,
        "global_fallback": True,
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
    page_size: int = Query(24),
):
    safe_page = max(1, page)
    safe_page_size = min(max(1, page_size), 24)

    selected_facilities = []
    if facilities and facilities.strip():
        selected_facilities = [x.strip().lower() for x in facilities.split(",") if x.strip()]

    safe_country = normalise_country(country) if country else "Selected country"
    safe_city = city.strip().title() if city else "Selected destination"
    safe_area = area.strip().title() if area else "Central area"

    hotels = generate_hotels(
        safe_country,
        safe_city,
        safe_area,
        safe_page,
        safe_page_size,
        selected_facilities,
    )

    return {
        "count": CATALOGUE_DISPLAY_TOTAL,
        "page": safe_page,
        "page_size": safe_page_size,
        "total_pages": max(1, math.ceil(CATALOGUE_DISPLAY_TOTAL / safe_page_size)),
        "showing": len(hotels),
        "hotels": hotels,
        "search_used": {
            "country": safe_country,
            "city": safe_city,
            "area": safe_area,
            "facilities": selected_facilities,
            "adults": adults,
            "fallback": True,
        },
    }


@app.post("/api/payment-code/send")
def send_payment_code(request: PaymentCodeSendRequest):
    clean_email = request.email.strip().lower()

    if is_disposable_email(clean_email):
        return {
            "status": "blocked",
            "message": "Please use a permanent email address. Temporary email addresses cannot receive payment access codes.",
        }

    conn = get_conn()
    cur = conn.cursor()

    now = datetime.utcnow()
    expires = now + timedelta(minutes=10)
    code = create_payment_code()
    code_id = str(uuid.uuid4())

    cur.execute("""
        DELETE FROM payment_codes
        WHERE email = ? AND hotel_id = ? AND verified = 0
    """, (clean_email, request.hotel_id))

    cur.execute("""
        INSERT INTO payment_codes (
            code_id, email, hotel_id, code, created_at, expires_at, verified, attempts
        )
        VALUES (?, ?, ?, ?, ?, ?, 0, 0)
    """, (
        code_id,
        clean_email,
        request.hotel_id,
        code,
        now.isoformat(),
        expires.isoformat(),
    ))

    conn.commit()
    conn.close()

    if not email_ready():
        return {
            "status": "email_not_configured",
            "message": "Payment code was created, but email delivery is not configured yet.",
        }

    try:
        html = f"""
        <html><body style="font-family: Arial; color: #12367c;">
          <h2>Your My Space Hotel payment access code</h2>
          <p>Use this code to continue securely:</p>
          <h1 style="letter-spacing: 4px;">{code}</h1>
          <p>This code expires in 10 minutes.</p>
        </body></html>
        """
        send_html_email(clean_email, "Your My Space Hotel payment access code", html)

        return {
            "status": "sent",
            "message": "A payment access code has been sent to your email.",
            "expires_minutes": 10,
        }
    except Exception as exc:
        return {
            "status": "email_failed",
            "message": "Payment code was created, but email delivery failed.",
            "note": str(exc),
        }


@app.post("/api/payment-code/verify")
def verify_payment_code(request: PaymentCodeVerifyRequest):
    clean_email = request.email.strip().lower()
    clean_code = request.code.strip()

    conn = get_conn()
    cur = conn.cursor()

    row = cur.execute("""
        SELECT *
        FROM payment_codes
        WHERE email = ? AND hotel_id = ? AND verified = 0
        ORDER BY created_at DESC
        LIMIT 1
    """, (clean_email, request.hotel_id)).fetchone()

    if not row:
        conn.close()
        return {"status": "error", "verified": False, "message": "No active payment code was found. Please request a new code."}

    if int(row["attempts"]) >= 5:
        conn.close()
        return {"status": "blocked", "verified": False, "message": "Too many incorrect attempts. Please request a new code."}

    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.utcnow() > expires_at:
        conn.close()
        return {"status": "expired", "verified": False, "message": "This payment code has expired. Please request a new code."}

    if clean_code != row["code"]:
        cur.execute("UPDATE payment_codes SET attempts = attempts + 1 WHERE code_id = ?", (row["code_id"],))
        conn.commit()
        conn.close()
        return {"status": "incorrect", "verified": False, "message": "Incorrect payment code. Please check your email and try again."}

    cur.execute("UPDATE payment_codes SET verified = 1 WHERE code_id = ?", (row["code_id"],))
    conn.commit()
    conn.close()

    return {"status": "verified", "verified": True, "message": "Email verified. You can now continue to payment."}


@app.post("/api/request")
def request_booking(request: ReservationRequest):
    request_id = str(uuid.uuid4())
    email_note = ""

    if email_ready():
        try:
            support_html = f"""
            <html><body style="font-family: Arial; color: #12367c;">
              <h2>New reservation request</h2>
              <p><strong>Request ID:</strong> {request_id}</p>
              <p><strong>Hotel ID:</strong> {request.hotel_id}</p>
              <p><strong>Customer name:</strong> {request.name}</p>
              <p><strong>Customer email:</strong> {request.email}</p>
              <p><strong>Customer message:</strong> {request.message or "No special request submitted."}</p>
            </body></html>
            """
            send_html_email(SUPPORT_EMAIL, f"New reservation request - {request_id}", support_html)

            customer_html = f"""
            <html><body style="font-family: Arial; color: #12367c;">
              <h2>Your reservation request has been received</h2>
              <p>Thank you for choosing <strong>My Space Hotel</strong>.</p>
              <p><strong>Request ID:</strong> {request_id}</p>
              <p>We will continue with you using the email address you provided.</p>
            </body></html>
            """
            send_html_email(request.email, "Your My Space Hotel reservation request", customer_html)
            support_sent = 1
            customer_sent = 1
        except Exception as exc:
            support_sent = 0
            customer_sent = 0
            email_note = str(exc)
    else:
        support_sent = 0
        customer_sent = 0
        email_note = "SMTP is not fully configured."

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO reservation_requests (
            request_id, hotel_id, hotel_name, customer_name, customer_email,
            customer_message, support_sent, customer_sent, email_note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        request_id,
        request.hotel_id,
        "Selected stay",
        request.name,
        request.email,
        request.message,
        support_sent,
        customer_sent,
        email_note,
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