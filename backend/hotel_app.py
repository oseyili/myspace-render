# =========================
# FULL HOTEL BOOKING SYSTEM
# =========================

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from datetime import datetime, timedelta
import os, uuid, sqlite3, smtplib, random, stripe
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

# =========================
# CONFIG
# =========================
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL")

DB_PATH = "hotel.db"

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
class CodeSend(BaseModel):
    email: EmailStr
    hotel_id: str

class CodeVerify(BaseModel):
    email: EmailStr
    hotel_id: str
    code: str

class Checkout(BaseModel):
    email: EmailStr
    hotel_id: str
    hotel_name: str
    amount: int

# =========================
# DATABASE
# =========================
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init():
    c = db().cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS codes (
        id TEXT PRIMARY KEY,
        email TEXT,
        hotel_id TEXT,
        code TEXT,
        expires TEXT,
        verified INTEGER DEFAULT 0
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS bookings (
        booking_id TEXT PRIMARY KEY,
        email TEXT,
        hotel_id TEXT,
        hotel_name TEXT,
        amount INTEGER,
        status TEXT,
        created TEXT
    )
    """)

    db().commit()

init()

# =========================
# EMAIL
# =========================
def send_email(to, subject, html):
    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASSWORD)
        s.sendmail(SMTP_FROM, to, msg.as_string())

# =========================
# PAYMENT CODE
# =========================
def gen_code():
    return str(random.randint(100000, 999999))

@app.post("/api/code/send")
def send_code(data: CodeSend):
    conn = db()
    c = conn.cursor()

    code = gen_code()
    expiry = (datetime.utcnow() + timedelta(minutes=10)).isoformat()

    c.execute("DELETE FROM codes WHERE email=? AND hotel_id=?", (data.email, data.hotel_id))

    c.execute("INSERT INTO codes VALUES (?,?,?,?,?,0)", (
        str(uuid.uuid4()),
        data.email,
        data.hotel_id,
        code,
        expiry
    ))

    conn.commit()
    conn.close()

    send_email(data.email, "Your Code", f"<h1>{code}</h1>")

    return {"status": "sent"}

@app.post("/api/code/verify")
def verify_code(data: CodeVerify):
    conn = db()
    c = conn.cursor()

    row = c.execute("SELECT * FROM codes WHERE email=? AND hotel_id=?", (data.email, data.hotel_id)).fetchone()

    if not row:
        return {"verified": False}

    if datetime.utcnow() > datetime.fromisoformat(row["expires"]):
        return {"verified": False}

    if data.code != row["code"]:
        return {"verified": False}

    c.execute("UPDATE codes SET verified=1 WHERE id=?", (row["id"],))
    conn.commit()
    conn.close()

    return {"verified": True}

# =========================
# CHECKOUT + BOOKING
# =========================
@app.post("/api/payment/checkout")
def checkout(data: Checkout):
    conn = db()
    c = conn.cursor()

    verified = c.execute(
        "SELECT * FROM codes WHERE email=? AND hotel_id=? AND verified=1",
        (data.email, data.hotel_id)
    ).fetchone()

    if not verified:
        return {"error": "Not verified"}

    booking_id = str(uuid.uuid4())

    c.execute("""
    INSERT INTO bookings VALUES (?,?,?,?,?,?,?)
    """, (
        booking_id,
        data.email,
        data.hotel_id,
        data.hotel_name,
        data.amount,
        "pending",
        datetime.utcnow().isoformat()
    ))

    conn.commit()
    conn.close()

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "product_data": {
                    "name": data.hotel_name,
                },
                "unit_amount": data.amount,
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=f"https://www.myspace-hotel.com/success?booking_id={booking_id}",
        cancel_url="https://www.myspace-hotel.com/cancel",
    )

    return {"url": session.url}

# =========================
# CONFIRM PAYMENT
# =========================
@app.get("/api/payment/success")
def payment_success(booking_id: str):
    conn = db()
    c = conn.cursor()

    booking = c.execute("SELECT * FROM bookings WHERE booking_id=?", (booking_id,)).fetchone()

    if not booking:
        return {"error": "Booking not found"}

    c.execute("UPDATE bookings SET status='paid' WHERE booking_id=?", (booking_id,))
    conn.commit()

    # EMAIL RECEIPT
    send_email(
        booking["email"],
        "Booking Confirmed",
        f"""
        <h2>Booking Confirmed</h2>
        <p>Hotel: {booking["hotel_name"]}</p>
        <p>Amount Paid: ${booking["amount"]/100}</p>
        <p>Booking ID: {booking_id}</p>
        """
    )

    return {"status": "paid"}

# =========================
# ADMIN VIEW BOOKINGS
# =========================
@app.get("/api/admin/bookings")
def get_bookings():
    conn = db()
    c = conn.cursor()

    rows = c.execute("SELECT * FROM bookings ORDER BY created DESC").fetchall()

    return [dict(r) for r in rows]

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {
        "status": "live",
        "booking_system": "enabled",
        "payments": "stripe",
        "email_verification": True
    }