from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict
import random

# =========================
# APP INIT (FORCE DOCS ON)
# =========================
app = FastAPI(
    title="My Space Hotel Backend",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# =========================
# CORS (ALLOW FRONTEND)
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# TEST ROOT (VERY IMPORTANT)
# =========================
@app.get("/")
def root():
    return {"message": "Backend is LIVE"}

# =========================
# TEST API (CONFIRM ROUTES)
# =========================
@app.get("/api/test")
def test():
    return {"status": "API working"}

# =========================
# SAMPLE HOTEL DATA (WORKING DATASET)
# =========================
HOTELS = [
    {
        "name": "Grand London Hotel",
        "city": "London",
        "price": 120,
        "rating": 4.5,
        "image": "https://images.unsplash.com/photo-1566073771259-6a8506099945"
    },
    {
        "name": "Paris Luxury Stay",
        "city": "Paris",
        "price": 150,
        "rating": 4.7,
        "image": "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa"
    },
    {
        "name": "New York Central Hotel",
        "city": "New York",
        "price": 200,
        "rating": 4.6,
        "image": "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb"
    },
    {
        "name": "Dubai Palace Resort",
        "city": "Dubai",
        "price": 300,
        "rating": 4.9,
        "image": "https://images.unsplash.com/photo-1501117716987-c8e1ecb2109e"
    },
]

# =========================
# SEARCH ENDPOINT
# =========================
@app.get("/api/hotels")
def search_hotels(city: str = Query(...)):
    results = [
        hotel for hotel in HOTELS
        if city.lower() in hotel["city"].lower()
    ]

    # If nothing found, return random hotels
    if not results:
        results = random.sample(HOTELS, min(3, len(HOTELS)))

    return results