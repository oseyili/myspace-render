const { clean, money, number, nowISO } = require("../../../utils/text");
const { toUniversalHotel } = require("../../../models/universalHotel");
const logger = require("../../../config/logger");

async function search(criteria = {}, context = {}) {
    if (!criteria.countryCode) {
        logger.warn("[RateHawk] No countryCode provided for search.");
        return [];
    }

    // Check API Key
    const apiKey = process.env.RATEHAWK_API_KEY;
    if (!apiKey) {
        logger.warn("[RateHawk] Missing API Key in .env. Please set RATEHAWK_API_KEY.");
        return [];
    }

    const body = {
        country_code: criteria.countryCode,
        city: criteria.city || "",
        check_in: criteria.checkIn,
        check_out: criteria.checkOut,
        guests: Math.max(1, Number(criteria.guests || 2)),
        currency: criteria.currency || "GBP",
        limit: Math.min(100, Number(criteria.limit || 50))
    };

    try {
        const url = (process.env.RATEHAWK_BASE_URL || "https://api.ratehawk.com") + "/v1/search";
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-KEY": apiKey
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            logger.warn(`[RateHawk] API Error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        // FIX: Validate that data.hotels exists and is an array
        const rawHotels = Array.isArray(data?.hotels) ? data.hotels : [];

        if (rawHotels.length === 0) {
            logger.info(`[RateHawk] 0 hotels found for ${criteria.countryCode}.`);
        }

        return rawHotels.map(hotel => {
            return toUniversalHotel({
                hotelId: `RATEHAWK-${hotel.id}`,
                name: hotel.name,
                city: hotel.city || criteria.city || "",
                country: hotel.country || criteria.country || "",
                price: money(hotel.price || 0),
                currency: hotel.currency || criteria.currency || "GBP",
                image: hotel.image || hotel.thumbnail || "",
                source: "ratehawk_live_supplier",
                rooms: [{
                    roomName: hotel.room_type || "Standard Room",
                    price: money(hotel.price || 0),
                    displayCurrency: hotel.currency || criteria.currency || "GBP",
                }]
            }, criteria, "RATEHAWK");
        });

    } catch (err) {
        logger.warn(`[RateHawk] Search Failed: ${err.message}`);
        return [];
    }
}

module.exports = { code: "RATEHAWK", name: "RateHawk", search };