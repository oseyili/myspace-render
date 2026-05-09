from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import requests
import hashlib
import time
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPLIER_MODE = os.getenv("SUPPLIER_MODE", "TEST")

HOTELBEDS_API_KEY = os.getenv("HOTELBEDS_API_KEY")
HOTELBEDS_SECRET = os.getenv("HOTELBEDS_SECRET")
HOTELBEDS_BASE_URL = os.getenv("HOTELBEDS_BASE_URL")

def hotelbeds_headers():
    timestamp = str(int(time.time()))
    signature = hashlib.sha256(
        (HOTELBEDS_API_KEY + HOTELBEDS_SECRET + timestamp).encode()
    ).hexdigest()

    return {
        "Api-key": HOTELBEDS_API_KEY,
        "X-Signature": signature,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }

@app.get("/status")
def status():
    return {
        "mode": SUPPLIER_MODE,
        "hotelbeds_ready": SUPPLIER_MODE == "HOTELBEDS"
    }

@app.get("/api/hotels/search")
def search_hotels(city: str = "London"):
    if SUPPLIER_MODE == "TEST":
        return {"hotels": []}

    url = f"{HOTELBEDS_BASE_URL}/hotel-api/1.0/hotels"

    params = {
        "destination": city,
        "from": 1,
        "to": 20
    }

    response = requests.get(url, headers=hotelbeds_headers(), params=params)

    if response.status_code != 200:
        return {"error": response.text}

    data = response.json()

    hotels = []

    for h in data.get("hotels", []):
        hotels.append({
            "id": h.get("code"),
            "name": h.get("name"),
            "city": city,
            "image": "",
            "price": "Live pricing",
            "rating": h.get("categoryName", "")
        })

    return {"hotels": hotels}

@app.post("/reservation-request")
def reservation_request(payload: dict):
    return {
        "ok": True,
        "message": "Supplier integration ready"
    }