from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import math

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
        ],
        "price_start": 160,
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
]


def build_hotels():
    hotels = []
    for city, meta in CITY_BASE.items():
        for idx in range(1, 41):
            area = meta["areas"][idx % len(meta["areas"])]
            prefix = HOTEL_PREFIXES[idx % len(HOTEL_PREFIXES)]
            suffix = HOTEL_SUFFIXES[idx % len(HOTEL_SUFFIXES)]
            facilities = []
            for j, facility in enumerate(FACILITY_POOL):
                if (idx + j) % 3 == 0 or facility in ["wifi", "restaurant"]:
                    facilities.append(facility)
            facilities = list(dict.fromkeys(facilities))

            hotels.append(
                {
                    "id": str(uuid.uuid4()),
                    "name": f"{prefix} {city} {suffix}",
                    "city": city,
                    "area": area,
                    "country": meta["country"],
                    "price": meta["price_start"] + (idx * 7),
                    "currency": meta["currency"],
                    "rating": round(8.0 + ((idx % 18) / 10), 1),
                    "image": IMAGE_POOL[idx % len(IMAGE_POOL)],
                    "facilities": facilities,
                    "summary": f"A strong {city} stay in {area} with clearer comfort, stronger positioning, and a smoother route to reservation.",
                }
            )
    return hotels


HOTELS = build_hotels()


class BookingRequest(BaseModel):
    hotel_id: str
    name: str
    email: str
    message: str


REQUESTS = []


@app.get("/")
def root():
    return {
        "status": "running",
        "message": "My Space Hotel Backend Live",
        "endpoint": "/api/hotels",
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
    selected = [f.strip().lower() for f in facilities.split(",") if f.strip()]

    results = [
        h for h in HOTELS
        if city.strip().lower() in h["city"].lower()
    ]

    if selected:
        filtered = []
        for hotel in results:
            hotel_facilities = [f.lower() for f in hotel["facilities"]]
            if all(item in hotel_facilities for item in selected):
                filtered.append(hotel)
        results = filtered

    total = len(results)
    total_pages = max(1, math.ceil(total / page_size))
    page = max(1, min(page, total_pages))

    start = (page - 1) * page_size
    end = start + page_size
    page_results = results[start:end]

    return {
        "count": total,
        "page": page,
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
    payload = request.dict()
    payload["request_id"] = str(uuid.uuid4())
    REQUESTS.append(payload)

    return {
        "status": "received",
        "message": "Your request has been submitted. We will contact you shortly.",
        "request_id": payload["request_id"],
    }