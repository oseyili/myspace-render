from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import requests
import os
from dotenv import load_dotenv

# =========================================================
# LOAD ENV VARIABLES SAFELY
# =========================================================
load_dotenv()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST")
EMAIL_USER = os.getenv("EMAIL_USER")

# =========================================================
# APP INIT
# =========================================================
app = FastAPI()

# =========================================================
# CORS (ALLOW YOUR FRONTENDS)
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
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
# ROOT (IMPORTANT FOR RENDER HEALTH)
# =========================================================
@app.get("/")
def root():
    return {
        "status": "backend running",
        "message": "My Space Hotel API live",
        "hotels_endpoint": "/api/hotels"
    }

# =========================================================
# HOTEL SEARCH ENDPOINT
# =========================================================
@app.get("/api/hotels")
def get_hotels(
    city: str = Query(...),
    adults: int = 2,
    rooms: int = 1
):
    try:
        url = "https://booking-com.p.rapidapi.com/v1/hotels/search"

        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY or "",
            "X-RapidAPI-Host": RAPIDAPI_HOST or "booking-com.p.rapidapi.com"
        }

        params = {
            "dest_type": "city",
            "dest_id": "-2601889",  # default fallback (London)
            "adults_number": adults,
            "room_number": rooms,
            "order_by": "popularity",
            "units": "metric",
            "locale": "en-gb",
            "checkin_date": "2026-05-01",
            "checkout_date": "2026-05-05"
        }

        response = requests.get(url, headers=headers, params=params)

        if response.status_code != 200:
            return {
                "error": "RapidAPI error",
                "status_code": response.status_code,
                "details": response.text[:200]
            }

        data = response.json()

        results = []

        for hotel in data.get("result", [])[:20]:
            results.append({
                "name": hotel.get("hotel_name"),
                "city": city,
                "price": hotel.get("min_total_price"),
                "currency": hotel.get("currency"),
                "image": hotel.get("main_photo_url"),
                "url": hotel.get("url")
            })

        return results

    except Exception as e:
        return {
            "error": "Server crash",
            "details": str(e)
        }