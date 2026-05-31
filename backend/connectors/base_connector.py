from abc import ABC, abstractmethod


class BaseConnector(ABC):

    @abstractmethod
    async def search_hotels(
        self,
        country: str,
        city: str,
        checkin: str,
        checkout: str,
        adults: int = 2,
        children: int = 0
    ):
        pass

    @abstractmethod
    async def create_booking(
        self,
        hotel_id: str,
        rate_key: str,
        guest: dict
    ):
        pass

    @abstractmethod
    async def cancel_booking(
        self,
        booking_reference: str
    ):
        pass