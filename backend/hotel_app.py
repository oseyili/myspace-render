from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import requests
import os
from dotenv import load_dotenv

load_dotenv()

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST") or "booking-com.p.rapidapi.com"

app = FastAPI()

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

@app.get("/")
def root():
    return {
        "status": "backend running",
        "message": "My Space Hotel API live",
        "endpoint": "/api/hotels",
    }

def geocode_city(city: str):
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": city,
        "format": "json",
        "limit": 1,
    }
    headers = {
        "User-Agent": "MySpaceHotel/1.0"
    }

    response = requests.get(url, params=params, headers=headers, timeout=20)
    response.raise_for_status()
    data = response.json()

    if not data:
        return None

    return {
        "latitude": data[0]["lat"],
        "longitude": data[0]["lon"],
        "display_name": data[0].get("display_name", city),
    }

@app.get("/api/hotels")
def get_hotels(
    city: str = Query(...),
    adults: int = Query(2),
    rooms: int = Query(1),
    checkin: str = Query("2026-05-01"),
    checkout: str = Query("2026-05-05"),
    currency: str = Query("GBP"),
):
    try:
        if not RAPIDAPI_KEY:
            return {
                "error": "Missing RAPIDAPI_KEY in environment"
            }

        geo = geocode_city(city)
        if not geo:
            return {
                "error": f"Could not find coordinates for city '{city}'"
            }

        url = f"https://{RAPIDAPI_HOST}/properties/v2/list"

        headers = {
            "X-RapidAPI-Key": RAPIDAPI_KEY,
            "X-RapidAPI-Host": RAPIDAPI_HOST,
        }

        params = {
            "arrival_date": checkin,
            "departure_date": checkout,
            "room_qty": str(rooms),
            "guest_qty": str(adults),
            "children_qty": "0",
            "search_type": "latlong",
            "latitude": str(geo["latitude"]),
            "longitude": str(geo["longitude"]),
            "price_filter_currencycode": currency,
            "order_by": "popularity",
            "languagecode": "en-gb",
            "units": "metric",
        }

        response = requests.get(url, headers=headers, params=params, timeout=30)

        if response.status_code != 200:
            return {
                "error": "RapidAPI properties error",
                "status_code": response.status_code,
                "details": response.text[:500],
            }

        data = response.json()

        raw_results = []
        if isinstance(data, dict):
            if isinstance(data.get("data"), list):
                raw_results = data.get("data", [])
            elif isinstance(data.get("results"), list):
                raw_results = data.get("results", [])
            elif isinstance(data.get("properties"), list):
                raw_results = data.get("properties", [])
            elif isinstance(data.get("data"), dict):
                nested = data.get("data", {})
                if isinstance(nested.get("hotels"), list):
                    raw_results = nested.get("hotels", [])
                elif isinstance(nested.get("properties"), list):
                    raw_results = nested.get("properties", [])

        hotels = []
        for item in raw_results[:40]:
            if not isinstance(item, dict):
                continue

            name = (
                item.get("name")
                or item.get("hotel_name")
                or item.get("property_name")
                or "Hotel"
            )

            image = (
                item.get("photoMainUrl")
                or item.get("main_photo_url")
                or item.get("image")
                or item.get("property_photo")
                or ""
            )

            price = (
                item.get("price")
                or item.get("min_total_price")
                or item.get("gross_price")
                or 0
            )

            rating = (
                item.get("reviewScore")
                or item.get("review_score")
                or item.get("reviewScoreWord")
                or 0
            )

            area = (
                item.get("district")
                or item.get("address")
                or item.get("city")
                or ""
            )

            hotels.append({
                "id": item.get("id") or item.get("hotel_id") or name,
                "name": name,
                "city": city,
                "area": area,
                "country": geo["display_name"],
                "price": price,
                "currency": currency,
                "rating": rating,
                "image": image,
                "summary": "Compare this stay and reserve directly inside the app.",
            })

        return {
            "city": city,
            "count": len(hotels),
            "hotels": hotels,
        }

    except Exception as e:
        return {
            "error": "Server safe catch",
            "details": str(e),
        }