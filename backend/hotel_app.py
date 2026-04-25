from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import Optional
import os
import requests

load_dotenv()

app = FastAPI(title="My Space Hotel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "").strip()

HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": "apidojo-booking-v1.p.rapidapi.com"
}


@app.get("/")
def root():
    return {
        "status": "live",
        "message": "RapidAPI real hotel search active",
        "api_key_loaded": bool(RAPIDAPI_KEY)
    }


# 🔥 STEP 1 — GET DESTINATION ID
def get_dest_id(city: str):
    url = "https://apidojo-booking-v1.p.rapidapi.com/locations/auto-complete"

    params = {
        "text": city,
        "languagecode": "en-us"
    }

    res = requests.get(url, headers=HEADERS, params=params)

    if res.status_code != 200:
        return None, f"Location API failed: {res.text}"

    data = res.json()

    if not data or not isinstance(data, list):
        return None, "No destination data"

    first = data[0]

    return {
        "dest_id": first.get("dest_id"),
        "dest_type": first.get("dest_type", "city")
    }, ""


# 🔥 STEP 2 — GET HOTELS
@app.get("/api/hotels")
def search_hotels(
    city: Optional[str] = Query(None),
    page: int = Query(1),
    page_size: int = Query(24),
):

    if not city:
        return {"error": "City is required"}

    # Get destination
    dest, error = get_dest_id(city)

    if error or not dest:
        return {
            "count": 0,
            "hotels": [],
            "error": error or "Destination not found"
        }

    offset = (page - 1) * page_size

    url = "https://apidojo-booking-v1.p.rapidapi.com/properties/list"

    params = {
        "dest_ids": dest["dest_id"],
        "search_type": dest["dest_type"],
        "offset": offset,
        "arrival_date": "2026-05-01",
        "departure_date": "2026-05-05",
        "guest_qty": 2,
        "room_qty": 1,
        "children_qty": 0,
        "price_filter_currencycode": "USD",
        "order_by": "popularity",
        "languagecode": "en-us"
    }

    res = requests.get(url, headers=HEADERS, params=params)

    if res.status_code != 200:
        return {
            "count": 0,
            "hotels": [],
            "error": f"RapidAPI error: {res.text}"
        }

    data = res.json()

    # 🔥 CRITICAL PARSE FIX
    results = data.get("result", [])

    hotels = []

    for item in results[:page_size]:
        hotels.append({
            "id": item.get("hotel_id"),
            "name": item.get("hotel_name"),
            "city": item.get("city"),
            "country": item.get("country_trans"),
            "price": item.get("min_total_price"),
            "currency": item.get("currencycode"),
            "rating": item.get("review_score"),
            "image": item.get("max_1440_photo_url"),
            "map_url": f"https://www.google.com/maps?q={item.get('hotel_name')},{item.get('city')}"
        })

    return {
        "count": len(hotels),
        "page": page,
        "page_size": page_size,
        "hotels": hotels
    }