import asyncio

from connectors.hyperguest.connector import HyperGuestConnector
from connectors.cloudbeds.connector import CloudbedsConnector
from connectors.mews.connector import MewsConnector
from connectors.roomraccoon.connector import RoomRaccoonConnector
from connectors.protel.connector import ProtelConnector
from connectors.opera.connector import OperaConnector


hyperguest = HyperGuestConnector()
cloudbeds = CloudbedsConnector()
mews = MewsConnector()
roomraccoon = RoomRaccoonConnector()
protel = ProtelConnector()
opera = OperaConnector()


async def search_all_pms(
    country,
    city,
    checkin,
    checkout,
    adults=2,
    children=0
):

    results = await asyncio.gather(

        hyperguest.search_hotels(
            country,
            city,
            checkin,
            checkout,
            adults,
            children
        ),

        cloudbeds.search_hotels(
            country,
            city,
            checkin,
            checkout,
            adults,
            children
        ),

        mews.search_hotels(
            country,
            city,
            checkin,
            checkout,
            adults,
            children
        ),

        roomraccoon.search_hotels(
            country,
            city,
            checkin,
            checkout,
            adults,
            children
        ),

        protel.search_hotels(
            country,
            city,
            checkin,
            checkout,
            adults,
            children
        ),

        opera.search_hotels(
            country,
            city,
            checkin,
            checkout,
            adults,
            children
        ),

        return_exceptions=True
    )

    hotels = []

    for r in results:

        if isinstance(r, list):
            hotels.extend(r)

    return hotels