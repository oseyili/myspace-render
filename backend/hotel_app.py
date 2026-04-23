from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import requests
import os

app = FastAPI()

# =========================
# CORS FIX (VERY IMPORTANT)
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://www.myspace-hotel.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# ENV VARIABLES
# =========================
RAPID_KEY = os.getenv("RAPIDAPI_KEY")

RAPID_HOST = "booking-com.p.rapidapi.com"
AUTO_URL = "https://booking-com.p.rapidapi.com/v1/hotels/locations"
SEARCH_URL = "https://booking-com.p.rapidapi.com/v1/hotels/search"

# =========================
# HEALTH CHECK
# =========================
@app.get("/health")
def health():
    return {"status": "ok"}

# =========================
# HOTEL SEARCH (GLOBAL)
# =========================
@app.get("/search")
def search_hotels(city: str = "London"):
    if not RAPID_KEY:
        return {"error": "RapidAPI key missing"}

    headers = {
        "X-RapidAPI-Key": RAPID_KEY,
        "X-RapidAPI-Host": RAPID_HOST,
    }

    # Step 1: get destination_id
    loc_res = requests.get(AUTO_URL, headers=headers, params={"name": city})
    if loc_res.status_code != 200:
        return {"error": "Location lookup failed"}

    data = loc_res.json()
    if not data:
        return {"error": "No location found"}

    dest_id = data[0]["dest_id"]

    # Step 2: search hotels
    search_res = requests.get(
        SEARCH_URL,
        headers=headers,
        params={
            "dest_id": dest_id,
            "dest_type": "city",
            "checkin_date": "2026-05-01",
            "checkout_date": "2026-05-02",
            "adults_number": "1",
            "room_number": "1",
            "order_by": "popularity",
            "locale": "en-gb",
            "currency": "GBP",
        },
    )

    if search_res.status_code != 200:
        return {"error": "Hotel search failed"}

    return search_res.json()

# =========================
# RESERVATION (FIXED)
# =========================
@app.post("/reserve")
async def reserve(data: dict):
    return {
        "success": True,
        "message": "Reservation received",
        "data": data,
    }