from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import datetime, timedelta, date
import os
import json
import base64
import hashlib
import hmac
import smtplib
from email.message import EmailMessage

import psycopg
from psycopg.rows import dict_row
import stripe

app = FastAPI(title="Hotel Booking API", version="2.0.0")

# ============================================================
# ENV / CONFIG
# ============================================================
FRONTEND_ORIGIN = os.getenv("HOTEL_APP_FRONTEND_ORIGIN", "http://localhost:3010")
DATABASE_URL = os.getenv("HOTEL_APP_DATABASE_URL", "postgresql://postgres:CHANGE_ME_DB_PASSWORD@localhost:5432/hotel_booking_app")
ADMIN_PASSWORD = os.getenv("HOTEL_APP_ADMIN_PASSWORD", "CHANGE_ME_ADMIN_PASSWORD")
APP_SECRET = os.getenv("HOTEL_APP_SECRET", "CHANGE_ME_LONG_RANDOM_SECRET")

STRIPE_SECRET_KEY = os.getenv("HOTEL_APP_STRIPE_SECRET_KEY", "CHANGE_ME_STRIPE_SECRET_KEY")
STRIPE_PUBLISHABLE_KEY = os.getenv("HOTEL_APP_STRIPE_PUBLISHABLE_KEY", "CHANGE_ME_STRIPE_PUBLISHABLE_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("HOTEL_APP_STRIPE_WEBHOOK_SECRET", "CHANGE_ME_STRIPE_WEBHOOK_SECRET")

EMAIL_FROM = os.getenv("HOTEL_APP_EMAIL_FROM", "CHANGE_ME_EMAIL_FROM")
SMTP_HOST = os.getenv("HOTEL_APP_SMTP_HOST", "CHANGE_ME_SMTP_HOST")
SMTP_PORT = int(os.getenv("HOTEL_APP_SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("HOTEL_APP_SMTP_USERNAME", "CHANGE_ME_SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("HOTEL_APP_SMTP_PASSWORD", "CHANGE_ME_SMTP_PASSWORD")

stripe.api_key = STRIPE_SECRET_KEY

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://127.0.0.1:3010"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)

HOTELS = [
    {"hotel": "Grand Hotel", "total_rooms": 10, "price": 120},
    {"hotel": "Ocean View", "total_rooms": 5, "price": 200},
    {"hotel": "Budget Stay", "total_rooms": 20, "price": 80},
]

# ============================================================
# DB
# ============================================================
def get_connection():
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)

def init_db():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS rooms (
                    hotel TEXT PRIMARY KEY,
                    total_rooms INTEGER NOT NULL,
                    price INTEGER NOT NULL
                )
            """)

            cur.execute("""
                CREATE TABLE IF NOT EXISTS bookings (
                    id BIGSERIAL PRIMARY KEY,
                    guest_name TEXT NOT NULL,
                    guest_email TEXT NOT NULL,
                    hotel TEXT NOT NULL,
                    check_in DATE NOT NULL,
                    check_out DATE NOT NULL,
                    nights INTEGER NOT NULL,
                    total_price INTEGER NOT NULL,
                    payment_status TEXT NOT NULL DEFAULT 'pending',
                    stripe_session_id TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_bookings_hotel_dates
                ON bookings (hotel, check_in, check_out)
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_bookings_guest_email
                ON bookings (guest_email)
            """)

            cur.execute("SELECT COUNT(*) AS c FROM rooms")
            existing = cur.fetchone()["c"]

            if existing == 0:
                for h in HOTELS:
                    cur.execute(
                        "INSERT INTO rooms (hotel, total_rooms, price) VALUES (%s, %s, %s)",
                        (h["hotel"], h["total_rooms"], h["price"])
                    )

        conn.commit()

# ============================================================
# TOKEN HELPERS
# ============================================================
def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")

def b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)

def sign_payload(payload: dict) -> str:
    body = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(APP_SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return body + "." + signature

def verify_token(token: str) -> dict:
    try:
        body, signature = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid token.")

    expected = hmac.new(APP_SECRET.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid token.")

    payload = json.loads(b64url_decode(body).decode("utf-8"))
    if payload.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Invalid token.")

    exp = payload.get("exp")
    if not isinstance(exp, int) or int(datetime.utcnow().timestamp()) >= exp:
        raise HTTPException(status_code=401, detail="Token expired.")

    return payload

def require_admin_token(x_token: Optional[str]):
    if not x_token:
        raise HTTPException(status_code=401, detail="Missing admin token.")
    return verify_token(x_token)

# ============================================================
# EMAIL
# ============================================================
def send_email(to_email: str, subject: str, body: str):
    if not SMTP_HOST or SMTP_HOST.startswith("CHANGE_ME_"):
        return

    msg = EmailMessage()
    msg["From"] = EMAIL_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as smtp:
        smtp.starttls()
        smtp.login(SMTP_USERNAME, SMTP_PASSWORD)
        smtp.send_message(msg)

# ============================================================
# DATE HELPERS
# ============================================================
def parse_date(value: str) -> date:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must use YYYY-MM-DD format.")

def calculate_nights(check_in: str, check_out: str) -> int:
    start = parse_date(check_in)
    end = parse_date(check_out)
    if end <= start:
        raise HTTPException(status_code=400, detail="Check-out must be after check-in.")
    return (end - start).days

def iter_days(check_in: str, check_out: str):
    current = parse_date(check_in)
    end = parse_date(check_out)
    while current < end:
        yield current.isoformat()
        current += timedelta(days=1)

# ============================================================
# AVAILABILITY HELPERS
# ============================================================
def get_hotel_row(conn, hotel: str):
    with conn.cursor() as cur:
        cur.execute("SELECT hotel, total_rooms, price FROM rooms WHERE hotel = %s", (hotel,))
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=400, detail="Selected hotel is invalid.")
        return row

def rooms_used_on_day(conn, hotel: str, day: str) -> int:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) AS used_count
            FROM bookings
            WHERE hotel = %s
              AND payment_status = 'paid'
              AND %s >= check_in
              AND %s < check_out
        """, (hotel, day, day))
        row = cur.fetchone()
        return int(row["used_count"])

def validate_overlap_for_guest(conn, guest_email: str, hotel: str, check_in: str, check_out: str):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) AS overlap_count
            FROM bookings
            WHERE lower(guest_email) = lower(%s)
              AND hotel = %s
              AND payment_status IN ('pending', 'paid')
              AND NOT (check_out <= %s OR check_in >= %s)
        """, (guest_email, hotel, check_in, check_out))
        row = cur.fetchone()
        if int(row["overlap_count"]) > 0:
            raise HTTPException(status_code=400, detail="This guest already has an overlapping booking for this hotel.")

def validate_hotel_capacity(conn, hotel: str, check_in: str, check_out: str):
    hotel_row = get_hotel_row(conn, hotel)
    total_rooms = int(hotel_row["total_rooms"])

    for day in iter_days(check_in, check_out):
        used = rooms_used_on_day(conn, hotel, day)
        if used >= total_rooms:
            raise HTTPException(status_code=400, detail="No availability for one or more selected dates.")

# ============================================================
# MODELS
# ============================================================
class AdminLoginRequest(BaseModel):
    password: str = Field(..., min_length=1)

class BookingQuoteRequest(BaseModel):
    guest_name: str = Field(..., min_length=2, max_length=120)
    guest_email: str = Field(..., min_length=5, max_length=200)
    hotel: str = Field(..., min_length=2, max_length=120)
    check_in: str
    check_out: str

    @field_validator("guest_name")
    @classmethod
    def validate_guest_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Guest name is too short.")
        return value

    @field_validator("guest_email")
    @classmethod
    def validate_guest_email(cls, value: str) -> str:
        value = value.strip().lower()
        if "@" not in value or "." not in value.split("@")[-1]:
            raise ValueError("Guest email is invalid.")
        return value

    @field_validator("hotel")
    @classmethod
    def validate_hotel(cls, value: str) -> str:
        return value.strip()

# ============================================================
# STARTUP
# ============================================================
init_db()

# ============================================================
# ROUTES
# ============================================================
@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/config/public")
def public_config():
    return {
        "stripe_publishable_key": STRIPE_PUBLISHABLE_KEY
    }

@app.post("/admin/login")
def admin_login(payload: AdminLoginRequest):
    if payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin password.")

    token = sign_payload({
        "role": "admin",
        "exp": int((datetime.utcnow() + timedelta(hours=8)).timestamp()),
    })
    return {"token": token}

@app.get("/hotels")
def hotels():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT hotel, total_rooms, price FROM rooms ORDER BY hotel ASC")
            rows = cur.fetchall()

    return [
        {"name": row["hotel"], "rooms": row["total_rooms"], "price": row["price"]}
        for row in rows
    ]

@app.get("/availability")
def availability(hotel: str, check_in: str, check_out: str):
    with get_connection() as conn:
        nights = calculate_nights(check_in, check_out)
        hotel_row = get_hotel_row(conn, hotel)
        total_rooms = int(hotel_row["total_rooms"])

        min_available = total_rooms
        for day in iter_days(check_in, check_out):
            used = rooms_used_on_day(conn, hotel, day)
            available_rooms = total_rooms - used
            if available_rooms < min_available:
                min_available = available_rooms

        return {
            "hotel": hotel,
            "nights": nights,
            "available": min_available,
            "total": total_rooms,
            "price_per_night": int(hotel_row["price"]),
            "estimated_total": int(hotel_row["price"]) * nights,
        }

@app.post("/payments/create-checkout-session")
def create_checkout_session(payload: BookingQuoteRequest):
    with get_connection() as conn:
        nights = calculate_nights(payload.check_in, payload.check_out)
        hotel_row = get_hotel_row(conn, payload.hotel)
        price = int(hotel_row["price"])

        validate_overlap_for_guest(conn, payload.guest_email, payload.hotel, payload.check_in, payload.check_out)
        validate_hotel_capacity(conn, payload.hotel, payload.check_in, payload.check_out)

        total_price = nights * price

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO bookings (
                    guest_name,
                    guest_email,
                    hotel,
                    check_in,
                    check_out,
                    nights,
                    total_price,
                    payment_status,
                    created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', NOW())
                RETURNING id
            """, (
                payload.guest_name,
                payload.guest_email,
                payload.hotel,
                payload.check_in,
                payload.check_out,
                nights,
                total_price,
            ))
            booking_id = cur.fetchone()["id"]
        conn.commit()

        session = stripe.checkout.Session.create(
            mode="payment",
            success_url=FRONTEND_ORIGIN + "/?payment=success&booking_id=" + str(booking_id),
            cancel_url=FRONTEND_ORIGIN + "/?payment=cancelled&booking_id=" + str(booking_id),
            customer_email=payload.guest_email,
            metadata={
                "booking_id": str(booking_id),
                "hotel": payload.hotel,
                "guest_email": payload.guest_email,
            },
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": total_price * 100,
                        "product_data": {
                            "name": payload.hotel + " booking",
                            "description": f"{payload.check_in} to {payload.check_out} · {nights} night(s)",
                        },
                    },
                    "quantity": 1,
                }
            ],
        )

        with get_connection() as conn2:
            with conn2.cursor() as cur2:
                cur2.execute(
                    "UPDATE bookings SET stripe_session_id = %s WHERE id = %s",
                    (session.id, booking_id)
                )
            conn2.commit()

        return {
            "checkout_url": session.url,
            "booking_id": booking_id,
        }

@app.post("/payments/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook.")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        booking_id = int(session["metadata"]["booking_id"])

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE bookings
                    SET payment_status = 'paid'
                    WHERE id = %s
                    RETURNING guest_name, guest_email, hotel, check_in, check_out, nights, total_price
                """, (booking_id,))
                booking = cur.fetchone()
            conn.commit()

        if booking:
            send_email(
                to_email=booking["guest_email"],
                subject="Hotel Booking Confirmation",
                body=(
                    f"Hello {booking['guest_name']},\n\n"
                    f"Your booking is confirmed.\n"
                    f"Hotel: {booking['hotel']}\n"
                    f"Check-in: {booking['check_in']}\n"
                    f"Check-out: {booking['check_out']}\n"
                    f"Nights: {booking['nights']}\n"
                    f"Total Paid: ${booking['total_price']}\n\n"
                    f"Thank you."
                ),
            )

    return {"received": True}

@app.get("/admin/bookings")
def admin_bookings(x_token: Optional[str] = Header(default=None)):
    require_admin_token(x_token)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, guest_name, guest_email, hotel, check_in, check_out, nights, total_price, payment_status, created_at
                FROM bookings
                ORDER BY id DESC
            """)
            rows = cur.fetchall()

    return rows

@app.delete("/admin/bookings/{booking_id}")
def admin_delete_booking(booking_id: int, x_token: Optional[str] = Header(default=None)):
    require_admin_token(x_token)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM bookings WHERE id = %s", (booking_id,))
            existing = cur.fetchone()
            if existing is None:
                raise HTTPException(status_code=404, detail="Booking not found.")

            cur.execute("DELETE FROM bookings WHERE id = %s", (booking_id,))
        conn.commit()

    return {"status": "deleted", "booking_id": booking_id}

@app.get("/admin/summary")
def admin_summary(x_token: Optional[str] = Header(default=None)):
    require_admin_token(x_token)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT hotel, total_rooms, price FROM rooms ORDER BY hotel ASC")
            room_rows = cur.fetchall()

            summary_rows = []
            today_str = date.today().isoformat()

            for room in room_rows:
                hotel = room["hotel"]
                total_rooms = int(room["total_rooms"])

                cur.execute("SELECT COUNT(*) AS booking_count FROM bookings WHERE hotel = %s AND payment_status = 'paid'", (hotel,))
                booking_count = int(cur.fetchone()["booking_count"])

                cur.execute("SELECT COALESCE(SUM(total_price), 0) AS revenue FROM bookings WHERE hotel = %s AND payment_status = 'paid'", (hotel,))
                revenue = int(cur.fetchone()["revenue"])

                used_today = rooms_used_on_day(conn, hotel, today_str)

                summary_rows.append({
                    "hotel": hotel,
                    "total_rooms": total_rooms,
                    "price_per_night": int(room["price"]),
                    "all_time_bookings": booking_count,
                    "used_today": used_today,
                    "available_today": total_rooms - used_today,
                    "revenue": revenue,
                })

    return summary_rows

@app.get("/admin/calendar")
def admin_calendar(hotel: str, x_token: Optional[str] = Header(default=None)):
    require_admin_token(x_token)

    with get_connection() as conn:
        hotel_row = get_hotel_row(conn, hotel)
        total_rooms = int(hotel_row["total_rooms"])

        start_day = date.today()
        days = []

        for offset in range(14):
            current_day = start_day + timedelta(days=offset)
            current_day_str = current_day.isoformat()
            used = rooms_used_on_day(conn, hotel, current_day_str)
            days.append({
                "date": current_day_str,
                "used": used,
                "available": total_rooms - used,
                "total_rooms": total_rooms,
            })

    return days
