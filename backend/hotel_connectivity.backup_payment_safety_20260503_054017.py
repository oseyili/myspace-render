import os
import sqlite3
import smtplib
import secrets
from pathlib import Path
from datetime import datetime
from email.message import EmailMessage
from typing import Optional

import requests
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr

load_dotenv()

router = APIRouter()

APP_NAME = "MySpace Hotel"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")
RESERVATIONS_EMAIL = os.getenv("RESERVATIONS_EMAIL", SUPPORT_EMAIL)

CONNECT_DB = Path(os.getenv("CONNECT_DB_PATH", r"C:\frontend\hotel-booking-app\backend\myspace_hotel_connectivity.db"))

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "http://localhost:5173")

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
            updated_at TEXT,
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
            hotel_email TEXT,
            hotel_phone TEXT,
            hotel_email_sent_at TEXT,
            confirmed_price_minor INTEGER,
            currency TEXT,
            hotel_reply_reference TEXT,
            payment_url TEXT,
            admin_note TEXT
        )
    """)

    existing_cols = [r["name"] for r in con.execute("PRAGMA table_info(reservation_orders)").fetchall()]
    needed_cols = {
        "updated_at": "TEXT",
        "hotel_email": "TEXT",
        "hotel_phone": "TEXT",
        "hotel_email_sent_at": "TEXT",
    }

    for col, typ in needed_cols.items():
        if col not in existing_cols:
            con.execute(f"ALTER TABLE reservation_orders ADD COLUMN {col} {typ}")

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


def hotel_request_email_body(code: str, req: ReservationRequest):
    return f"""Subject: Reservation Request - MySpace Hotel Ref {code}

Hello,

MySpace Hotel has a customer requesting current availability and rate for your property.

Reservation reference: {code}

Hotel: {req.hotel_name}
Destination: {req.destination}
Check-in: {req.checkin}
Check-out: {req.checkout}
Guests: {req.guests}
Rooms: {req.rooms}

Please reply with:

1. Availability for these dates
2. Best available total price
3. Currency
4. Cancellation terms
5. Any deposit or payment requirement
6. Final confirmation instructions

Important:
No customer payment will be requested until current price and availability are confirmed.

Kind regards,

MySpace Hotel Reservations
{SUPPORT_EMAIL}
"""


@router.get("/hotel-connectivity-status")
def hotel_connectivity_status():
    con = db()
    hotels_with_contacts = con.execute("SELECT COUNT(*) FROM hotel_contacts").fetchone()[0]
    hotels_with_email = con.execute("SELECT COUNT(*) FROM hotel_contacts WHERE email IS NOT NULL AND TRIM(email) != ''").fetchone()[0]
    reservations = con.execute("SELECT COUNT(*) FROM reservation_orders").fetchone()[0]
    pending = con.execute("""
        SELECT COUNT(*) FROM reservation_orders
        WHERE status IN (
            'LIVE_PRICE_CONFIRMATION_REQUIRED',
            'AWAITING_HOTEL_CONFIRMATION',
            'MANUAL_HOTEL_CONTACT_REQUIRED',
            'PRICE_CONFIRMED_PAYMENT_LINK_PENDING'
        )
    """).fetchone()[0]
    con.close()

    return {
        "ready": True,
        "system": APP_NAME,
        "hotels_with_contact_routes": hotels_with_contacts,
        "hotels_with_email_routes": hotels_with_email,
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
            "message": "This hotel can be requested, but current price must be confirmed manually before payment.",
        }

    data = dict(row)
    data["auto_email_ready"] = bool((data.get("email") or "").strip())
    data["message"] = "Hotel contact route is saved."
    return data


@router.post("/reservation-request")
def reservation_request(req: ReservationRequest):
    con = db()

    code = "MSH-" + datetime.utcnow().strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()
    now = datetime.utcnow().isoformat()

    contact = None
    hotel_email = ""
    hotel_phone = ""

    if req.hotel_id:
        contact = con.execute("SELECT * FROM hotel_contacts WHERE hotel_id = ?", (req.hotel_id,)).fetchone()
        if contact:
            hotel_email = (contact["email"] or "").strip()
            hotel_phone = (contact["phone"] or "").strip()

    if hotel_email:
        status = "AWAITING_HOTEL_CONFIRMATION"
        hotel_email_sent_at = now
    else:
        status = "MANUAL_HOTEL_CONTACT_REQUIRED"
        hotel_email_sent_at = ""

    con.execute("""
        INSERT INTO reservation_orders (
            reservation_code, created_at, updated_at, status, hotel_id, hotel_name, destination,
            checkin, checkout, guests, rooms, customer_name, customer_email,
            customer_phone, note, hotel_email, hotel_phone, hotel_email_sent_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        code, now, now, status, req.hotel_id, req.hotel_name,
        req.destination, req.checkin, req.checkout, req.guests, req.rooms,
        req.customer_name, str(req.customer_email), req.customer_phone, req.note,
        hotel_email, hotel_phone, hotel_email_sent_at
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
Status: {status}

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

Hotel email: {hotel_email if hotel_email else "NOT SAVED"}
Hotel phone: {hotel_phone if hotel_phone else "NOT SAVED"}

Next action:
- If status is AWAITING_HOTEL_CONFIRMATION, wait for hotel reply.
- If status is MANUAL_HOTEL_CONTACT_REQUIRED, add hotel contact route or contact hotel manually.
- After price is confirmed, use /admin/confirm-price.
"""

    send_email(str(req.customer_email), "MySpace Hotel reservation request received - " + code, customer_body)
    send_email(RESERVATIONS_EMAIL, "Action required: reservation follow-up - " + code, admin_body)

    hotel_email_sent = False
    if hotel_email:
        hotel_subject = "Reservation Request - MySpace Hotel Ref " + code
        hotel_body = hotel_request_email_body(code, req)
        hotel_email_sent = send_email(hotel_email, hotel_subject, hotel_body)

    return {
        "ok": True,
        "reservation_code": code,
        "status": status,
        "hotel_email_sent": hotel_email_sent,
        "message": "Reservation request received. Current price and availability will be confirmed before payment.",
    }


@router.get("/admin/reservations")
def admin_reservations():
    con = db()
    rows = con.execute("SELECT * FROM reservation_orders ORDER BY id DESC LIMIT 300").fetchall()
    con.close()
    return {"reservations": [dict(r) for r in rows]}


@router.post("/admin/resend-hotel-email/{reservation_code}")
def resend_hotel_email(reservation_code: str):
    con = db()
    row = con.execute("SELECT * FROM reservation_orders WHERE reservation_code = ?", (reservation_code,)).fetchone()

    if not row:
        con.close()
        raise HTTPException(status_code=404, detail="Reservation not found.")

    hotel_email = (row["hotel_email"] or "").strip()

    if not hotel_email:
        con.close()
        raise HTTPException(status_code=400, detail="No hotel email saved for this reservation.")

    req = ReservationRequest(
        hotel_id=row["hotel_id"] or "",
        hotel_name=row["hotel_name"],
        destination=row["destination"],
        checkin=row["checkin"],
        checkout=row["checkout"],
        guests=row["guests"],
        rooms=row["rooms"],
        customer_name=row["customer_name"],
        customer_email=row["customer_email"],
        customer_phone=row["customer_phone"] or "",
        note=row["note"] or "",
    )

    sent = send_email(
        hotel_email,
        "Reservation Request - MySpace Hotel Ref " + reservation_code,
        hotel_request_email_body(reservation_code, req),
    )

    now = datetime.utcnow().isoformat()
    con.execute("""
        UPDATE reservation_orders
        SET status = ?, updated_at = ?, hotel_email_sent_at = ?
        WHERE reservation_code = ?
    """, ("AWAITING_HOTEL_CONFIRMATION", now, now, reservation_code))
    con.commit()
    con.close()

    return {"ok": True, "reservation_code": reservation_code, "hotel_email_sent": sent}


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
    now = datetime.utcnow().isoformat()

    con.execute("""
        UPDATE reservation_orders
        SET status = ?, updated_at = ?, confirmed_price_minor = ?, currency = ?, hotel_reply_reference = ?,
            payment_url = ?, admin_note = ?
        WHERE reservation_code = ?
    """, (
        new_status, now, req.confirmed_price_minor, req.currency.upper(),
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
