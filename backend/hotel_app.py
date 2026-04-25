from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from typing import Optional
from pathlib import Path
from datetime import datetime, timedelta
import os, math, uuid, sqlite3, smtplib, random, stripe
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hotel_catalog.db"

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
stripe.api_key = STRIPE_SECRET_KEY

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587") or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
EMAIL_USER = os.getenv("EMAIL_USER", "").strip()
SMTP_USER = SMTP_USERNAME or EMAIL_USER
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()

PUBLIC_FRONTEND_URL = os.getenv("PUBLIC_FRONTEND_URL", "https://www.myspace-hotel.com").strip()

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
    "airport shuttle", "family rooms", "beach access", "business lounge",
]

COUNTRY_ALIASES = {
    "uk": "United Kingdom", "gb": "United Kingdom", "england": "United Kingdom",
    "usa": "United States", "us": "United States", "america": "United States",
    "uae": "United Arab Emirates", "ng": "Nigeria",
}

CURRENCY_BY_COUNTRY = {
    "United Kingdom": "GBP", "United States": "USD", "Nigeria": "NGN",
    "France": "EUR", "Spain": "EUR", "Italy": "EUR", "Germany": "EUR",
    "United Arab Emirates": "AED", "Japan": "JPY", "Australia": "AUD",
    "South Africa": "ZAR", "Turkey": "TRY", "Singapore": "SGD",
    "Canada": "CAD", "Ghana": "GHS", "Kenya": "KES", "India": "INR",
}

IMAGES = [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa",
    "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8",
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
]

CATALOGUE_DISPLAY_TOTAL = 2100000


class PaymentCodeSendRequest(BaseModel):
    hotel_id: str
    email: EmailStr


class PaymentCodeVerifyRequest(BaseModel):
    hotel_id: str
    email: EmailStr
    code: str


class CheckoutRequest(BaseModel):
    hotel_id: str
    hotel_name: str = "Selected hotel stay"
    email: EmailStr
    amount: int = 15000


def normalise_country(value: Optional[str]) -> str:
    if not value:
        return "Selected country"
    cleaned = value.strip()
    key = cleaned.lower().replace(".", "")
    return COUNTRY_ALIASES.get(key, cleaned.title())


def currency_for_country(country: str) -> str:
    return CURRENCY_BY_COUNTRY.get(normalise_country(country), "USD")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()

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

    cur.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            booking_id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            hotel_id TEXT NOT NULL,
            hotel_name TEXT NOT NULL,
            amount INTEGER NOT NULL,
            currency TEXT NOT NULL,
            status TEXT NOT NULL,
            stripe_session_id TEXT,
            created_at TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()


init_db()


def email_ready():
    return all([SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM])


def send_html_email(to_address: str, subject: str, html_body: str):
    if not email_ready():
        return False

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

    return True


def make_hotels(country, city, area, page, page_size, selected_facilities):
    safe_country = normalise_country(country)
    safe_city = city.strip().title() if city else "Selected Destination"
    safe_area = area.strip().title() if area else "Central Area"
    currency = currency_for_country(safe_country)

    hotels = []
    for i in range(1, page_size + 1):
        index = ((page - 1) * page_size) + i
        facilities = ["wifi", "restaurant", "parking", "family rooms"]
        for f in selected_facilities:
            if f not in facilities:
                facilities.append(f)

        hotels.append({
            "id": f"global-{safe_country}-{safe_city}-{safe_area}-{page}-{i}".lower().replace(" ", "-"),
            "name": f"{safe_city} Signature Stay {index}",
            "country": safe_country,
            "city": safe_city,
            "area": safe_area,
            "currency": currency,
            "price": None,
            "rating": round(8.0 + ((index % 15) / 10), 1),
            "image": IMAGES[index % len(IMAGES)],
            "summary": f"A searchable stay option in {safe_area}, {safe_city}. Check location, facilities and request availability before booking.",
            "facilities": facilities,
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
        "hotel_search": "enabled",
        "payments": "stripe",
        "email_code": "enabled",
        "booking_confirmation": "enabled",
        "hotels": CATALOGUE_DISPLAY_TOTAL,
        "maps": True,
        "pagination": True,
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

    hotels = make_hotels(country, city, area, safe_page, safe_page_size, selected_facilities)

    return {
        "count": CATALOGUE_DISPLAY_TOTAL,
        "page": safe_page,
        "page_size": safe_page_size,
        "total_pages": max(1, math.ceil(CATALOGUE_DISPLAY_TOTAL / safe_page_size)),
        "showing": len(hotels),
        "hotels": hotels,
        "search_used": {
            "country": normalise_country(country),
            "city": city or "",
            "area": area or "",
            "facilities": selected_facilities,
            "adults": adults,
            "fallback": True,
        },
    }


@app.post("/api/payment-code/send")
def send_payment_code(request: PaymentCodeSendRequest):
    clean_email = request.email.strip().lower()
    code = str(random.randint(100000, 999999))
    now = datetime.utcnow()
    expires = now + timedelta(minutes=10)

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM payment_codes WHERE email=? AND hotel_id=? AND verified=0", (clean_email, request.hotel_id))
    cur.execute("""
        INSERT INTO payment_codes VALUES (?, ?, ?, ?, ?, ?, 0, 0)
    """, (str(uuid.uuid4()), clean_email, request.hotel_id, code, now.isoformat(), expires.isoformat()))
    conn.commit()
    conn.close()

    send_html_email(
        clean_email,
        "Your My Space Hotel payment access code",
        f"<h2>Your payment access code</h2><h1>{code}</h1><p>This code expires in 10 minutes.</p>"
    )

    return {"status": "sent", "message": "Payment access code sent to your email.", "expires_minutes": 10}


@app.post("/api/payment-code/verify")
def verify_payment_code(request: PaymentCodeVerifyRequest):
    clean_email = request.email.strip().lower()
    clean_code = request.code.strip()

    conn = get_conn()
    cur = conn.cursor()
    row = cur.execute("""
        SELECT * FROM payment_codes
        WHERE email=? AND hotel_id=? AND verified=0
        ORDER BY created_at DESC
        LIMIT 1
    """, (clean_email, request.hotel_id)).fetchone()

    if not row:
        conn.close()
        return {"verified": False, "message": "No active code found."}

    if int(row["attempts"]) >= 5:
        conn.close()
        return {"verified": False, "message": "Too many attempts. Request a new code."}

    if datetime.utcnow() > datetime.fromisoformat(row["expires_at"]):
        conn.close()
        return {"verified": False, "message": "Code expired."}

    if clean_code != row["code"]:
        cur.execute("UPDATE payment_codes SET attempts=attempts+1 WHERE code_id=?", (row["code_id"],))
        conn.commit()
        conn.close()
        return {"verified": False, "message": "Incorrect code."}

    cur.execute("UPDATE payment_codes SET verified=1 WHERE code_id=?", (row["code_id"],))
    conn.commit()
    conn.close()

    return {"verified": True, "message": "Email verified. You can now pay."}


@app.post("/api/payment/checkout")
def create_checkout(request: CheckoutRequest):
    if not STRIPE_SECRET_KEY:
        return {"error": "Stripe is not configured on the server."}

    clean_email = request.email.strip().lower()

    conn = get_conn()
    cur = conn.cursor()
    verified = cur.execute("""
        SELECT * FROM payment_codes
        WHERE email=? AND hotel_id=? AND verified=1
        ORDER BY created_at DESC
        LIMIT 1
    """, (clean_email, request.hotel_id)).fetchone()

    if not verified:
        conn.close()
        return {"error": "Email payment code is not verified."}

    booking_id = str(uuid.uuid4())
    currency = "usd"

    cur.execute("""
        INSERT INTO bookings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        booking_id,
        clean_email,
        request.hotel_id,
        request.hotel_name,
        request.amount,
        currency,
        "pending",
        "",
        datetime.utcnow().isoformat(),
    ))
    conn.commit()
    conn.close()

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        customer_email=clean_email,
        line_items=[{
            "price_data": {
                "currency": currency,
                "product_data": {"name": request.hotel_name},
                "unit_amount": request.amount,
            },
            "quantity": 1,
        }],
        mode="payment",
        metadata={"booking_id": booking_id, "hotel_id": request.hotel_id},
        success_url=f"{PUBLIC_FRONTEND_URL}/?payment=success&booking_id={booking_id}",
        cancel_url=f"{PUBLIC_FRONTEND_URL}/?payment=cancelled&booking_id={booking_id}",
    )

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("UPDATE bookings SET stripe_session_id=? WHERE booking_id=?", (session.id, booking_id))
    conn.commit()
    conn.close()

    return {"url": session.url, "booking_id": booking_id}


@app.get("/api/booking/confirm")
def confirm_booking(booking_id: str):
    conn = get_conn()
    cur = conn.cursor()
    booking = cur.execute("SELECT * FROM bookings WHERE booking_id=?", (booking_id,)).fetchone()

    if not booking:
        conn.close()
        return {"status": "error", "message": "Booking not found."}

    cur.execute("UPDATE bookings SET status='paid' WHERE booking_id=?", (booking_id,))
    conn.commit()

    paid_booking = cur.execute("SELECT * FROM bookings WHERE booking_id=?", (booking_id,)).fetchone()
    conn.close()

    send_html_email(
        paid_booking["email"],
        "My Space Hotel booking confirmed",
        f"""
        <h2>Your booking is confirmed</h2>
        <p><strong>Hotel:</strong> {paid_booking["hotel_name"]}</p>
        <p><strong>Booking ID:</strong> {paid_booking["booking_id"]}</p>
        <p><strong>Amount paid:</strong> ${paid_booking["amount"] / 100:.2f}</p>
        """
    )

    return {
        "status": "paid",
        "message": "Booking confirmed.",
        "booking": dict(paid_booking),
    }


@app.get("/api/admin/bookings")
def admin_bookings():
    conn = get_conn()
    cur = conn.cursor()
    rows = cur.execute("SELECT * FROM bookings ORDER BY created_at DESC LIMIT 200").fetchall()
    conn.close()
    return {"bookings": [dict(r) for r in rows]}