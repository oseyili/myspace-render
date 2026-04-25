from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
import os, requests, uuid, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="My Space Hotel Backend")

# =========================
# CORS
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# ENV
# =========================
RAPID_KEY = os.getenv("RAPIDAPI_KEY", "")
RAPID_HOST = "apidojo-booking-v1.p.rapidapi.com"

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USERNAME")
SMTP_PASS = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM")
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL")

# =========================
# MODELS
# =========================
class ReservationRequest(BaseModel):
    hotel_id: str
    name: str
    email: EmailStr
    message: str = ""

# =========================
# EMAIL FUNCTION
# =========================
def send_email(to_email, subject, html):
    try:
        msg = MIMEMultipart()
        msg["From"] = SMTP_FROM
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(html, "html"))

        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_FROM, to_email, msg.as_string())
        server.quit()

        return True, ""
    except Exception as e:
        return False, str(e)

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {
        "status": "live",
        "message": "Full backend active",
        "rapid_connected": bool(RAPID_KEY),
        "email_configured": bool(SMTP_USER)
    }

# =========================
# LOCATION SEARCH (REQUIRED FIRST)
# =========================
def get_dest_id(city):
    url = "https://apidojo-booking-v1.p.rapidapi.com/locations/auto-complete"
    headers = {
        "X-RapidAPI-Key": RAPID_KEY,
        "X-RapidAPI-Host": RAPID_HOST
    }
    params = {
        "text": city,
        "languagecode": "en-us"
    }

    r = requests.get(url, headers=headers, params=params)

    if r.status_code != 200:
        return None

    data = r.json()

    if not data:
        return None

    return data[0].get("dest_id")

# =========================
# HOTEL SEARCH (REAL)
# =========================
@app.get("/api/hotels")
def search_hotels(
    city: str = Query(...),
    adults: int = 2,
    page: int = 1
):
    dest_id = get_dest_id(city)

    if not dest_id:
        return {"count": 0, "hotels": [], "error": "City not found"}

    offset = (page - 1) * 24

    url = "https://apidojo-booking-v1.p.rapidapi.com/properties/v2/list"

    headers = {
        "X-RapidAPI-Key": RAPID_KEY,
        "X-RapidAPI-Host": RAPID_HOST
    }

    params = {
        "dest_id": dest_id,
        "search_type": "CITY",
        "adults_number": adults,
        "page_number": page,
        "units": "metric",
        "locale": "en-gb",
        "currency_code": "GBP"
    }

    r = requests.get(url, headers=headers, params=params)

    if r.status_code != 200:
        return {
            "count": 0,
            "hotels": [],
            "error": r.text
        }

    data = r.json()

    results = data.get("result", [])

    hotels = []
    for h in results:
        hotels.append({
            "id": h.get("hotel_id"),
            "name": h.get("hotel_name"),
            "city": h.get("city"),
            "country": h.get("country_trans"),
            "price": h.get("min_total_price"),
            "currency": h.get("currencycode"),
            "image": h.get("main_photo_url"),
            "rating": h.get("review_score"),
            "latitude": h.get("latitude"),
            "longitude": h.get("longitude"),
            "map_url": f"https://www.google.com/maps?q={h.get('latitude')},{h.get('longitude')}"
        })

    return {
        "count": len(hotels),
        "page": page,
        "hotels": hotels
    }

# =========================
# RESERVATION (EMAIL)
# =========================
@app.post("/api/request")
def request_booking(req: ReservationRequest):

    request_id = str(uuid.uuid4())

    # SUPPORT EMAIL
    support_html = f"""
    <h2>New Reservation Request</h2>
    <p><b>ID:</b> {request_id}</p>
    <p><b>Name:</b> {req.name}</p>
    <p><b>Email:</b> {req.email}</p>
    <p><b>Hotel:</b> {req.hotel_id}</p>
    <p><b>Message:</b> {req.message}</p>
    """

    support_ok, support_err = send_email(
        SUPPORT_EMAIL,
        "New Reservation Request",
        support_html
    )

    # CUSTOMER EMAIL
    customer_html = f"""
    <h2>Your reservation request has been received</h2>
    <p>Request ID: {request_id}</p>
    <p>We will contact you shortly.</p>
    """

    customer_ok, customer_err = send_email(
        req.email,
        "Reservation Received",
        customer_html
    )

    return {
        "status": "received",
        "request_id": request_id,
        "email_delivery": {
            "support_sent": support_ok,
            "customer_sent": customer_ok,
            "support_error": support_err,
            "customer_error": customer_err
        }
    }