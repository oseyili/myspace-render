import os
import httpx

from connectors.base_connector import BaseConnector


HYPERGUEST_API_KEY = os.getenv("HYPERGUEST_API_KEY", "")
HYPERGUEST_BASE_URL = os.getenv(
    "HYPERGUEST_BASE_URL",
    "https://api.hyperguest.io"
)


class HyperGuestConnector(BaseConnector):

    async def search_hotels(
        self,
        country,
        city,
        checkin,
        checkout,
        adults=2,
        children=0
    ):

        if not HYPERGUEST_API_KEY:
            return []

        headers = {
            "Authorization": f"Bearer {HYPERGUEST_API_KEY}",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json"
        }

        payload = {
            "country": country,
            "city": city,
            "checkin": checkin,
            "checkout": checkout,
            "adults": adults,
            "children": children
        }

        try:

            async with httpx.AsyncClient(timeout=60) as client:

                response = await client.post(
                    f"{HYPERGUEST_BASE_URL}/search",
                    json=payload,
                    headers=headers
                )

                if response.status_code != 200:
                    print("HyperGuest error:", response.text)
                    return []

                data = response.json()

                hotels = []

                for h in data.get("hotels", []):

                    hotels.append({

                        "hotel_id": str(h.get("id", "")),
                        "hotel_name": h.get("name", ""),
                        "room_name": h.get("room_name", ""),
                        "currency": h.get("currency", "USD"),
                        "price": float(h.get("price", 0)),
                        "available": True,
                        "checkin": checkin,
                        "checkout": checkout,
                        "images": h.get("images", []),
                        "latitude": h.get("latitude", 0),
                        "longitude": h.get("longitude", 0),
                        "cancellation_policy": h.get(
                            "cancellation_policy",
                            ""
                        ),
                        "rate_key": h.get("rate_key", ""),
                        "supplier": "hyperguest"
                    })

                return hotels

        except Exception as e:
            print("HyperGuest search failed:", str(e))
            return []

    async def create_booking(
        self,
        hotel_id,
        rate_key,
        guest
    ):

        headers = {
            "Authorization": f"Bearer {HYPERGUEST_API_KEY}",
            "Content-Type": "application/json"
        }

        payload = {
            "hotel_id": hotel_id,
            "rate_key": rate_key,
            "guest": guest
        }

        try:

            async with httpx.AsyncClient(timeout=60) as client:

                response = await client.post(
                    f"{HYPERGUEST_BASE_URL}/book",
                    json=payload,
                    headers=headers
                )

                return response.json()

        except Exception as e:

            return {
                "ok": False,
                "message": str(e)
            }

    async def cancel_booking(
        self,
        booking_reference
    ):

        return {
            "ok": False,
            "message": "Cancellation flow not connected yet"
        }