from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import requests

app = FastAPI()

# =========================================================
# ✅ CORS FIX (CRITICAL FOR PRODUCTION)
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.myspace-hotel.com",
        "https://myspace-hotel.com",
        "https://myspace-hotel.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# ✅ HEALTH CHECK
# =========================================================
@app.get("/health")
def health():
    return {
        "status": "myspace-backend running",
        "hotels_endpoint": "/api/hotels"
    }

# =========================================================
# ✅ REQUEST MODEL
# =========================================================
class ReservationRequest(BaseModel):
    name: str
    email: str
    hotel_name: str
    price: str
    notes: str = ""

# =========================================================
# ✅ RESERVATION ENDPOINT (FIXED)
# =========================================================
@app.post("/reservations/request")
async def create_reservation(data: ReservationRequest):
    try:
        # For now: simulate success (no email dependency yet)
        return {
            "success": True,
            "message": "Reservation request received",
            "data": data
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

# =========================================================
# ✅ HOTEL SEARCH (RAPIDAPI READY)
# =========================================================
@app.get("/api/hotels")
def get_hotels(location: str = "London"):

    RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
    RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST")

    # If no API key → fallback data (so app NEVER breaks)
    if not RAPIDAPI_KEY:
        return {
            "source": "fallback",
            "hotels": [
                {
                    "name": "My Space London Central",
                    "location": "London",
                    "price": "£185",
                    "rating": 8.5,
                    "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945"
                },
                {
                    "name": "Kensington Boutique Rooms",
                    "location": "London",
                    "price": "£245",
                    "rating": 9.0,
                    "image": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa"
                }
            ]
        }

    try:
        url = "https://booking-com.p.rapidapi.com/v1/hotels/search"

        querystring = {
            "checkin_date": "2026-04-25",
            "checkout_date": "2026-04-26",
            "dest_type": "city",
            "dest_id": "-2601889",  # London
            "adults_number": "1",
            "order_by": "popularity",
            "units": "metric",
            "room_number": "1"
        }

        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST
        }

        response = requests.get(url, headers=headers, params=querystring)

        data = response.json()

        hotels = []

        for item in data.get("result", [])[:20]:
            hotels.append({
                "name": item.get("hotel_name"),
                "location": item.get("city"),
                "price": str(item.get("min_total_price", "N/A")),
                "rating": item.get("review_score", 0),
                "image": item.get("main_photo_url")
            })

        return {
            "source": "rapidapi",
            "hotels": hotels
        }

    except Exception as e:
        return {
            "source": "error",
            "error": str(e)
        }