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

@app.get("/api/hotels")
def get_hotels(
    city: str = Query(...),
    adults: int = Query(2),
    rooms: int = Query(1),
    checkin: str = Query("2026-05-01"),
    checkout: str = Query("2026-05-05"),
):
    if not RAPIDAPI_KEY:
        return {
            "error": "Missing RAPIDAPI_KEY in environment"
        }

    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST,
    }

    # Step 1: resolve destination from city text
    location_url = f"https://{RAPIDAPI_HOST}/v1/hotels/locations"
    location_params = {
        "name": city,
        "locale": "en-gb",
    }

    try:
        location_response = requests.get(
            location_url,
            headers=headers,
            params=location_params,
            timeout=20,
        )
    except Exception as e:
        return {
            "error": "Location lookup failed",
            "details": str(e),
        }

    if location_response.status_code != 200:
        return {
            "error": "RapidAPI locations error",
            "status_code": location_response.status_code,
            "details": location_response.text[:300],
        }

    locations = location_response.json()
    if not isinstance(locations, list) or not locations:
        return {
            "error": "No destination found for that city"
        }

    first = locations[0]
    dest_id = first.get("dest_id")
    search_type = first.get("dest_type") or "city"

    if not dest_id:
        return {
            "error": "Destination id missing from location lookup"
        }

    # Step 2: use the supported endpoint from your screenshot
    search_url = f"https://{RAPIDAPI_HOST}/properties/v2/list"
    search_params = {
        "dest_id": str(dest_id),
        "search_type": search_type,
        "arrival_date": checkin,
        "departure_date": checkout,
        "room_qty": str(rooms),
        "guest_qty": str(adults),
        "children_qty": "0",
        "children_age": "0,0",
        "languagecode": "en-gb",
        "currency_code": "GBP",
        "location": city,
        "offset": "0",
        "price_filter_currencycode": "GBP",
        "travel_purpose": "leisure",
        "units": "metric",
    }

    try:
        search_response = requests.get(
            search_url,
            headers=headers,
            params=search_params,
            timeout=30,
        )
    except Exception as e:
        return {
            "error": "Property search failed",
            "details": str(e),
        }

    if search_response.status_code != 200:
        return {
            "error": "RapidAPI properties error",
            "status_code": search_response.status_code,
            "details": search_response.text[:500],
        }

    data = search_response.json()

    # flexible parsing because Rapid response structures vary
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
    for item in raw_results[:20]:
        if not isinstance(item, dict):
            continue

        name = (
            item.get("name")
            or item.get("hotel_name")
            or item.get("property_name")
            or "Hotel"
        )

        photo = (
            item.get("photoMainUrl")
            or item.get("main_photo_url")
            or item.get("image")
            or item.get("property_photo")
            or ""
        )

        currency = (
            item.get("currency")
            or item.get("currency_code")
            or "GBP"
        )

        price = (
            item.get("price")
            or item.get("min_total_price")
            or item.get("review_score_word")
            or 0
        )

        review_score = (
            item.get("reviewScore")
            or item.get("review_score")
            or item.get("reviewScoreWord")
            or 0
        )

        hotels.append({
            "id": item.get("id") or item.get("hotel_id") or name,
            "name": name,
            "city": city,
            "area": item.get("district") or item.get("address") or "",
            "country": first.get("country") or "",
            "price": price,
            "currency": currency,
            "rating": review_score,
            "image": photo,
            "summary": item.get("wishlistName") or "Compare this stay and reserve directly in app.",
        })

    return {
        "city": city,
        "count": len(hotels),
        "hotels": hotels,
    }