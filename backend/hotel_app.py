from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
from typing import Optional
from pathlib import Path
import os, sqlite3, uuid, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

load_dotenv()

# =========================
# CONFIG
# =========================
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USERNAME", "")
SMTP_PASS = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")

DB_PATH = Path(__file__).resolve().parent / "hotel_catalog.db"

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
class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""

# =========================
# DB
# =========================
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# =========================
# EMAIL
# =========================
def send_email(to, subject, html):
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as s:
            s.starttls()
            s.login(SMTP_USER, SMTP_PASS)
            s.sendmail(SMTP_FROM, [to], msg.as_string())

        return True
    except Exception as e:
        return str(e)

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {
        "status": "live",
        "hotel_source": "REAL_ONLY",
        "fake_data": False
    }

# =========================
# REAL HOTEL SEARCH ONLY
# =========================
@app.get("/api/hotels")
def search_hotels(
    country: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    area: Optional[str] = Query(None),
    page: int = Query(1),
    page_size: int = Query(24),
):
    conn = db()
    cur = conn.cursor()

    where = []
    params = []

    if country:
        where.append("LOWER(country) LIKE ?")
        params.append(f"%{country.lower()}%")

    if city:
        where.append("LOWER(city) LIKE ?")
        params.append(f"%{city.lower()}%")

    if area:
        where.append("LOWER(area) LIKE ?")
        params.append(f"%{area.lower()}%")

    where_sql = "WHERE " + " AND ".join(where) if where else ""

    total = cur.execute(
        f"SELECT COUNT(*) as total FROM hotels {where_sql}",
        params
    ).fetchone()["total"]

    if total == 0:
        return {
            "count": 0,
            "hotels": [],
            "message": "No live hotels available for this search yet. Please try another destination.",
        }

    offset = (page - 1) * page_size

    rows = cur.execute(
        f"""
        SELECT * FROM hotels
        {where_sql}
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset]
    ).fetchall()

    conn.close()

    return {
        "count": total,
        "hotels": [dict(r) for r in rows]
    }

# =========================
# RESERVATION + EMAIL
# =========================
@app.post("/api/request")
def request_booking(req: ReservationRequest):
    conn = db()
    cur = conn.cursor()

    hotel = cur.execute(
        "SELECT * FROM hotels WHERE id=?",
        (req.hotel_id,)
    ).fetchone()

    if not hotel:
        return {
            "status": "error",
            "message": "Hotel not found."
        }

    booking_id = str(uuid.uuid4())

    # EMAIL CONTENT
    html = f"""
    <h2>Reservation Request</h2>
    <p><b>Hotel:</b> {hotel['name']}</p>
    <p><b>Location:</b> {hotel['city']}, {hotel['country']}</p>
    <p><b>Customer:</b> {req.name}</p>
    <p><b>Email:</b> {req.email}</p>
    <p><b>Message:</b> {req.message}</p>
    <p><b>Booking ID:</b> {booking_id}</p>
    """

    support_result = send_email(SUPPORT_EMAIL, "New Reservation", html)
    customer_result = send_email(req.email, "Your Reservation Request", html)

    return {
        "status": "received",
        "booking_id": booking_id,
        "email_delivery": {
            "support": support_result,
            "customer": customer_result
        }
    }