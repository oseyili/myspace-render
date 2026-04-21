import html
import os
import smtplib
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

load_dotenv()

APP_NAME = "My Space Hotel Booking API"
APP_VERSION = "2026-04-21-reservation-email-html"

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").strip()
DB_PATH = os.getenv("BOOKING_DB_PATH", "hotel_app.db").strip()

SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587").strip() or "587")
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"

SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com").strip()
ADMIN_NOTIFICATION_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", SUPPORT_EMAIL).strip()


app = FastAPI(title=APP_NAME, version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_URL,
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS reservation_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                reservation_reference TEXT NOT NULL UNIQUE,
                hotel_id TEXT NOT NULL,
                hotel_name TEXT NOT NULL,
                city TEXT NOT NULL,
                country TEXT NOT NULL,
                checkin_date TEXT,
                checkout_date TEXT,
                nights INTEGER,
                price INTEGER,
                currency TEXT,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                status TEXT NOT NULL,
                notes TEXT
            )
            """
        )
        conn.commit()


init_db()


class ReservationRequestIn(BaseModel):
    hotel_id: str
    hotel_name: str
    city: str
    country: str
    checkin_date: Optional[str] = ""
    checkout_date: Optional[str] = ""
    nights: Optional[int] = 1
    price: Optional[int] = 0
    currency: Optional[str] = "GBP"
    customer_name: str
    customer_email: EmailStr
    notes: Optional[str] = ""


class ReservationRequestOut(BaseModel):
    ok: bool
    reservation_reference: str
    message: str
    email_sent: bool


def build_reference() -> str:
    stamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"MSH-{stamp}"


def smtp_is_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USERNAME and SMTP_PASSWORD and SUPPORT_EMAIL)


def send_email(
    *,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> None:
    if not smtp_is_configured():
        raise RuntimeError(
            "SMTP is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SUPPORT_EMAIL to backend .env."
        )

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = SUPPORT_EMAIL
    message["To"] = to_email

    if reply_to:
        message["Reply-To"] = reply_to

    message.set_content(body_text)

    if body_html:
        message.add_alternative(body_html, subtype="html")

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        if SMTP_USE_TLS:
            server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(message)


def clean_name(name: str) -> str:
    raw = (name or "").strip()
    if not raw:
        return "Guest"
    words = [w for w in raw.replace(",", " ").split() if w.strip()]
    if not words:
        return "Guest"
    cleaned = []
    for word in words:
        cleaned.append(word[:1].upper() + word[1:].lower())
    return " ".join(cleaned)


def first_name_only(name: str) -> str:
    cleaned = clean_name(name)
    return cleaned.split()[0] if cleaned else "Guest"


def format_date_for_email(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return "To be confirmed"
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%d %B %Y")
    except ValueError:
        return value


def format_money(value: int, currency: str) -> str:
    currency = (currency or "GBP").upper()
    try:
        amount = int(value or 0)
    except Exception:
        amount = 0
    symbol_map = {
        "GBP": "£",
        "USD": "$",
        "EUR": "€",
    }
    symbol = symbol_map.get(currency)
    if symbol:
        return f"{symbol}{amount}"
    return f"{currency} {amount}"


def esc(value: str) -> str:
    return html.escape(value or "")


def build_customer_subject() -> str:
    return "Your Reservation Request Has Been Received – My Space Hotel"


def build_customer_text_body(payload: ReservationRequestIn, reservation_reference: str) -> str:
    first_name = first_name_only(payload.customer_name)
    hotel_name = payload.hotel_name.strip()
    city = payload.city.strip()
    country = payload.country.strip()
    checkin = format_date_for_email(payload.checkin_date or "")
    checkout = format_date_for_email(payload.checkout_date or "")
    nights = int(payload.nights or 1)
    estimated_total = format_money(payload.price or 0, payload.currency or "GBP")

    return f"""Hello {first_name},

Thank you for choosing My Space Hotel.

Your reservation request has been received and we are now checking availability for your selected stay.

Reservation Details
Reference: {reservation_reference}
Hotel: {hotel_name}
Location: {city}, {country}
Check-in: {checkin}
Check-out: {checkout}
Nights: {nights}
Estimated total: {estimated_total}

What happens next
Your room request will be reviewed and availability will be confirmed by email.
No payment is required at this stage.
If your selected room is available, we will contact you with the next booking step.

You will only be contacted from this official email address:
{SUPPORT_EMAIL}

If you have any questions, you can reply directly to this email.

Kind regards,
My Space Hotel Reservations
{SUPPORT_EMAIL}
"""


def build_customer_html_body(payload: ReservationRequestIn, reservation_reference: str) -> str:
    first_name = first_name_only(payload.customer_name)
    hotel_name = payload.hotel_name.strip()
    city = payload.city.strip()
    country = payload.country.strip()
    checkin = format_date_for_email(payload.checkin_date or "")
    checkout = format_date_for_email(payload.checkout_date or "")
    nights = int(payload.nights or 1)
    estimated_total = format_money(payload.price or 0, payload.currency or "GBP")

    return f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#081225;">
    <div style="max-width:680px;margin:0 auto;padding:24px;">
      <div style="background:#081225;border-radius:20px 20px 0 0;padding:28px 28px 20px 28px;">
        <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#9fb5ce;">My Space Hotel</div>
        <div style="margin-top:10px;font-size:30px;line-height:1.2;font-weight:700;color:#ffffff;">
          Your reservation request has been received
        </div>
        <div style="margin-top:10px;font-size:16px;line-height:1.6;color:#d7e4f1;">
          Thank you for choosing My Space Hotel. We are now checking availability for your selected stay.
        </div>
      </div>

      <div style="background:#ffffff;border:1px solid #dbe3ef;border-top:none;border-radius:0 0 20px 20px;padding:28px;">
        <p style="margin:0 0 18px 0;font-size:18px;line-height:1.5;color:#081225;">
          Hello {esc(first_name)},
        </p>

        <div style="background:#f8fbff;border:1px solid #dbe9f7;border-radius:16px;padding:18px 18px 10px 18px;margin-bottom:18px;">
          <div style="font-size:18px;font-weight:700;color:#081225;margin-bottom:12px;">Reservation details</div>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#5a6d82;font-size:14px;width:42%;">Reference</td>
              <td style="padding:8px 0;color:#081225;font-size:14px;font-weight:700;">{esc(reservation_reference)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#5a6d82;font-size:14px;">Hotel</td>
              <td style="padding:8px 0;color:#081225;font-size:14px;font-weight:700;">{esc(hotel_name)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#5a6d82;font-size:14px;">Location</td>
              <td style="padding:8px 0;color:#081225;font-size:14px;">{esc(city)}, {esc(country)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#5a6d82;font-size:14px;">Check-in</td>
              <td style="padding:8px 0;color:#081225;font-size:14px;">{esc(checkin)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#5a6d82;font-size:14px;">Check-out</td>
              <td style="padding:8px 0;color:#081225;font-size:14px;">{esc(checkout)}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#5a6d82;font-size:14px;">Nights</td>
              <td style="padding:8px 0;color:#081225;font-size:14px;">{nights}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#5a6d82;font-size:14px;">Estimated total</td>
              <td style="padding:8px 0;color:#081225;font-size:18px;font-weight:700;">{esc(estimated_total)}</td>
            </tr>
          </table>
        </div>

        <div style="background:#fff8e6;border:1px solid #f1d27a;border-radius:16px;padding:18px;margin-bottom:18px;">
          <div style="font-size:18px;font-weight:700;color:#081225;margin-bottom:10px;">What happens next</div>
          <div style="font-size:15px;line-height:1.7;color:#32475c;">
            Your room request will be reviewed and availability will be confirmed by email.<br>
            No payment is required at this stage.<br>
            If your selected room is available, we will contact you with the next booking step.
          </div>
        </div>

        <div style="font-size:15px;line-height:1.7;color:#32475c;margin-bottom:18px;">
          You will only be contacted from this official email address:
          <span style="font-weight:700;color:#081225;">{esc(SUPPORT_EMAIL)}</span>
        </div>

        <div style="font-size:15px;line-height:1.7;color:#32475c;margin-bottom:18px;">
          If you have any questions, you can reply directly to this email.
        </div>

        <div style="font-size:15px;line-height:1.7;color:#32475c;">
          We look forward to welcoming you.
        </div>

        <div style="margin-top:22px;font-size:15px;line-height:1.7;color:#081225;">
          Kind regards,<br>
          <strong>My Space Hotel Reservations</strong><br>
          <a href="mailto:{esc(SUPPORT_EMAIL)}" style="color:#1d4ed8;text-decoration:none;">{esc(SUPPORT_EMAIL)}</a>
        </div>
      </div>
    </div>
  </body>
</html>
"""


def build_admin_subject(reservation_reference: str, hotel_name: str) -> str:
    return f"New Reservation Request – {reservation_reference} – {hotel_name}"


def build_admin_text_body(payload: ReservationRequestIn, reservation_reference: str) -> str:
    customer_name = clean_name(payload.customer_name)
    hotel_name = payload.hotel_name.strip()
    city = payload.city.strip()
    country = payload.country.strip()
    checkin = format_date_for_email(payload.checkin_date or "")
    checkout = format_date_for_email(payload.checkout_date or "")
    nights = int(payload.nights or 1)
    estimated_total = format_money(payload.price or 0, payload.currency or "GBP")
    notes = (payload.notes or "").strip() or "None"

    return f"""A new reservation request has been received.

Reservation Details
Reference: {reservation_reference}
Hotel: {hotel_name}
Hotel ID: {payload.hotel_id}
Location: {city}, {country}
Check-in: {checkin}
Check-out: {checkout}
Nights: {nights}
Estimated total: {estimated_total}

Customer Details
Name: {customer_name}
Email: {payload.customer_email.strip()}

Customer Notes
{notes}

Current Status
pending_availability_confirmation

Action Needed
Review availability and reply to the customer if the room can be confirmed.

My Space Hotel Reservations System
"""


@app.get("/health")
def health():
    return {
        "ok": True,
        "app": APP_NAME,
        "version": APP_VERSION,
        "frontend_url": FRONTEND_URL,
        "smtp_configured": smtp_is_configured(),
        "support_email": SUPPORT_EMAIL,
        "admin_notification_email": ADMIN_NOTIFICATION_EMAIL,
    }


@app.post("/reservations/request", response_model=ReservationRequestOut)
def create_reservation_request(payload: ReservationRequestIn):
    reservation_reference = build_reference()

    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO reservation_requests (
                created_at,
                reservation_reference,
                hotel_id,
                hotel_name,
                city,
                country,
                checkin_date,
                checkout_date,
                nights,
                price,
                currency,
                customer_name,
                customer_email,
                status,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now_utc(),
                reservation_reference,
                payload.hotel_id,
                payload.hotel_name.strip(),
                payload.city.strip(),
                payload.country.strip(),
                (payload.checkin_date or "").strip(),
                (payload.checkout_date or "").strip(),
                int(payload.nights or 1),
                int(payload.price or 0),
                (payload.currency or "GBP").upper(),
                payload.customer_name.strip(),
                payload.customer_email.strip(),
                "pending_availability_confirmation",
                (payload.notes or "").strip(),
            ),
        )
        conn.commit()

    customer_subject = build_customer_subject()
    customer_text = build_customer_text_body(payload, reservation_reference)
    customer_html = build_customer_html_body(payload, reservation_reference)

    admin_subject = build_admin_subject(reservation_reference, payload.hotel_name.strip())
    admin_text = build_admin_text_body(payload, reservation_reference)

    email_sent = False
    email_errors = []

    try:
        send_email(
            to_email=payload.customer_email.strip(),
            subject=customer_subject,
            body_text=customer_text,
            body_html=customer_html,
            reply_to=SUPPORT_EMAIL,
        )
        email_sent = True
    except Exception as exc:
        email_errors.append(f"Customer email failed: {exc}")

    try:
        send_email(
            to_email=ADMIN_NOTIFICATION_EMAIL,
            subject=admin_subject,
            body_text=admin_text,
            reply_to=payload.customer_email.strip(),
        )
    except Exception as exc:
        email_errors.append(f"Admin email failed: {exc}")

    if email_errors:
        with closing(get_conn()) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE reservation_requests
                SET notes = ?
                WHERE reservation_reference = ?
                """,
                (" | ".join(email_errors), reservation_reference),
            )
            conn.commit()

    message = (
        "Reservation request saved and email sent."
        if email_sent
        else "Reservation request saved, but email was not sent. Check backend SMTP settings."
    )

    return ReservationRequestOut(
        ok=True,
        reservation_reference=reservation_reference,
        message=message,
        email_sent=email_sent,
    )


@app.get("/reservations")
def list_reservations():
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                id,
                created_at,
                reservation_reference,
                hotel_name,
                city,
                country,
                customer_name,
                customer_email,
                status,
                notes
            FROM reservation_requests
            ORDER BY id DESC
            LIMIT 100
            """
        )
        items = [dict(row) for row in cur.fetchall()]
        return {"items": items}