const { clean, money, number } = require("../../../utils/text");
const { toUniversalHotel } = require("../../../models/universalHotel");
const logger = require("../../../config/logger");
const https = require("https"); // Import HTTPS for SSL bypass

async function search(criteria = {}, context = {}) {
    if (!criteria.countryCode) {
        logger.warn("[HyperGuest] No countryCode provided for search.");
        return [];
    }

    const apiKey = process.env.HYPERGUEST_API_KEY;
    const baseUrl = process.env.HYPERGUEST_BASE_URL || "https://search-api.hyperguest.io/2.0";

    if (!apiKey) {
        logger.warn("[HyperGuest] Missing API Key in .env. Please set HYPERGUEST_API_KEY.");
        return [];
    }

    try {
        const queryParams = new URLSearchParams({
            country_code: criteria.countryCode,
            destination: criteria.city || "",
            checkin_date: criteria.checkIn,
            checkout_date: criteria.checkOut,
            guests: Math.max(1, Number(criteria.guests || 2)),
            currency: criteria.currency || "GBP"
        });

        const url = `${baseUrl}/search?${queryParams}`;
        logger.info(`[HyperGuest] Trying URL: ${url}`); // Log the URL for debugging

        // --- CRITICAL FIX: SSL Bypass Agent ---
        const agent = new https.Agent({  
            rejectUnauthorized: false // Bypasses SSL certificate verification
        });
        // ------------------------------------

        const response = await fetch(url, {
            agent: agent, // Attach the bypass agent
            headers: { "x-api-key": apiKey }
        });

        if (!response.ok) {
            logger.warn(`[HyperGuest] API Error: ${response.status}`);
            return [];
        }

        const data = await response.json();
        const rawHotels = Array.isArray(data?.data) ? data.data : [];

        if (rawHotels.length === 0) {
            logger.info(`[HyperGuest] 0 hotels found for ${criteria.countryCode}.`);
        }

        return rawHotels.map(hotel => {
            return toUniversalHotel({
                hotelId: `HYPERGUEST-${hotel.id}`,
                name: hotel.name,
                city: hotel.city || criteria.city || "",
                country: hotel.country || criteria.country || "",
                price: money(hotel.total_price || 0),
                currency: hotel.currency || criteria.currency || "GBP",
                image: hotel.image_url || "",
                source: "hyperguest_live_supplier",
                rooms: [{
                    roomName: hotel.room_type || "Standard Room",
                    price: money(hotel.total_price || 0),
                    displayCurrency: hotel.currency || criteria.currency || "GBP",
                }]
            }, criteria, "HYPERGUEST");
        });

    } catch (err) {
        logger.warn(`[HyperGuest] Search Failed: ${err.message}`);
        return [];
    }
}

module.exports = { code: "HYPERGUEST", name: "HyperGuest", search };