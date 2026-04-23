from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import uuid

app = FastAPI()

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
# MOCK HOTEL DATABASE (EXPANDABLE)
# =========================================================
HOTELS = [
    {
        "id": str(uuid.uuid4()),
        "name": "Grand London Palace",
        "city": "London",
        "area": "Central London",
        "country": "United Kingdom",
        "price": 220,
        "currency": "GBP",
        "rating": 4.5,
        "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945",
        "facilities": ["wifi", "spa", "gym", "restaurant"],
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Thames Riverside Hotel",
        "city": "London",
        "area": "Westminster",
        "country": "United Kingdom",
        "price": 180,
        "currency": "GBP",
        "rating": 4.2,
        "image": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa",
        "facilities": ["wifi", "restaurant"],
    },
    {
        "id": str(uuid.uuid4()),
        "name": "Paris Luxury Suites",
        "city": "Paris",
        "area": "Champs-Élysées",
        "country": "France",
        "price": 260,
        "currency": "EUR",
        "rating": 4.7,
        "image": "https://images.unsplash.com/photo-1501117716987-c8e1ecb210c0",
        "facilities": ["wifi", "spa", "bar"],
    },
]

# =========================================================
# REQUEST MODEL
# =========================================================
class BookingRequest(BaseModel):
    hotel_id: str
    name: str
    email: str
    message: str

REQUESTS = []

# =========================================================
# ROOT
# =========================================================
@app.get("/")
def root():
    return {
        "status": "running",
        "message": "My Space Hotel Backend Live",
        "endpoint": "/api/hotels"
    }

# =========================================================
# SEARCH HOTELS
# =========================================================
@app.get("/api/hotels")
def search_hotels(
    city: str = Query(...),
    facility: str = Query(None)
):
    results = [
        h for h in HOTELS
        if city.lower() in h["city"].lower()
    ]

    if facility:
        results = [
            h for h in results
            if facility.lower() in [f.lower() for f in h["facilities"]]
        ]

    return {
        "count": len(results),
        "hotels": results
    }

# =========================================================
# GET SINGLE HOTEL
# =========================================================
@app.get("/api/hotel/{hotel_id}")
def get_hotel(hotel_id: str):
    for hotel in HOTELS:
        if hotel["id"] == hotel_id:
            return hotel
    return {"error": "Hotel not found"}

# =========================================================
# RESERVE / REQUEST AVAILABILITY
# =========================================================
@app.post("/api/request")
def request_booking(request: BookingRequest):
    REQUESTS.append(request.dict())

    return {
        "status": "received",
        "message": "Your request has been submitted. We will contact you shortly."
    }