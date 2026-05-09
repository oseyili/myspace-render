from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import os
import sqlite3
import uuid
import smtplib
import requests
from pathlib import Path
from datetime import datetime
from email.mime.text import MIMEText

load_dotenv()

app = FastAPI(title="MySpace Hotel Supplier Ready Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

HOTEL_DB = Path(os.getenv("HOTEL_DB_PATH", r"D:\hotel_master_expansion\working\hotel_growth_working.db"))
BOOKING_DB = Path(os.getenv("BOOKING_DB_PATH", r"C:\frontend\hotel-booking-app\backend\myspace_auto_bookings.db"))

PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "http://localhost:5173")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "reservations@myspace-hotel.com")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")

SUPPLIER_MODE = os.getenv("SUPPLIER_MODE", "TEST").upper()
TEST_PAYMENT_MINOR = int(os.getenv("TEST_PAYMENT_MINOR", "50"))


class ReservationRequest(BaseModel):
    hotel_id: str
    hotel_name: str
    destination: str
    checkin: str
    checkout: str
    guests: int = 1
    rooms: int = 1
    customer_name: str
    customer_email: EmailStr
    customer_phone: str = "0000000000"
    note: str = ""


def init_db():
    BOOKING_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(BOOKING_DB))
    con.row_factory = sqlite3.Row
    con.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reservation_code TEXT UNIQUE,
            created_at TEXT,
            updated_at TEXT,
            status TEXT,
            hotel_id TEXT,
            supplier TEXT,
            supplier_hotel_id TEXT,
            hotel_name TEXT,
            destination TEXT,
            checkin TEXT,
            checkout TEXT,
            guests INTEGER,
            rooms INTEGER,
            customer_name TEXT,
            customer_email TEXT,
            customer_phone TEXT,
            amount_minor INTEGER,
            currency TEXT,
            payment_url TEXT,
            supplier_reference TEXT,
            note TEXT
        )
    """)
    con.commit()
    con.close()


def send_email(to_email, subject, body):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        print("EMAIL NOT READY")
        return False

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM, [to_email], msg.as_string())

    return True


def get_hotel_from_catalog(hotel_id):
    if not HOTEL_DB.exists():
        return None

    raw_id = hotel_id.replace("rapid-", "")

    con = sqlite3.connect(str(HOTEL_DB))
    con.row_factory = sqlite3.Row

    row = con.execute("""
        SELECT *
        FROM hotels
        WHERE CAST(id AS TEXT) = ?
           OR CAST(supplier_hotel_id AS TEXT) = ?
        LIMIT 1
    """, (raw_id, raw_id)).fetchone()

    con.close()
    return dict(row) if row else None


def check_supplier_availability(req, hotel):
    supplier = (hotel or {}).get("supplier", "TEST_SUPPLIER")
    supplier_hotel_id = (hotel or {}).get("supplier_hotel_id", req.hotel_id)

    if SUPPLIER_MODE == "TEST":
        return {
            "available": True,
            "supplier": supplier or "TEST_SUPPLIER",
            "supplier_hotel_id": supplier_hotel_id or req.hotel_id,
            "amount_minor": TEST_PAYMENT_MINOR,
            "currency": "GBP",
            "supplier_reference": "TEST-SUPPLIER-" + uuid.uuid4().hex[:8].upper(),
            "message": "TEST supplier approved availability automatically.",
        }

    raise HTTPException(
        status_code=400,
        detail="Real supplier mode is not configured yet. Add Hotelbeds, Expedia, RateHawk, Amadeus, WebBeds, or TravelgateX credentials.",
    )


def create_payment_link(code, hotel_name, amount_minor, currency):
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe secret key is missing.")

    headers = {
        "Authorization": "Bearer " + STRIPE_SECRET_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
    }

    data = {
        "line_items[0][price_data][currency]": currency.lower(),
        "line_items[0][price_data][product_data][name]": "MySpace Hotel Reservation - " + hotel_name,
        "line_items[0][price_data][unit_amount]": str(amount_minor),
        "line_items[0][quantity]": "1",
        "metadata[reservation_code]": code,
        "after_completion[type]": "redirect",
        "after_completion[redirect][url]": PUBLIC_APP_URL + "/reservation-confirmed?code=" + code,
    }

    r = requests.post("https://api.stripe.com/v1/payment_links", headers=headers, data=data, timeout=30)

    if r.status_code >= 300:
        raise HTTPException(status_code=500, detail="Stripe payment link could not be created.")

    return r.json().get("url", "")


@app.on_event("startup")
def startup():
    init_db()


@app.get("/hotel-connectivity-status")
def hotel_connectivity_status():
    hotel_count = 0
    if HOTEL_DB.exists():
        try:
            con = sqlite3.connect(str(HOTEL_DB))
            hotel_count = con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
            con.close()
        except Exception:
            hotel_count = 0

    con = sqlite3.connect(str(BOOKING_DB))
    booking_count = con.execute("SELECT COUNT(*) FROM bookings").fetchone()[0]
    con.close()

    return {
        "ready": True,
        "system": "MySpace Hotel Supplier Ready Automation",
        "supplier_mode": SUPPLIER_MODE,
        "hotel_count": hotel_count,
        "booking_count": booking_count,
        "email_ready": bool(SMTP_HOST and SMTP_USER and SMTP_PASS),
        "payment_links_ready": bool(STRIPE_SECRET_KEY),
        "rule": "Automated payments only happen after supplier availability approval. TEST mode simulates supplier approval.",
    }


@app.post("/reservation-request")
def reservation_request(req: ReservationRequest):
    init_db()

    hotel = get_hotel_from_catalog(req.hotel_id)
    availability = check_supplier_availability(req, hotel)

    if not availability["available"]:
        raise HTTPException(status_code=409, detail="Hotel is not available for the selected dates.")

    code = "MSH-" + datetime.now().strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:6].upper()
    payment_url = create_payment_link(
        code,
        req.hotel_name,
        availability["amount_minor"],
        availability["currency"],
    )

    now = datetime.utcnow().isoformat()

    con = sqlite3.connect(str(BOOKING_DB))
    con.execute("""
        INSERT INTO bookings (
            reservation_code, created_at, updated_at, status, hotel_id, supplier,
            supplier_hotel_id, hotel_name, destination, checkin, checkout, guests,
            rooms, customer_name, customer_email, customer_phone, amount_minor,
            currency, payment_url, supplier_reference, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        code, now, now, "SUPPLIER_APPROVED_PAYMENT_LINK_SENT",
        req.hotel_id, availability["supplier"], availability["supplier_hotel_id"],
        req.hotel_name, req.destination, req.checkin, req.checkout, req.guests,
        req.rooms, req.customer_name, str(req.customer_email), req.customer_phone,
        availability["amount_minor"], availability["currency"], payment_url,
        availability["supplier_reference"], req.note
    ))
    con.commit()
    con.close()

    send_email(
        str(req.customer_email),
        "MySpace Hotel secure payment link - " + code,
        f"""Hello {req.customer_name},

Your hotel availability has been approved in {SUPPLIER_MODE} supplier mode.

Reservation code: {code}
Hotel: {req.hotel_name}
Destination: {req.destination}
Check-in: {req.checkin}
Check-out: {req.checkout}
Guests: {req.guests}
Rooms: {req.rooms}
Amount: {availability['currency']} {availability['amount_minor'] / 100:.2f}

Secure payment link:
{payment_url}

After payment, your confirmation page will show your reservation code.

MySpace Hotel Reservations
{SUPPORT_EMAIL}
"""
    )

    return {
        "ok": True,
        "reservation_code": code,
        "status": "AUTO_SUPPLIER_APPROVED",
        "supplier_mode": SUPPLIER_MODE,
        "supplier": availability["supplier"],
        "supplier_hotel_id": availability["supplier_hotel_id"],
        "amount_minor": availability["amount_minor"],
        "currency": availability["currency"],
        "payment_url": payment_url,
    }


@app.get("/admin/reservations")
def admin_reservations():
    init_db()
    con = sqlite3.connect(str(BOOKING_DB))
    con.row_factory = sqlite3.Row
    rows = con.execute("SELECT * FROM bookings ORDER BY id DESC LIMIT 300").fetchall()
    con.close()
    return {"reservations": [dict(r) for r in rows]}


@app.get("/reservation/{reservation_code}")
def reservation_status(reservation_code: str):
    init_db()
    con = sqlite3.connect(str(BOOKING_DB))
    con.row_factory = sqlite3.Row
    row = con.execute("SELECT * FROM bookings WHERE reservation_code = ?", (reservation_code,)).fetchone()
    con.close()

    if not row:
        raise HTTPException(status_code=404, detail="Reservation not found.")

    return dict(row)
