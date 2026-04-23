from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uuid
import math
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# =========================================================
# ENV
# =========================================================
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
SMTP_FROM = os.getenv("SMTP_FROM", "").strip()
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "").strip()
ADMIN_NOTIFICATION_EMAIL = os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip()

# =========================================================
# CORS
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://myspace-hotel.com",
        "https://www.myspace-hotel.com",
        "https://myspace-hotel.vercel.app",
        "https://hotel-frontend-vlwa.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# DATA
# =========================================================
FACILITY_POOL = [
    "wifi",
    "spa",
    "gym",
    "restaurant",
    "pool",
    "parking",
    "airport shuttle",
    "family rooms",
    "beach access",
    "business lounge",
    "breakfast included",
    "city centre access",
]

CITY_BASE = {
    "London": {
        "country": "United Kingdom",
        "currency": "GBP",
        "areas": [
            "Central London",
            "Westminster",
            "Kensington",
            "Paddington",
            "Soho",
            "Mayfair",
            "Canary Wharf",
            "South Bank",
            "Covent Garden",
            "Chelsea",
            "Marylebone",
            "Notting Hill",
        ],
        "price_start": 165,
    },
    "Paris": {
        "country": "France",
        "currency": "EUR",
        "areas": [
            "Champs-Élysées",
            "Le Marais",
            "Saint-Germain",
            "Montmartre",
            "Latin Quarter",
            "Opera District",
            "Bastille",
            "Trocadero",
            "Louvre Area",
            "Republic",
        ],
        "price_start": 175,
    },
    "Dubai": {
        "country": "United Arab Emirates",
        "currency": "AED",
        "areas": [
            "Downtown Dubai",
            "Dubai Marina",
            "Jumeirah Beach",
            "Business Bay",
            "Palm Jumeirah",
            "Deira",
            "Al Barsha",
            "Bur Dubai",
        ],
        "price_start": 390,
    },
    "New York": {
        "country": "United States",
        "currency": "USD",
        "areas": [
            "Midtown Manhattan",
            "SoHo",
            "Upper West Side",
            "Chelsea",
            "Financial District",
            "Brooklyn Waterfront",
            "Times Square",
            "Tribeca",
            "Lower Manhattan",
        ],
        "price_start": 210,
    },
    "Lagos": {
        "country": "Nigeria",
        "currency": "NGN",
        "areas": [
            "Victoria Island",
            "Ikoyi",
            "Lekki",
            "Ikeja",
            "Yaba",
            "Ajah",
            "Maryland",
            "Surulere",
        ],
        "price_start": 78000,
    },
    "Rome": {
        "country": "Italy",
        "currency": "EUR",
        "areas": [
            "Centro Storico",
            "Trastevere",
            "Vatican Area",
            "Termini",
            "Monti",
            "Spanish Steps",
            "Trevi District",
        ],
        "price_start": 160,
    },
    "Barcelona": {
        "country": "Spain",
        "currency": "EUR",
        "areas": [
            "Gothic Quarter",
            "Eixample",
            "Barceloneta",
            "Gracia",
            "Sants",
            "Poblenou",
        ],
        "price_start": 170,
    },
    "Istanbul": {
        "country": "Turkey",
        "currency": "TRY",
        "areas": [
            "Sultanahmet",
            "Taksim",
            "Galata",
            "Besiktas",
            "Kadikoy",
            "Beyoglu",
        ],
        "price_start": 4200,
    },
}

IMAGE_POOL = [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa",
    "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8",
    "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
    "https://images.unsplash.com/photo-1578683010236-d716f9a3f461",
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c",
    "https://images.unsplash.com/photo-1455587734955-081b22074882",
    "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4",
]

HOTEL_PREFIXES = [
    "Grand",
    "Royal",
    "Central",
    "Elite",
    "Skyline",
    "Harbour",
    "Imperial",
    "Premier",
    "Signature",
    "Urban",
    "Landmark",
    "Prestige",
    "Comfort",
    "Luxury",
    "City",
    "Riverside",
]

HOTEL_SUFFIXES = [
    "Palace",
    "Suites",
    "Hotel",
    "Residences",
    "Retreat",
    "Boutique Rooms",
    "Plaza",
    "Gateway Hotel",
    "Executive Stay",
    "Corner Hotel",
    "Collection",
    "Lounge Hotel",
    "Grand Stay",
    "Central Suites",
]


def build_hotels() -> List[dict]:
    hotels: List[dict] = []

    for city, meta in CITY_BASE.items():
        for idx in range(1, 321):
            area = meta["areas"][idx % len(meta["areas"])]
            prefix = HOTEL_PREFIXES[idx % len(HOTEL_PREFIXES)]
            suffix = HOTEL_SUFFIXES[idx % len(HOTEL_SUFFIXES)]

            facilities = []
            for j, facility in enumerate(FACILITY_POOL):
                if facility in ["wifi", "restaurant"] or (idx + j) % 3 == 0 or (idx + j) % 5 == 0:
                    facilities.append(facility)
            facilities = list(dict.fromkeys(facilities))

            hotels.append(
                {
                    "id": str(uuid.uuid4()),
                    "name": f"{prefix} {city} {suffix}",
                    "city": city,
                    "area": area,
                    "country": meta["country"],
                    "price": meta["price_start"] + (idx * 4),
                    "currency": meta["currency"],
                    "rating": round(8.0 + ((idx % 18) / 10), 1),
                    "image": IMAGE_POOL[idx % len(IMAGE_POOL)],
                    "facilities": facilities,
                    "summary": (
                        f"A well-positioned stay in {area}, {city}, designed for travellers who want "
                        f"more confidence, stronger comfort, and a clearer route to reservation."
                    ),
                }
            )

    return hotels


HOTELS = build_hotels()
REQUESTS = []


# =========================================================
# MODELS
# =========================================================
class BookingRequest(BaseModel):
    hotel_id: str
    name: str
    email: str
    message: str


# =========================================================
# EMAIL
# =========================================================
def email_ready() -> bool:
    return all([SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SUPPORT_EMAIL])


def send_email(to_address: str, subject: str, html_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_address

    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
        if SMTP_USE_TLS:
            server.starttls()
        if SMTP_USER:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_FROM, [to_address], msg.as_string())


# =========================================================
# ROUTES
# =========================================================
@app.get("/")
def root():
    return {
        "status": "running",
        "message": "My Space Hotel Backend Live",
        "endpoint": "/api/hotels",
        "catalogue_note": "Seeded global catalogue active. Structured for future expansion.",
    }


@app.get("/api/facilities")
def get_facilities():
    return {"facilities": FACILITY_POOL}


@app.get("/api/hotels")
def search_hotels(
    city: str = Query(...),
    facilities: str = Query(""),
    page: int = Query(1),
    page_size: int = Query(12),
):
    search_city = city.strip().lower()
    selected = [f.strip().lower() for f in facilities.split(",") if f.strip()]

    results = [h for h in HOTELS if search_city in h["city"].lower()]

    if selected:
        filtered = []
        for hotel in results:
            hotel_facilities = [f.lower() for f in hotel["facilities"]]
            if all(item in hotel_facilities for item in selected):
                filtered.append(hotel)
        results = filtered

    total = len(results)
    total_pages = max(1, math.ceil(total / page_size))
    safe_page = max(1, min(page, total_pages))

    start = (safe_page - 1) * page_size
    end = start + page_size
    page_results = results[start:end]

    return {
        "count": total,
        "page": safe_page,
        "page_size": page_size,
        "total_pages": total_pages,
        "hotels": page_results,
    }


@app.get("/api/hotel/{hotel_id}")
def get_hotel(hotel_id: str):
    for hotel in HOTELS:
        if hotel["id"] == hotel_id:
            return hotel
    return {"error": "Hotel not found"}


@app.post("/api/request")
def request_booking(request: BookingRequest):
    chosen_hotel = None
    for hotel in HOTELS:
        if hotel["id"] == request.hotel_id:
            chosen_hotel = hotel
            break

    if not chosen_hotel:
        return {
            "status": "error",
            "message": "The selected hotel could not be found.",
        }

    request_id = str(uuid.uuid4())

    payload = {
        "request_id": request_id,
        "hotel_id": request.hotel_id,
        "hotel_name": chosen_hotel["name"],
        "hotel_city": chosen_hotel["city"],
        "hotel_area": chosen_hotel["area"],
        "customer_name": request.name.strip(),
        "customer_email": request.email.strip(),
        "message": request.message.strip(),
    }
    REQUESTS.append(payload)

    support_sent = False
    customer_sent = False
    email_error = ""

    if email_ready():
        try:
            support_subject = f"New reservation request • {chosen_hotel['name']} • {request_id}"
            support_html = f"""
            <html>
              <body style="font-family: Arial, sans-serif; color: #12367c;">
                <h2>New reservation request</h2>
                <p><strong>Request ID:</strong> {request_id}</p>
                <p><strong>Hotel:</strong> {chosen_hotel['name']}</p>
                <p><strong>Location:</strong> {chosen_hotel['area']}, {chosen_hotel['city']}, {chosen_hotel['country']}</p>
                <p><strong>Displayed rate:</strong> {chosen_hotel['price']} {chosen_hotel['currency']}</p>
                <p><strong>Customer name:</strong> {request.name}</p>
                <p><strong>Customer email:</strong> {request.email}</p>
                <p><strong>Customer message:</strong> {request.message or "No special request submitted."}</p>
              </body>
            </html>
            """
            send_email(SUPPORT_EMAIL, support_subject, support_html)
            support_sent = True

            customer_subject = f"Your My Space Hotel reservation request • {chosen_hotel['name']}"
            customer_html = f"""
            <html>
              <body style="font-family: Arial, sans-serif; color: #12367c;">
                <h2>Your reservation request has been received</h2>
                <p>Thank you for using <strong>My Space Hotel</strong>.</p>
                <p>Your request has been received for <strong>{chosen_hotel['name']}</strong>.</p>
                <p><strong>Location:</strong> {chosen_hotel['area']}, {chosen_hotel['city']}, {chosen_hotel['country']}</p>
                <p><strong>Request ID:</strong> {request_id}</p>
                <p>Our team will review your request and continue with you using the email address you provided.</p>
                <p>We appreciate the opportunity to help you choose the right stay with more confidence.</p>
              </body>
            </html>
            """
            send_email(request.email.strip(), customer_subject, customer_html)
            customer_sent = True
        except Exception as exc:
            email_error = str(exc)

    if support_sent and customer_sent:
        return {
            "status": "received",
            "message": "Your reservation request has been received and confirmation emails have been sent.",
            "request_id": request_id,
            "email_delivery": {
                "support_sent": True,
                "customer_sent": True,
            },
        }

    return {
        "status": "received",
        "message": "Your reservation request has been received. We will review it and continue with you shortly.",
        "request_id": request_id,
        "email_delivery": {
            "support_sent": support_sent,
            "customer_sent": customer_sent,
            "note": "Email delivery is not fully configured yet." if not email_ready() else email_error,
        },
    }