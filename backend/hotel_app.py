import os
import sqlite3
import requests
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "hotel_catalog.db"

def load_env():
    env_path = BASE_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env()

SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")
RESERVATIONS_EMAIL = os.getenv("RESERVATIONS_EMAIL", "reservations@myspace-hotel.com")

app = FastAPI(title="My Space Hotel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://myspace-hotel.com",
        "https://www.myspace-hotel.com",
        "https://myspace-frontend.vercel.app",
        "https://myspace-hotel.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def table_columns():
    con = db()
    try:
        rows = con.execute("PRAGMA table_info(hotels)").fetchall()
        return [r["name"] for r in rows]
    finally:
        con.close()

def first(row, names, default=""):
    for name in names:
        if name in row.keys() and row[name] not in [None, ""]:
            return row[name]
    return default

def hotel_to_dict(row):
    d = dict(row)
    image = first(row, ["image", "high_res_image", "image_url", "photo_url", "main_photo_url", "max_photo_url"])
    return {
        "id": str(first(row, ["id", "hotel_id", "supplier_hotel_id"])),
        "name": str(first(row, ["name", "hotel_name"], "Unnamed stay")),
        "country": str(first(row, ["country", "country_trans", "country_name"], "")),
        "city": str(first(row, ["city", "city_name", "destination"], "")),
        "area": str(first(row, ["area", "district", "districts"], "")),
        "address": str(first(row, ["address", "address_trans"], "")),
        "rating": str(first(row, ["rating", "class", "review_score"], "")),
        "review_score": str(first(row, ["review_score", "rating"], "")),
        "review_count": str(first(row, ["review_count", "review_nr"], "")),
        "price": str(first(row, ["price", "min_total_price", "gross_price"], "")),
        "currency": str(first(row, ["currency", "currencycode", "currency_code"], "")),
        "image": str(image),
        "high_res_image": str(image),
        "facilities": str(first(row, ["facilities", "hotel_facilities"], "")),
        "description": str(first(row, ["description", "accommodation_type_name"], "")),
        "latitude": str(first(row, ["latitude", "lat"], "")),
        "longitude": str(first(row, ["longitude", "lon", "lng"], "")),
        "source": str(first(row, ["source_note", "supplier"], "hotel_catalog")),
        "raw": d,
    }

@app.get("/")
def root():
    return {"ok": True, "app": "My Space Hotel Backend", "support": SUPPORT_EMAIL}

@app.get("/api/health")
def health():
    return {"ok": True, "database_exists": DB_PATH.exists()}

@app.get("/api/admin/catalogue-status")
def catalogue_status():
    con = db()
    try:
        total = con.execute("SELECT COUNT(*) FROM hotels").fetchone()[0]
        countries = [r[0] for r in con.execute("SELECT DISTINCT country FROM hotels WHERE country IS NOT NULL AND country != '' ORDER BY country LIMIT 50").fetchall()]
        cities = [r[0] for r in con.execute("SELECT DISTINCT city FROM hotels WHERE city IS NOT NULL AND city != '' ORDER BY city LIMIT 50").fetchall()]
        return {
            "total_hotels": total,
            "countries_loaded": countries,
            "cities_loaded": cities,
            "database_file": str(DB_PATH),
            "database_protected": True,
            "fake_data": False,
            "rapidapi_key_loaded": bool(os.getenv("RAPIDAPI_KEY")),
            "email_ready": bool(os.getenv("RESEND_API_KEY")),
        }
    finally:
        con.close()

def search_hotels_core(country="", city="", destination="", q="", facilities="", page=1, page_size=60, limit=None):
    page = max(int(page or 1), 1)
    page_size = int(limit or page_size or 60)
    page_size = max(1, min(page_size, 100))

    where = []
    params = []

    search_text = (q or destination or "").strip()
    if country:
        where.append("LOWER(COALESCE(country,'')) LIKE LOWER(?)")
        params.append(f"%{country.strip()}%")

    if city:
        where.append("(LOWER(COALESCE(city,'')) LIKE LOWER(?) OR LOWER(COALESCE(area,'')) LIKE LOWER(?) OR LOWER(COALESCE(address,'')) LIKE LOWER(?))")
        params.extend([f"%{city.strip()}%", f"%{city.strip()}%", f"%{city.strip()}%"])

    if search_text:
        where.append("(LOWER(COALESCE(name,'')) LIKE LOWER(?) OR LOWER(COALESCE(city,'')) LIKE LOWER(?) OR LOWER(COALESCE(country,'')) LIKE LOWER(?) OR LOWER(COALESCE(area,'')) LIKE LOWER(?) OR LOWER(COALESCE(address,'')) LIKE LOWER(?))")
        params.extend([f"%{search_text}%"] * 5)

    if facilities:
        wanted = [x.strip().lower() for x in facilities.split(",") if x.strip()]
        for item in wanted:
            where.append("LOWER(COALESCE(facilities,'')) LIKE LOWER(?)")
            params.append(f"%{item}%")

    sql_where = "WHERE " + " AND ".join(where) if where else ""
    offset = (page - 1) * page_size

    con = db()
    try:
        total = con.execute(f"SELECT COUNT(*) FROM hotels {sql_where}", params).fetchone()[0]
        rows = con.execute(
            f"""
            SELECT * FROM hotels
            {sql_where}
            ORDER BY
              CASE WHEN image IS NOT NULL AND image != '' THEN 0 ELSE 1 END,
              CASE WHEN rating IS NOT NULL AND rating != '' THEN 0 ELSE 1 END,
              name
            LIMIT ? OFFSET ?
            """,
            params + [page_size, offset],
        ).fetchall()

        items = [hotel_to_dict(r) for r in rows]
        return {
            "ok": True,
            "source": "database",
            "fake_data": False,
            "total": total,
            "shown": len(items),
            "page": page,
            "page_size": page_size,
            "has_more": offset + len(items) < total,
            "hotels": items,
            "results": items,
            "items": items,
            "message": "" if total else "No matching stays were found.",
        }
    finally:
        con.close()

@app.get("/api/hotels/search")
def hotels_search(
    country: str = "",
    city: str = "",
    destination: str = "",
    q: str = "",
    facilities: str = "",
    page: int = 1,
    page_size: int = 60,
    limit: Optional[int] = None,
):
    return search_hotels_core(country, city, destination, q, facilities, page, page_size, limit)

@app.get("/api/hotels")
def hotels(
    country: str = "",
    city: str = "",
    destination: str = "",
    q: str = "",
    facilities: str = "",
    page: int = 1,
    page_size: int = 60,
    limit: Optional[int] = None,
):
    return search_hotels_core(country, city, destination, q, facilities, page, page_size, limit)

@app.get("/api/hotels-premium")
def hotels_premium(
    country: str = "",
    city: str = "",
    destination: str = "",
    q: str = "",
    facilities: str = "",
    page: int = 1,
    page_size: int = 60,
    limit: Optional[int] = None,
):
    return search_hotels_core(country, city, destination, q, facilities, page, page_size, limit)

class AvailabilityRequest(BaseModel):
    name: str = ""
    email: str = ""
    message: str = ""
    hotel_name: str = ""
    hotel_id: str = ""
    property: str = ""
    selected_hotel: str = ""

def send_resend_email(to_email: str, subject: str, html: str, reply_to: str = ""):
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    sender = os.getenv("RESEND_FROM", "reservations@myspace-hotel.com").strip()

    if not resend_key:
        raise RuntimeError("RESEND_API_KEY is missing.")
    if not to_email:
        raise RuntimeError("Recipient email is missing.")

    payload = {
        "from": sender,
        "to": [to_email],
        "subject": subject,
        "html": html,
    }

    if reply_to:
        payload["reply_to"] = reply_to

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=30,
    )

    if response.status_code >= 300:
        raise RuntimeError(f"Resend failed: {response.status_code} {response.text[:500]}")

    return True

def send_availability_email(req: AvailabilityRequest):
    hotel_name = req.hotel_name or req.property or req.selected_hotel or "Selected stay"
    customer_name = req.name or "Customer"
    customer_email = req.email.strip()
    message_text = req.message or ""

    admin_html = f"""
    <h2>New availability request</h2>
    <p><b>Hotel / stay:</b> {hotel_name}</p>
    <p><b>Customer name:</b> {customer_name}</p>
    <p><b>Customer email:</b> {customer_email}</p>
    <p><b>Request:</b><br>{message_text}</p>
    """

    send_resend_email(
        RESERVATIONS_EMAIL,
        f"New availability request - {hotel_name}",
        admin_html,
        reply_to=customer_email,
    )

    if customer_email:
        customer_html = f"""
        <h2>Your availability request has been received</h2>
        <p>Hello {customer_name},</p>
        <p>Thank you for contacting My Space Hotel.</p>
        <p>We have received your request for:</p>
        <p><b>{hotel_name}</b></p>
        <p>Our reservations team will review your request and continue by email.</p>
        <p><b>Your message:</b><br>{message_text}</p>
        <p>Kind regards,<br>My Space Hotel Reservations</p>
        """

        send_resend_email(
            customer_email,
            f"We received your request - {hotel_name}",
            customer_html,
            reply_to=RESERVATIONS_EMAIL,
        )

    return True

def send_reservation_email(payload):
    if isinstance(payload, dict):
        return send_availability_email(AvailabilityRequest(**payload))
    return send_availability_email(payload)

@app.post("/api/request-availability")
def request_availability(req: AvailabilityRequest):
    try:
        send_availability_email(req)
        return {
            "ok": True,
            "email_sent": True,
            "message": "Availability request received.",
            "support_email": SUPPORT_EMAIL,
        }
    except Exception as e:
        print("AVAILABILITY EMAIL ERROR:", str(e))
        return {
            "ok": False,
            "email_sent": False,
            "message": "Request was received but email could not be sent.",
            "error": str(e),
            "support_email": SUPPORT_EMAIL,
        }

@app.post("/api/reservation-request")
def reservation_request(req: AvailabilityRequest):
    return request_availability(req)
