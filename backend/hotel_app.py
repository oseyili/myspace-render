import os
import requests
import smtplib
from email.message import EmailMessage
import sqlite3

# =========================================================
# RESERVATION EMAIL SUPPORT
# Uses environment variables only. Do not hard-code secrets.
# Required env:
# SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, RESERVATIONS_EMAIL
# =========================================================
import smtplib
from email.message import EmailMessage

def _env(name, default=""):
    import os
    return os.getenv(name, default).strip()

def send_reservation_email(payload: dict):
    smtp_host = _env("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(_env("SMTP_PORT", "587"))
    smtp_user = _env("SMTP_USER")
    smtp_pass = _env("SMTP_PASS")
    support_email = _env("RESERVATIONS_EMAIL", "reservations@myspace-hotel.com")

    if not smtp_user or not smtp_pass:
        raise RuntimeError("SMTP_USER or SMTP_PASS is missing in environment variables.")

    hotel_name = payload.get("hotel_name") or payload.get("property") or payload.get("property_name") or payload.get("selected_hotel") or "Selected stay"
    customer_name = payload.get("name") or payload.get("customer_name") or ""
    customer_email = payload.get("email") or payload.get("customer_email") or ""
    message_text = payload.get("message") or payload.get("special_requests") or payload.get("notes") or payload.get("request") or ""

    msg = EmailMessage()
    msg["Subject"] = f"New availability request - {hotel_name}"
    msg["From"] = smtp_user
    msg["To"] = support_email
    if customer_email:
        msg["Reply-To"] = customer_email

    msg.set_content(f"""New reservation availability request

Hotel / stay:
{hotel_name}

Customer name:
{customer_name}

Customer email:
{customer_email}

Request:
{message_text}

Full submitted payload:
{payload}
""")

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)

    return True


from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

DB_FILE = os.path.join(os.path.dirname(__file__), "hotel_catalog.db")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "reservations@myspace-hotel.com")



def send_availability_email(req):
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    sender = os.getenv("RESEND_FROM", "onboarding@resend.dev").strip()
    receiver = os.getenv("RESERVATIONS_EMAIL", "").strip() or os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip() or SUPPORT_EMAIL

    if not resend_key:
        raise RuntimeError("RESEND_API_KEY is missing.")
    if not receiver:
        raise RuntimeError("RESERVATIONS_EMAIL is missing.")

    hotel_name = getattr(req, "hotel_name", "") or getattr(req, "property", "") or getattr(req, "selected_hotel", "") or "Selected stay"
    customer_name = getattr(req, "name", "") or ""
    customer_email = getattr(req, "email", "") or ""
    message_text = getattr(req, "message", "") or ""

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": sender,
            "to": [receiver],
            "subject": f"New availability request - {hotel_name}",
            "reply_to": customer_email,
            "html": f"""
            <h2>New availability request</h2>
            <p><b>Hotel / stay:</b> {hotel_name}</p>
            <p><b>Customer name:</b> {customer_name}</p>
            <p><b>Customer email:</b> {customer_email}</p>
            <p><b>Request:</b><br>{message_text}</p>
            """,
        },
        timeout=30,
    )

    if response.status_code >= 300:
        raise RuntimeError(f"Resend failed: {response.status_code} {response.text[:300]}")

    return True



app = FastAPI(title="My Space Hotel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

COUNTRY_ALIASES = {
    "uk": ["uk", "gb", "united kingdom", "england", "great britain", "britain"],
    "gb": ["uk", "gb", "united kingdom", "england", "great britain", "britain"],
    "usa": ["usa", "us", "united states", "america", "united states of america"],
    "us": ["usa", "us", "united states", "america", "united states of america"],
    "ng": ["ng", "nigeria"],
    "nigeria": ["ng", "nigeria"],
}

IMAGE_COLUMNS = [
    "image", "image_url", "photo_url", "main_photo_url", "max_photo_url",
    "hotel_photo", "picture", "thumbnail", "url_max", "photo"
]

NAME_COLUMNS = ["name", "hotel_name", "title", "property_name"]
CITY_COLUMNS = ["city", "city_name", "destination", "dest_name"]
COUNTRY_COLUMNS = ["country", "country_name", "cc1", "countrycode"]
AREA_COLUMNS = ["area", "district", "district_name", "neighbourhood", "neighborhood"]
ADDRESS_COLUMNS = ["address", "address_trans", "full_address"]
RATING_COLUMNS = ["rating", "stars", "class", "hotel_class"]
REVIEW_COLUMNS = ["review_score", "score", "rating_score"]
PRICE_COLUMNS = ["price", "min_total_price", "gross_price", "amount"]
CURRENCY_COLUMNS = ["currency", "currencycode", "currency_code"]
FACILITY_COLUMNS = ["facilities", "hotel_facilities", "amenities", "description"]

def con():
    db = sqlite3.connect(DB_FILE)
    db.row_factory = sqlite3.Row
    return db

def first(row, cols):
    for c in cols:
        if c in row.keys() and row[c] not in [None, ""]:
            return str(row[c])
    return ""

def high_res(url):
    if not url:
        return ""
    url = str(url)
    return (
        url.replace("square60", "max1280x900")
           .replace("square90", "max1280x900")
           .replace("square200", "max1280x900")
           .replace("max300", "max1280x900")
           .replace("max500", "max1280x900")
    )

def blob(row):
    return " ".join([str(row[k] or "") for k in row.keys()]).lower()

def country_terms(value):
    v = (value or "").strip().lower()
    return COUNTRY_ALIASES.get(v, [v] if v else [])

def normalise(row):
    d = dict(row)
    return {
        "id": first(row, ["id", "hotel_id", "property_id"]) or str(abs(hash(str(d)))),
        "name": first(row, NAME_COLUMNS) or "Hotel",
        "country": first(row, COUNTRY_COLUMNS),
        "city": first(row, CITY_COLUMNS),
        "area": first(row, AREA_COLUMNS),
        "address": first(row, ADDRESS_COLUMNS),
        "rating": first(row, RATING_COLUMNS),
        "review_score": first(row, REVIEW_COLUMNS),
        "price": first(row, PRICE_COLUMNS),
        "currency": first(row, CURRENCY_COLUMNS),
        "image": high_res(first(row, IMAGE_COLUMNS)),
        "facilities": first(row, FACILITY_COLUMNS),
        "latitude": first(row, ["latitude", "lat"]),
        "longitude": first(row, ["longitude", "lng", "lon"]),
        "source": first(row, ["source"]) or "hotel_catalog",
    }

@app.get("/")
def root():
    return {"ok": True, "app": "My Space Hotel Backend", "support": SUPPORT_EMAIL}

@app.get("/api/admin/catalogue-status")
def catalogue_status():
    db = con()
    total = db.execute("SELECT COUNT(*) AS c FROM hotels").fetchone()["c"]
    sample = db.execute("SELECT * FROM hotels LIMIT 1").fetchone()
    columns = sample.keys() if sample else []
    countries = []
    cities = []

    for c in COUNTRY_COLUMNS:
        if c in columns:
            countries = [r[0] for r in db.execute(f"SELECT DISTINCT {c} FROM hotels WHERE {c} IS NOT NULL AND {c} != '' LIMIT 40").fetchall()]
            break

    for c in CITY_COLUMNS:
        if c in columns:
            cities = [r[0] for r in db.execute(f"SELECT DISTINCT {c} FROM hotels WHERE {c} IS NOT NULL AND {c} != '' LIMIT 80").fetchall()]
            break

    db.close()
    return {
        "total_hotels": total,
        "countries_loaded": countries,
        "cities_loaded": cities,
        "database_file": DB_FILE,
        "database_protected": True,
        "fake_data": False,
        "rapidapi_key_loaded": bool(os.getenv("RAPIDAPI_KEY", "")),
        "email_ready": bool(SUPPORT_EMAIL),
    }

@app.get("/api/hotels/search")
@app.get("/api/search-hotels")
@app.get("/api/search")
def search_hotels(
    country: str = "",
    city: str = "",
    area: str = "",
    destination: str = "",
    keyword: str = "",
    guests: int = 2,
    facilities: Optional[str] = "",
    limit: int = Query(60, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    city = city or destination
    country_needles = country_terms(country)
    city_needles = [city.strip().lower()] if city.strip() else []
    area_needles = [area.strip().lower()] if area.strip() else []
    keyword_needles = [keyword.strip().lower()] if keyword.strip() else []
    facility_needles = [x.strip().lower() for x in (facilities or "").split(",") if x.strip()]

    db = con()
    rows = db.execute("SELECT * FROM hotels").fetchall()
    db.close()

    matches = []
    for row in rows:
        b = blob(row)

        if country_needles and not any(x in b for x in country_needles):
            continue
        if city_needles and not any(x in b for x in city_needles):
            continue
        if area_needles and not any(x in b for x in area_needles):
            continue
        if keyword_needles and not any(x in b for x in keyword_needles):
            continue
        if facility_needles and not all(x in b for x in facility_needles):
            continue

        matches.append(normalise(row))

    page = matches[offset:offset + limit]

    return {
        "ok": True,
        "source": "database",
        "fake_data": False,
        "total": len(matches),
        "shown": len(page),
        "hotels": page,
        "results": page,
        "message": "" if page else "No matching hotels found for this search.",
    }

class AvailabilityRequest(BaseModel):
    name: str = ""
    email: str = ""
    message: str = ""
    hotel_name: str = ""
    hotel_id: str = ""
    property: str = ""
    selected_hotel: str = ""


# =========================================================
# RESERVATION REQUEST ENDPOINTS
# =========================================================
@app.post("/api/reservation-request")
async def reservation_request(payload: dict):
    try:
        send_reservation_email(payload)
        return {"ok": True, "email_sent": True, "message": "Availability request sent."}
    except Exception as e:
        print("RESERVATION EMAIL ERROR:", str(e))
        return {"ok": False, "email_sent": False, "message": "Request was received but email could not be sent.", "error": str(e)}

@app.post("/api/request-availability")
async def request_availability(payload: dict):
    try:
        send_reservation_email(payload)
        return {"ok": True, "email_sent": True, "message": "Availability request sent."}
    except Exception as e:
        print("REQUEST AVAILABILITY EMAIL ERROR:", str(e))
        return {"ok": False, "email_sent": False, "message": "Request was received but email could not be sent.", "error": str(e)}

