import os
from dotenv import load_dotenv
load_dotenv()
import sqlite3
import smtplib
import secrets
from pathlib import Path
from datetime import datetime
from email.message import EmailMessage
from typing import Optional

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

router = APIRouter()

APP_NAME = "MySpace Hotel"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")
RESERVATIONS_EMAIL = os.getenv("RESERVATIONS_EMAIL", SUPPORT_EMAIL)

CONNECT_DB = Path(os.getenv("CONNECT_DB_PATH", r"C:\frontend\hotel-booking-app\backend\myspace_hotel_connectivity.db"))

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "https://myspace-hotel.com")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SUPPORT_EMAIL)


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
    hotel_reply_reference: Optional[str] = ""
    admin_note: Optional[str] = ""


class HotelContactUpdate(BaseModel):
    hotel_id: str
    hotel_name: str
    destination: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    supplier_name: Optional[str] = ""
    supplier_hotel_id: Optional[str] = ""
    contact_status: Optional[str] = "UNKNOWN"
    note: Optional[str] = ""


def db():
    CONNECT_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(CONNECT_DB))
    con.row_factory = sqlite3.Row
    con.execute("""
        CREATE TABLE IF NOT EXISTS hotel_contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hotel_id TEXT UNIQUE,
            hotel_name TEXT,
            destination TEXT,
            email TEXT,
            phone TEXT,
            supplier_name TEXT,
            supplier_hotel_id TEXT,
            contact_status TEXT,
            note TEXT,
            updated_at TEXT
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS reservation_orders (
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
            hotel_reply_reference TEXT,
            payment_url TEXT,
            admin_note TEXT
        )
    """)
    con.commit()
    return con


def send_email(to_email: str, subject: str, body: str):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        print("EMAIL NOT SENT - SMTP not fully configured")
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


def create_payment_link(code: str, hotel_name: str, amount_minor: int, currency: str):
    if not STRIPE_SECRET_KEY:
        return ""

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


@router.get("/hotel-connectivity-status")
def hotel_connectivity_status():
    con = db()
    hotels_with_contacts = con.execute("SELECT COUNT(*) FROM hotel_contacts").fetchone()[0]
    reservations = con.execute("SELECT COUNT(*) FROM reservation_orders").fetchone()[0]
    pending = con.execute("SELECT COUNT(*) FROM reservation_orders WHERE status LIKE '%PENDING%' OR status LIKE '%REQUIRED%'").fetchone()[0]
    con.close()

    return {
        "ready": True,
        "system": APP_NAME,
        "hotels_with_contact_routes": hotels_with_contacts,
        "reservation_orders": reservations,
        "pending_confirmation": pending,
        "email_ready": bool(SMTP_HOST and SMTP_USER and SMTP_PASS),
        "payment_links_ready": bool(STRIPE_SECRET_KEY),
        "rule": "No customer payment is requested until current hotel price and availability are confirmed.",
    }


@router.post("/admin/hotel-contact")
def admin_hotel_contact(req: HotelContactUpdate):
    con = db()
    now = datetime.utcnow().isoformat()

    con.execute("""
        INSERT INTO hotel_contacts (
            hotel_id, hotel_name, destination, email, phone, supplier_name,
            supplier_hotel_id, contact_status, note, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(hotel_id) DO UPDATE SET
            hotel_name=excluded.hotel_name,
            destination=excluded.destination,
            email=excluded.email,
            phone=excluded.phone,
            supplier_name=excluded.supplier_name,
            supplier_hotel_id=excluded.supplier_hotel_id,
            contact_status=excluded.contact_status,
            note=excluded.note,
            updated_at=excluded.updated_at
    """, (
        req.hotel_id, req.hotel_name, req.destination, req.email, req.phone,
        req.supplier_name, req.supplier_hotel_id, req.contact_status, req.note, now
    ))

    con.commit()
    con.close()

    return {"ok": True, "hotel_id": req.hotel_id, "message": "Hotel contact route saved."}


@router.get("/hotel-contact-status/{hotel_id}")
def hotel_contact_status(hotel_id: str):
    con = db()
    row = con.execute("SELECT * FROM hotel_contacts WHERE hotel_id = ?", (hotel_id,)).fetchone()
    con.close()

    if not row:
        return {
            "hotel_id": hotel_id,
            "contact_status": "NOT_CONNECTED_YET",
            "message": "This hotel can be requested, but current price must be confirmed before payment.",
        }

    data = dict(row)
    data["message"] = "Hotel contact route is saved for reservation follow-up."
    return data


@router.post("/reservation-request")
def reservation_request(req: ReservationRequest):
    con = db()

    code = "MSH-" + datetime.utcnow().strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()
    now = datetime.utcnow().isoformat()

    contact = None
    if req.hotel_id:
        contact = con.execute("SELECT * FROM hotel_contacts WHERE hotel_id = ?", (req.hotel_id,)).fetchone()

    con.execute("""
        INSERT INTO reservation_orders (
            reservation_code, created_at, status, hotel_id, hotel_name, destination,
            checkin, checkout, guests, rooms, customer_name, customer_email,
            customer_phone, note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        code, now, "LIVE_PRICE_CONFIRMATION_REQUIRED", req.hotel_id, req.hotel_name,
        req.destination, req.checkin, req.checkout, req.guests, req.rooms,
        req.customer_name, str(req.customer_email), req.customer_phone, req.note
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

No payment is required yet.

Our reservations team will confirm the current hotel price and availability first. Once confirmed, we will send you a secure payment link.

MySpace Hotel Reservations
{SUPPORT_EMAIL}
"""

    admin_body = f"""New MySpace Hotel reservation request.

Reservation code: {code}

Customer:
Name: {req.customer_name}
Email: {req.customer_email}
Phone: {req.customer_phone}

Hotel:
Hotel ID: {req.hotel_id}
Hotel name: {req.hotel_name}
Destination: {req.destination}
Check-in: {req.checkin}
Check-out: {req.checkout}
Guests: {req.guests}
Rooms: {req.rooms}
Note: {req.note}

Hotel contact route:
{dict(contact) if contact else "No saved hotel contact route yet. Confirm through supplier/hotel manually, then update contact route."}

Required action:
Confirm live price and availability. Then call /admin/confirm-price to send the customer payment link.
"""

    send_email(str(req.customer_email), "MySpace Hotel reservation request received - " + code, customer_body)
    send_email(RESERVATIONS_EMAIL, "Action required: confirm live hotel price - " + code, admin_body)

    return {
        "ok": True,
        "reservation_code": code,
        "status": "LIVE_PRICE_CONFIRMATION_REQUIRED",
        "message": "Reservation request received. Current price and availability will be confirmed before payment.",
    }


@router.get("/admin/reservations")
def admin_reservations():
    con = db()
    rows = con.execute("SELECT * FROM reservation_orders ORDER BY id DESC LIMIT 300").fetchall()
    con.close()
    return {"reservations": [dict(r) for r in rows]}


@router.post("/admin/confirm-price")
def admin_confirm_price(req: ConfirmPriceRequest):
    con = db()
    row = con.execute("SELECT * FROM reservation_orders WHERE reservation_code = ?", (req.reservation_code,)).fetchone()

    if not row:
        con.close()
        raise HTTPException(status_code=404, detail="Reservation not found.")

    payment_url = create_payment_link(
        req.reservation_code,
        row["hotel_name"],
        req.confirmed_price_minor,
        req.currency,
    )

    new_status = "PAYMENT_LINK_SENT" if payment_url else "PRICE_CONFIRMED_PAYMENT_LINK_PENDING"

    con.execute("""
        UPDATE reservation_orders
        SET status = ?, confirmed_price_minor = ?, currency = ?, hotel_reply_reference = ?,
            payment_url = ?, admin_note = ?
        WHERE reservation_code = ?
    """, (
        new_status, req.confirmed_price_minor, req.currency.upper(),
        req.hotel_reply_reference, payment_url, req.admin_note, req.reservation_code
    ))

    con.commit()
    con.close()

    price_major = req.confirmed_price_minor / 100

    customer_body = f"""Hello {row['customer_name']},

Your MySpace Hotel reservation price and availability have been confirmed.

Reservation code: {req.reservation_code}
Hotel: {row['hotel_name']}
Destination: {row['destination']}
Check-in: {row['checkin']}
Check-out: {row['checkout']}
Confirmed price: {req.currency.upper()} {price_major:,.2f}

Secure payment link:
{payment_url if payment_url else "Your payment link is being prepared by our reservations team."}

After payment, we will send your final booking confirmation.

MySpace Hotel Reservations
{SUPPORT_EMAIL}
"""

    send_email(row["customer_email"], "MySpace Hotel secure payment link - " + req.reservation_code, customer_body)

    return {
        "ok": True,
        "reservation_code": req.reservation_code,
        "status": new_status,
        "payment_url": payment_url,
    }


@router.get("/reservation/{reservation_code}")
def reservation_status(reservation_code: str):
    con = db()
    row = con.execute("SELECT * FROM reservation_orders WHERE reservation_code = ?", (reservation_code,)).fetchone()
    con.close()

    if not row:
        raise HTTPException(status_code=404, detail="Reservation not found.")

    return dict(row)

