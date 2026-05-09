import os
from dotenv import load_dotenv
load_dotenv()
import sqlite3
import smtplib
import secrets
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

APP_NAME = "MySpace Hotel"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")
RESERVATIONS_EMAIL = os.getenv("RESERVATIONS_EMAIL", SUPPORT_EMAIL)

DB_PATH = Path(os.getenv("HOTEL_DB_PATH", r"D:\hotel_master_expansion\working\hotel_growth_working.db"))
RES_DB_PATH = Path(os.getenv("RESERVATION_DB_PATH", r"C:\frontend\hotel-booking-app\backend\myspace_reservations.db"))

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "https://myspace-hotel.com")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SUPPORT_EMAIL)

app = FastAPI(title="MySpace Hotel Reservation Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ReservationRequest(BaseModel):
    hotel_id: Optional[str] = ""
    hotel_name: str
    destination: str
    checkin: str
    checkout: str
    guests: int = 1
    rooms: int = 1
    customer_name: str
    customer_email: EmailStr
    customer_phone: Optional[str] = ""
    note: Optional[str] = ""

class ConfirmPriceRequest(BaseModel):
    reservation_code: str
    confirmed_price_minor: int
    currency: str
    supplier_reference: Optional[str] = ""
    admin_note: Optional[str] = ""

def init_reservation_db():
    RES_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(RES_DB_PATH))
    con.execute("""
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reservation_code TEXT UNIQUE,
            created_at TEXT,
            status TEXT,
            hotel_id TEXT,
            hotel_name TEXT,
            destination TEXT,
            checkin TEXT,
            checkout TEXT,
            guests INTEGER,
            rooms INTEGER,
            customer_name TEXT,
            customer_email TEXT,
            customer_phone TEXT,
            note TEXT,
            confirmed_price_minor INTEGER,
            currency TEXT,
            supplier_reference TEXT,
            payment_url TEXT,
            admin_note TEXT
        )
    """)
    con.commit()
    con.close()

def send_email(to_email: str, subject: str, body: str):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        print("EMAIL NOT SENT: SMTP env not fully configured")
        print("TO:", to_email)
        print("SUBJECT:", subject)
        return False

    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)

    return True

def create_stripe_payment_link(reservation_code: str, hotel_name: str, amount_minor: int, currency: str):
    if not STRIPE_SECRET_KEY:
        return ""

    headers = {
        "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    data = {
        "line_items[0][price_data][currency]": currency.lower(),
        "line_items[0][price_data][product_data][name]": f"MySpace Hotel Reservation - {hotel_name}",
        "line_items[0][price_data][unit_amount]": str(amount_minor),
        "line_items[0][quantity]": "1",
        "metadata[reservation_code]": reservation_code,
        "after_completion[type]": "redirect",
        "after_completion[redirect][url]": f"{PUBLIC_APP_URL}/reservation-confirmed?code={reservation_code}",
    }

    r = requests.post("https://api.stripe.com/v1/payment_links", headers=headers, data=data, timeout=30)
    if r.status_code >= 300:
        raise HTTPException(status_code=500, detail="Stripe payment link could not be created.")
    return r.json().get("url", "")

@app.on_event("startup")
def startup():
    init_reservation_db()

@app.get("/status")
def status():
    hotel_count = 0
    db_ready = False
    if DB_PATH.exists():
        try:
            con = sqlite3.connect(str(DB_PATH))
            hotel_count = con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
            con.close()
            db_ready = True
        except Exception:
            db_ready = False

    return {
        "app": APP_NAME,
        "ready": True,
        "hotel_database_ready": db_ready,
        "hotel_count": hotel_count,
        "reservation_email_ready": bool(SMTP_HOST and SMTP_USER and SMTP_PASS),
        "stripe_payment_links_ready": bool(STRIPE_SECRET_KEY),
    }

@app.post("/reservation-request")
def reservation_request(req: ReservationRequest):
    init_reservation_db()
    code = "MSH-" + datetime.utcnow().strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()
    now = datetime.utcnow().isoformat()

    con = sqlite3.connect(str(RES_DB_PATH))
    con.execute("""
        INSERT INTO reservations (
            reservation_code, created_at, status, hotel_id, hotel_name, destination,
            checkin, checkout, guests, rooms, customer_name, customer_email,
            customer_phone, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        code, now, "PRICE_CONFIRMATION_REQUIRED", req.hotel_id, req.hotel_name,
        req.destination, req.checkin, req.checkout, req.guests, req.rooms,
        req.customer_name, req.customer_email, req.customer_phone, req.note
    ))
    con.commit()
    con.close()

    customer_body = f"""Hello {req.customer_name},

Thank you for choosing MySpace Hotel.

We have received your reservation request.

Reservation code: {code}
Hotel: {req.hotel_name}
Destination: {req.destination}
Check-in: {req.checkin}
Check-out: {req.checkout}
Guests: {req.guests}
Rooms: {req.rooms}

Important:
No payment is required yet. Our reservations team will confirm the current hotel price and availability first. Once confirmed, we will send you a secure payment link.

MySpace Hotel Reservations
{SUPPORT_EMAIL}
"""

    admin_body = f"""New reservation request requires live price confirmation.

Reservation code: {code}
Customer: {req.customer_name}
Email: {req.customer_email}
Phone: {req.customer_phone}

Hotel: {req.hotel_name}
Hotel ID: {req.hotel_id}
Destination: {req.destination}
Check-in: {req.checkin}
Check-out: {req.checkout}
Guests: {req.guests}
Rooms: {req.rooms}
Customer note: {req.note}

Action required:
Confirm current live price and availability with supplier/hotel, then use /admin/confirm-price to create the payment link.
"""

    send_email(str(req.customer_email), f"MySpace Hotel reservation request received - {code}", customer_body)
    send_email(RESERVATIONS_EMAIL, f"Action required: confirm hotel price - {code}", admin_body)

    return {
        "ok": True,
        "reservation_code": code,
        "status": "PRICE_CONFIRMATION_REQUIRED",
        "message": "Reservation request received. We will confirm the current hotel price and availability before payment.",
    }

@app.get("/admin/reservations")
def admin_reservations():
    init_reservation_db()
    con = sqlite3.connect(str(RES_DB_PATH))
    con.row_factory = sqlite3.Row
    rows = con.execute("SELECT * FROM reservations ORDER BY id DESC LIMIT 200").fetchall()
    con.close()
    return {"reservations": [dict(r) for r in rows]}

@app.post("/admin/confirm-price")
def admin_confirm_price(req: ConfirmPriceRequest):
    init_reservation_db()

    con = sqlite3.connect(str(RES_DB_PATH))
    con.row_factory = sqlite3.Row
    row = con.execute("SELECT * FROM reservations WHERE reservation_code = ?", (req.reservation_code,)).fetchone()

    if not row:
        con.close()
        raise HTTPException(status_code=404, detail="Reservation not found.")

    payment_url = create_stripe_payment_link(
        req.reservation_code,
        row["hotel_name"],
        req.confirmed_price_minor,
        req.currency,
    )

    con.execute("""
        UPDATE reservations
        SET status = ?, confirmed_price_minor = ?, currency = ?, supplier_reference = ?,
            payment_url = ?, admin_note = ?
        WHERE reservation_code = ?
    """, (
        "PAYMENT_LINK_SENT" if payment_url else "PRICE_CONFIRMED_PAYMENT_LINK_PENDING",
        req.confirmed_price_minor,
        req.currency.upper(),
        req.supplier_reference,
        payment_url,
        req.admin_note,
        req.reservation_code,
    ))
    con.commit()
    con.close()

    price_major = req.confirmed_price_minor / 100

    customer_body = f"""Hello {row['customer_name']},

Your current hotel price and availability have now been confirmed.

Reservation code: {req.reservation_code}
Hotel: {row['hotel_name']}
Destination: {row['destination']}
Check-in: {row['checkin']}
Check-out: {row['checkout']}
Confirmed price: {req.currency.upper()} {price_major:,.2f}

Secure payment link:
{payment_url if payment_url else "Payment link is being prepared by our reservations team."}

After payment, we will send your final booking confirmation.

MySpace Hotel Reservations
{SUPPORT_EMAIL}
"""

    send_email(row["customer_email"], f"MySpace Hotel payment link - {req.reservation_code}", customer_body)

    return {
        "ok": True,
        "reservation_code": req.reservation_code,
        "status": "PAYMENT_LINK_SENT" if payment_url else "PRICE_CONFIRMED_PAYMENT_LINK_PENDING",
        "payment_url": payment_url,
    }

@app.get("/reservation/{reservation_code}")
def get_reservation(reservation_code: str):
    init_reservation_db()
    con = sqlite3.connect(str(RES_DB_PATH))
    con.row_factory = sqlite3.Row
    row = con.execute("SELECT * FROM reservations WHERE reservation_code = ?", (reservation_code,)).fetchone()
    con.close()
    if not row:
        raise HTTPException(status_code=404, detail="Reservation not found.")
    return dict(row)


from hotel_connectivity import router as hotel_connectivity_router
app.include_router(hotel_connectivity_router)


