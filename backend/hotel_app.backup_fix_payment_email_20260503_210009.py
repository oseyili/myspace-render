from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import os
import time
import uuid
import hashlib
import sqlite3
import requests
from pathlib import Path
from datetime import datetime

load_dotenv()

app = FastAPI(title="MySpace Hotel LIVE Automation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPLIER_MODE = "HOTELBEDS"

HOTELBEDS_API_KEY = os.getenv("HOTELBEDS_API_KEY", "")
HOTELBEDS_SECRET = os.getenv("HOTELBEDS_SECRET", "")
HOTELBEDS_BASE_URL = os.getenv("HOTELBEDS_BASE_URL", "https://api.test.hotelbeds.com")

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "http://localhost:5173")

DB_PATH = Path("C:/frontend/hotel-booking-app/backend/myspace_auto_bookings.db")


class ReservationRequest(BaseModel):
    hotel_id: str
    hotel_name: str
    destination: str
    checkin: str
    checkout: str
    guests: int
    rooms: int
    customer_name: str
    customer_email: EmailStr


def db():
    return sqlite3.connect(str(DB_PATH))


def hotelbeds_headers():
    ts = str(int(time.time()))
    sig = hashlib.sha256((HOTELBEDS_API_KEY + HOTELBEDS_SECRET + ts).encode()).hexdigest()
    return {
        "Api-key": HOTELBEDS_API_KEY,
        "X-Signature": sig,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def create_payment_link(code, hotel_name):
    headers = {
        "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    data = {
        "line_items[0][price_data][currency]": "gbp",
        "line_items[0][price_data][product_data][name]": hotel_name,
        "line_items[0][price_data][unit_amount]": "50",
        "line_items[0][quantity]": "1",
        "metadata[reservation_code]": code,
        "after_completion[type]": "redirect",
        "after_completion[redirect][url]": f"{PUBLIC_APP_URL}/reservation-confirmed?code={code}",
    }

    r = requests.post("https://api.stripe.com/v1/payment_links", headers=headers, data=data)
    return r.json().get("url")


@app.post("/reservation-request")
def reserve(req: ReservationRequest):
    code = "MSH-" + uuid.uuid4().hex[:6].upper()
    now = datetime.utcnow().isoformat()

    con = db()
    con.execute("""
        CREATE TABLE IF NOT EXISTS bookings (
            code TEXT,
            hotel_name TEXT,
            rate_key TEXT,
            status TEXT,
            created TEXT
        )
    """)

    con.execute("""
        INSERT INTO bookings VALUES (?, ?, ?, ?, ?)
    """, (code, req.hotel_name, "", "PAYMENT_PENDING", now))

    con.commit()
    con.close()

    payment_url = create_payment_link(code, req.hotel_name)

    return {
        "code": code,
        "payment_url": payment_url
    }


@app.post("/payment-confirmed/{code}")
def payment_confirmed(code: str, rate_key: str):
    url = HOTELBEDS_BASE_URL + "/hotel-api/1.0/bookings"

    payload = {
        "holder": {"name": "Test", "surname": "User"},
        "rooms": [{
            "rateKey": rate_key,
            "paxes": [{
                "roomId": 1,
                "type": "AD",
                "name": "Test",
                "surname": "User"
            }]
        }],
        "clientReference": code
    }

    r = requests.post(url, headers=hotelbeds_headers(), json=payload)

    data = r.json()

    con = db()
    con.execute("""
        UPDATE bookings
        SET status = ?
        WHERE code = ?
    """, ("CONFIRMED" if r.status_code == 200 else "FAILED", code))
    con.commit()
    con.close()

    return {
        "ok": r.status_code == 200,
        "supplier_response": data
    }


@app.get("/status")
def status():
    return {
        "hotelbeds": True,
        "stripe": bool(STRIPE_SECRET_KEY)
    }