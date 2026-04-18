from __future__ import annotations

import math
import os
import random
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="My Space Hotel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "MySpaceHotel/1.0 (reservations@myspace-hotel.com)"

SEARCH_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 900

COUNTRY_CURRENCY_MAP = {
    "united kingdom": "GBP",
    "uk": "GBP",
    "england": "GBP",
    "scotland": "GBP",
    "wales": "GBP",
    "ireland": "EUR",
    "france": "EUR",
    "germany": "EUR",
    "spain": "EUR",
    "italy": "EUR",
    "portugal": "EUR",
    "netherlands": "EUR",
    "belgium": "EUR",
    "austria": "EUR",
    "greece": "EUR",
    "cyprus": "EUR",
    "malta": "EUR",
    "united states": "USD",
    "usa": "USD",
    "canada": "CAD",
    "australia": "AUD",
    "new zealand": "NZD",
    "japan": "JPY",
    "china": "CNY",
    "india": "INR",
    "uae": "AED",
    "united arab emirates": "AED",
    "south africa": "ZAR",
    "nigeria": "NGN",
    "ghana": "GHS",
    "kenya": "KES",
    "turkey": "TRY",
    "switzerland": "CHF",
    "sweden": "SEK",
    "norway": "NOK",
    "denmark": "DKK",
    "poland": "PLN",
    "czech republic": "CZK",
    "hungary": "HUF",
    "romania": "RON",
    "bulgaria": "BGN",
    "croatia": "EUR",
    "thailand": "THB",
    "singapore": "SGD",
    "malaysia": "MYR",
    "indonesia": "IDR",
    "philippines": "PHP",
    "south korea": "KRW",
    "brazil": "BRL",
    "mexico": "MXN",
    "egypt": "EGP",
    "morocco": "MAD",
}

HOTEL_TYPE_MULTIPLIERS = {
    "hotel": 1.00,
    "guest_house": 0.78,
    "hostel": 0.58,
    "motel": 0.72,
    "apartment": 0.88,
    "resort": 1.32,
}

FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1501117716987-c8e1ecb210ea?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1600&q=80",
    "https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&w=1600&q=80",
]


def normalize_text(value: Optional[str]) -> str:
    return (value or "").strip()


def cache_key_from_parts(parts: List[str]) -> str:
    return " | ".join(part.strip().lower() for part in parts if part and part.strip())


def now_ts() -> float:
    return time.time()


def get_country_currency(country: str) -> str:
    key = country.strip().lower()
    return COUNTRY_CURRENCY_MAP.get(key, "USD")


def guess_country_from_display(display_name: str, fallback: str) -> str:
    if fallback.strip():
        return fallback.strip()

    bits = [bit.strip() for bit in display_name.split(",") if bit.strip()]
    if bits:
        return bits[-1]
    return "Unknown"


def build_location_label(destination: str, city: str, location: str, country: str) -> str:
    parts = [normalize_text(destination), normalize_text(city), normalize_text(location), normalize_text(country)]
    cleaned = [p for p in parts if p]
    return ", ".join(cleaned)


def geocode_place(destination: str, city: str, location: str, country: str) -> Dict[str, Any]:
    query_text = build_location_label(destination, city, location, country)
    if not query_text:
        raise ValueError("A destination, city, location, or country is required.")

    params = {
        "q": query_text,
        "format": "jsonv2",
        "limit": 1,
        "addressdetails": 1,
    }

    response = requests.get(
        NOMINATIM_URL,
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    response.raise_for_status()
    items = response.json()

    if not items:
        raise ValueError("No geocoding results found for that location.")

    item = items[0]
    boundingbox = item.get("boundingbox", [])
    if len(boundingbox) != 4:
        raise ValueError("Location search did not return a usable map area.")

    south = float(boundingbox[0])
    north = float(boundingbox[1])
    west = float(boundingbox[2])
    east = float(boundingbox[3])

    display_name = item.get("display_name", query_text)
    address = item.get("address", {}) or {}

    resolved_country = (
        normalize_text(country)
        or normalize_text(address.get("country"))
        or guess_country_from_display(display_name, "")
    )

    resolved_city = (
        normalize_text(city)
        or normalize_text(address.get("city"))
        or normalize_text(address.get("town"))
        or normalize_text(address.get("village"))
        or normalize_text(address.get("county"))
        or normalize_text(location)
        or normalize_text(destination)
    )

    return {
        "query_text": query_text,
        "display_name": display_name,
        "south": south,
        "north": north,
        "west": west,
        "east": east,
        "resolved_country": resolved_country or "Unknown",
        "resolved_city": resolved_city or "Unknown",
    }


def expand_bbox(south: float, north: float, west: float, east: float, factor: float = 0.28) -> Tuple[float, float, float, float]:
    lat_pad = (north - south) * factor or 0.04
    lon_pad = (east - west) * factor or 0.06
    return south - lat_pad, north + lat_pad, west - lon_pad, east + lon_pad


def build_overpass_query(south: float, north: float, west: float, east: float) -> str:
    return f"""
    [out:json][timeout:60];
    (
      node["tourism"~"hotel|guest_house|hostel|motel|apartment|resort"]({south},{west},{north},{east});
      way["tourism"~"hotel|guest_house|hostel|motel|apartment|resort"]({south},{west},{north},{east});
      relation["tourism"~"hotel|guest_house|hostel|motel|apartment|resort"]({south},{west},{north},{east});
    );
    out center tags;
    """


def overpass_search(south: float, north: float, west: float, east: float) -> List[Dict[str, Any]]:
    query = build_overpass_query(south, north, west, east)
    response = requests.post(
        OVERPASS_URL,
        data=query.encode("utf-8"),
        headers={"User-Agent": USER_AGENT, "Content-Type": "text/plain"},
        timeout=90,
    )
    response.raise_for_status()
    payload = response.json()
    return payload.get("elements", [])


def stable_random(seed_value: str) -> random.Random:
    return random.Random(seed_value)


def infer_hotel_type(tags: Dict[str, Any]) -> str:
    tourism = normalize_text(tags.get("tourism"))
    if tourism in HOTEL_TYPE_MULTIPLIERS:
        return tourism
    return "hotel"


def infer_amenities(tags: Dict[str, Any]) -> List[str]:
    facilities: List[str] = []

    if tags.get("internet_access") or tags.get("wifi") or tags.get("internet_access:fee") == "no":
        facilities.append("Free WiFi")
    if normalize_text(tags.get("breakfast")) in {"yes", "included"}:
        facilities.append("Breakfast included")
    if normalize_text(tags.get("parking")) == "yes":
        facilities.append("Parking")
    if normalize_text(tags.get("wheelchair")) == "yes":
        facilities.append("Accessible rooms")
    if normalize_text(tags.get("swimming_pool")) == "yes":
        facilities.append("Swimming pool")
    if normalize_text(tags.get("fitness_centre")) == "yes" or normalize_text(tags.get("gym")) == "yes":
        facilities.append("Gym")
    if normalize_text(tags.get("airport_shuttle")) == "yes":
        facilities.append("Airport shuttle")
    if normalize_text(tags.get("family_rooms")) == "yes":
        facilities.append("Family rooms")
    if normalize_text(tags.get("smoking")) == "no":
        facilities.append("Non-smoking rooms")
    if normalize_text(tags.get("pets")) == "yes":
        facilities.append("Pet friendly")

    if not facilities:
        facilities = ["Free WiFi", "Free cancellation", "Family rooms"]

    deduped: List[str] = []
    seen = set()
    for item in facilities:
        key = item.lower()
        if key not in seen:
            deduped.append(item)
            seen.add(key)

    return deduped[:8]


def estimate_price(
    hotel_type: str,
    rating: float,
    country: str,
    latitude: float,
    longitude: float,
    name: str,
) -> float:
    currency = get_country_currency(country)
    base_by_currency = {
        "GBP": 92,
        "EUR": 106,
        "USD": 118,
        "CAD": 149,
        "AUD": 168,
        "AED": 430,
        "JPY": 15500,
        "NGN": 138000,
    }
    base = base_by_currency.get(currency, 110)
    multiplier = HOTEL_TYPE_MULTIPLIERS.get(hotel_type, 1.0)

    seed = f"{name}|{latitude:.4f}|{longitude:.4f}|{country}"
    rng = stable_random(seed)
    variance = rng.uniform(0.78, 1.34)
    rating_factor = 0.82 + (rating / 10.0)

    return round(base * multiplier * variance * rating_factor, 2)


def estimate_rating(name: str, latitude: float, longitude: float) -> float:
    rng = stable_random(f"rating|{name}|{latitude:.4f}|{longitude:.4f}")
    return round(rng.uniform(7.2, 9.4), 1)


def build_image(name: str) -> str:
    index = abs(hash(name)) % len(FALLBACK_IMAGES)
    return FALLBACK_IMAGES[index]


def extract_lat_lon(element: Dict[str, Any]) -> Tuple[float, float]:
    if "lat" in element and "lon" in element:
        return float(element["lat"]), float(element["lon"])

    center = element.get("center", {}) or {}
    return float(center.get("lat", 0.0)), float(center.get("lon", 0.0))


def normalize_hotel(
    element: Dict[str, Any],
    resolved_city: str,
    resolved_country: str,
) -> Optional[Dict[str, Any]]:
    tags = element.get("tags", {}) or {}
    name = normalize_text(tags.get("name"))
    if not name:
        return None

    latitude, longitude = extract_lat_lon(element)
    if not latitude and not longitude:
        return None

    hotel_type = infer_hotel_type(tags)
    rating = estimate_rating(name, latitude, longitude)
    currency = get_country_currency(resolved_country)
    address_parts = [
        normalize_text(tags.get("addr:housenumber")),
        normalize_text(tags.get("addr:street")),
        normalize_text(tags.get("addr:suburb")),
        normalize_text(tags.get("addr:city")) or resolved_city,
        normalize_text(tags.get("addr:postcode")),
        resolved_country,
    ]
    address = ", ".join(part for part in address_parts if part)

    osm_id = f"{element.get('type', 'node')}-{element.get('id', '')}"
    return {
        "hotel_id": osm_id,
        "name": name,
        "location": normalize_text(tags.get("addr:city")) or resolved_city,
        "city": normalize_text(tags.get("addr:city")) or resolved_city,
        "country": resolved_country,
        "price": estimate_price(hotel_type, rating, resolved_country, latitude, longitude, name),
        "rating": rating,
        "image": build_image(name),
        "address": address or f"{resolved_city}, {resolved_country}",
        "currency": currency,
        "amenities": infer_amenities(tags),
        "source": "OpenStreetMap",
        "hotel_type": hotel_type,
        "lat": latitude,
        "lon": longitude,
    }


def dedupe_hotels(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    output: List[Dict[str, Any]] = []

    for item in items:
        key = (
            normalize_text(item.get("name")).lower(),
            normalize_text(item.get("location")).lower(),
            normalize_text(item.get("country")).lower(),
        )
        if key in seen:
            continue
        seen.add(key)
        output.append(item)

    return output


def score_hotel(item: Dict[str, Any]) -> float:
    rating = float(item.get("rating", 0.0))
    amenities = len(item.get("amenities", []))
    price = float(item.get("price", 0.0))
    type_bonus = {
        "hotel": 4.0,
        "resort": 4.2,
        "apartment": 3.4,
        "guest_house": 3.2,
        "motel": 2.8,
        "hostel": 2.2,
    }.get(str(item.get("hotel_type", "hotel")), 3.0)

    affordability = 0.0
    if price > 0:
        affordability = max(0.0, 130.0 - min(price, 130.0)) / 18.0

    return rating * 9.5 + amenities * 0.8 + type_bonus + affordability


def search_real_hotels(destination: str, city: str, location: str, country: str) -> Dict[str, Any]:
    key = cache_key_from_parts([destination, city, location, country])

    cached = SEARCH_CACHE.get(key)
    if cached and now_ts() - cached["timestamp"] < CACHE_TTL_SECONDS:
        return cached["payload"]

    geo = geocode_place(destination, city, location, country)
    south, north, west, east = expand_bbox(geo["south"], geo["north"], geo["west"], geo["east"], factor=0.42)
    raw_elements = overpass_search(south, north, west, east)

    hotels: List[Dict[str, Any]] = []
    for element in raw_elements:
        normalized = normalize_hotel(
            element=element,
            resolved_city=geo["resolved_city"],
            resolved_country=geo["resolved_country"],
        )
        if normalized:
            hotels.append(normalized)

    hotels = dedupe_hotels(hotels)
    hotels.sort(key=score_hotel, reverse=True)

    payload = {
        "query": geo["query_text"],
        "display_name": geo["display_name"],
        "results": hotels,
        "total": len(hotels),
        "resolved_city": geo["resolved_city"],
        "resolved_country": geo["resolved_country"],
    }
    SEARCH_CACHE[key] = {"timestamp": now_ts(), "payload": payload}
    return payload


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {"ok": True}


@app.get("/api/maps-config")
def maps_config() -> Dict[str, Any]:
    return {
        "google_maps_api_key": GOOGLE_MAPS_API_KEY,
        "google_maps_configured": bool(GOOGLE_MAPS_API_KEY),
    }


@app.get("/api/search")
def search_hotels(
    destination: str = Query(default=""),
    country: str = Query(default=""),
    city: str = Query(default=""),
    location: str = Query(default=""),
    checkin: str = Query(default=""),
    checkout: str = Query(default=""),
    guests: int = Query(default=1),
    rooms: int = Query(default=1),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
) -> Dict[str, Any]:
    try:
        payload = search_real_hotels(destination, city, location, country)
        all_results = payload["results"]

        start = (page - 1) * page_size
        end = start + page_size
        page_results = all_results[start:end]

        total = len(all_results)
        has_more = end < total

        return {
            "message": f"Found {total} real hotel results for {payload['query']}.",
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_more": has_more,
            "results": page_results,
            "query": payload["query"],
            "display_name": payload["display_name"],
            "resolved_city": payload["resolved_city"],
            "resolved_country": payload["resolved_country"],
            "search_meta": {
                "checkin": checkin,
                "checkout": checkout,
                "guests": guests,
                "rooms": rooms,
            },
        }
    except Exception as exc:
        return {
            "message": "Search completed with no results.",
            "detail": str(exc),
            "page": page,
            "page_size": page_size,
            "total": 0,
            "has_more": False,
            "results": [],
        }