const { clean, money, number } = require("../../../utils/text");
const { toUniversalHotel } = require("../../../models/universalHotel");
const logger = require("../../../config/logger");

async function search(criteria = {}, context = {}) {
    if (!criteria.countryCode) {
        logger.warn("[WebBeds] No countryCode provided for search.");
        return [];
    }

    const apiKey = process.env.WEBBEDS_API_KEY;
    if (!apiKey) {
        logger.warn("[WebBeds] Missing API Key in .env. Please set WEBBEDS_API_KEY.");
        return [];
    }

    try {
        const queryParams = new URLSearchParams({
            country_code: criteria.countryCode,
            city: criteria.city || "",
            check_in: criteria.checkIn,
            check_out: criteria.checkOut,
            adults: Math.max(1, Number(criteria.guests || 2)),
            currency: criteria.currency || "GBP",
            limit: Math.min(100, Number(criteria.limit || 50))
        });

        const url = `${process.env.WEBBEDS_BASE_URL || "https://api.webbeeds.com"}/hotels?${queryParams}`;
        const response = await fetch(url, {
           headers: { "X-API-Key": apiKey }
        });

        if (!response.ok) {
            logger.warn(`[WebBeds] API Error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        // FIX: Validate that data.hotels exists and is an array
        const rawHotels = Array.isArray(data?.hotels) ? data.hotels : [];

        if (rawHotels.length === 0) {
            logger.info(`[WebBeds] 0 hotels found for ${criteria.countryCode}.`);
        }

        return rawHotels.map(hotel => {
            return toUniversalHotel({
                hotelId: `WEBBEDS-${hotel.id}`,
                name: hotel.name,
                city: hotel.city || criteria.city || "",
                country: hotel.country || criteria.country || "",
                price: money(hotel.price || 0),
                currency: hotel.currency || criteria.currency || "GBP",
                image: hotel.images?.[0] || "",
                source: "webbeeds_live_supplier",
                rooms: [{
                    roomName: hotel.room_type || "Standard Room",
                    price: money(hotel.price || 0),
                    displayCurrency: hotel.currency || criteria.currency || "GBP",
                }]
            }, criteria, "WEBBEDS");
        });

    } catch (err) {
        logger.warn(`[WebBeds] Search Failed: ${err.message}`);
        return [];
    }
}

module.exports = { code: "WEBBEDS", name: "WebBeds", search };