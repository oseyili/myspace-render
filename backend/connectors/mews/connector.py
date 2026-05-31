from connectors.base_connector import BaseConnector


class MewsConnector(BaseConnector):

    async def search_hotels(
        self,
        country,
        city,
        checkin,
        checkout,
        adults=2,
        children=0
    ):
        return []

    async def create_booking(
        self,
        hotel_id,
        rate_key,
        guest
    ):
        return {
            "ok": False
        }

    async def cancel_booking(
        self,
        booking_reference
    ):
        return {
            "ok": False
        }