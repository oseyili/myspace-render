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
import stripe
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

# =========================
# STRIPE
# =========================
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# =========================
# EMAIL CONFIG
# =========================
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")

# =========================
# APP
# =========================
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hotel_catalog.db"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# MODELS
# =========================
class PaymentCodeSend(BaseModel):
    hotel_id: str
    email: EmailStr

class PaymentCodeVerify(BaseModel):
    hotel_id: str
    email: EmailStr
    code: str

class CheckoutRequest(BaseModel):
    hotel_id: str
    email: EmailStr
    amount: int  # cents

# =========================
# DATABASE
# =========================
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
        email TEXT,
        hotel_id TEXT,
        code TEXT,
        expires_at TEXT,
        verified INTEGER DEFAULT 0,
        attempts INTEGER DEFAULT 0
    )
    """)

    conn.commit()
    conn.close()

init_db()

# =========================
# EMAIL
# =========================
def send_email(to, subject, html):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, [to], msg.as_string())

# =========================
# PAYMENT CODE
# =========================
def generate_code():
    return str(random.randint(100000, 999999))

@app.post("/api/payment-code/send")
def send_code(data: PaymentCodeSend):
    conn = get_conn()
    cur = conn.cursor()

    code = generate_code()
    expiry = datetime.utcnow() + timedelta(minutes=10)

    cur.execute("DELETE FROM payment_codes WHERE email=? AND hotel_id=?",
                (data.email, data.hotel_id))

    cur.execute("""
    INSERT INTO payment_codes (code_id,email,hotel_id,code,expires_at)
    VALUES (?,?,?,?,?)
    """, (
        str(uuid.uuid4()),
        data.email,
        data.hotel_id,
        code,
        expiry.isoformat()
    ))

    conn.commit()
    conn.close()

    send_email(
        data.email,
        "Your Payment Code",
        f"<h1>{code}</h1><p>Expires in 10 minutes</p>"
    )

    return {"status": "sent"}

@app.post("/api/payment-code/verify")
def verify_code(data: PaymentCodeVerify):
    conn = get_conn()
    cur = conn.cursor()

    row = cur.execute("""
    SELECT * FROM payment_codes
    WHERE email=? AND hotel_id=? AND verified=0
    """, (data.email, data.hotel_id)).fetchone()

    if not row:
        return {"verified": False}

    if datetime.utcnow() > datetime.fromisoformat(row["expires_at"]):
        return {"verified": False, "status": "expired"}

    if data.code != row["code"]:
        cur.execute("UPDATE payment_codes SET attempts = attempts + 1 WHERE code_id=?",
                    (row["code_id"],))
        conn.commit()
        return {"verified": False}

    cur.execute("UPDATE payment_codes SET verified=1 WHERE code_id=?",
                (row["code_id"],))
    conn.commit()
    conn.close()

    return {"verified": True}

# =========================
# STRIPE CHECKOUT
# =========================
@app.post("/api/payment/checkout")
def create_checkout(data: CheckoutRequest):
    conn = get_conn()
    cur = conn.cursor()

    verified = cur.execute("""
    SELECT * FROM payment_codes
    WHERE email=? AND hotel_id=? AND verified=1
    """, (data.email, data.hotel_id)).fetchone()

    if not verified:
        return {"error": "Email not verified"}

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "product_data": {
                    "name": "Hotel Reservation"
                },
                "unit_amount": data.amount,
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url="https://www.myspace-hotel.com/success",
        cancel_url="https://www.myspace-hotel.com/cancel",
    )

    return {"url": session.url}

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {
        "status": "live",
        "payment": "enabled",
        "email_code": "enabled"
    }