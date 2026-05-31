import os
import httpx
from connectors.base_connector import BaseConnector


CLOUDBEDS_API_KEY = os.getenv("CLOUDBEDS_API_KEY", "")

BASE_URL = "https://api.cloudbeds.com/api/v1.1"


class CloudbedsConnector(BaseConnector):

    async def search_hotels(
        self,
        country,
        city,
        checkin,
        checkout,
        adults=2,
        children=0
    ):

        if not CLOUDBEDS_API_KEY:
            return []

        headers = {
            "Authorization": f"Bearer {CLOUDBEDS_API_KEY}"
        }

        params = {
            "checkin": checkin,
            "checkout": checkout,
            "adults": adults
        }

        try:

            async with httpx.AsyncClient(timeout=30) as client:

                response = await client.get(
                    f"{BASE_URL}/getHotels",
                    headers=headers,
                    params=params
                )

                if response.status_code != 200:
                    return []

                data = response.json()

                hotels = []

                for h in data.get("data", []):

                    hotels.append({
                        "hotel_id": str(h.get("hotelID", "")),
                        "hotel_name": h.get("propertyName", ""),
                        "room_name": h.get("roomName", ""),
                        "currency": h.get("currency", "USD"),
                        "price": float(h.get("price", 0)),
                        "available": True,
                        "checkin": checkin,
                        "checkout": checkout,
                        "images": [],
                        "latitude": h.get("latitude", 0),
                        "longitude": h.get("longitude", 0),
                        "cancellation_policy": "",
                        "rate_key": h.get("rateKey", ""),
                        "supplier": "cloudbeds"
                    })

                return hotels

        except Exception:
            return []

    async def create_booking(
        self,
        hotel_id,
        rate_key,
        guest
    ):

        return {
            "ok": False,
            "message": "Cloudbeds booking flow not connected yet"
        }

    async def cancel_booking(
        self,
        booking_reference
    ):

        return {
            "ok": False,
            "message": "Cloudbeds cancellation flow not connected yet"
        }