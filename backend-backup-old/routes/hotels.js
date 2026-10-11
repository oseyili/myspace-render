const express = require("express");
const router = express.Router();
const { searchHotels, selectedLiveRate } = require("../services/search/searchOrchestrator");
const logger = require("../config/logger");

// --- PLATFORM V2 SEARCH ---
router.get("/platform/v2/search", async (req, res) => {
    try {
        const result = await searchHotels(req.query);
        res.json(result);
    } catch (error) {
        logger.error(`V2 Search Error: ${error.message}`);
        res.status(500).json({ ok: false, success: false, count: 0, hotels: [], message: "Search failed." });
    }
});

// --- CUSTOMER GLOBAL HOTELS (Main Frontend endpoint) ---
// I have REMOVED the "if (!city) return error" block from this route completely.
router.get("/customer-global-hotels", async (req, res) => {
    try {
        logger.info(`[HOTELS ROUTE] Global Search: Country=${req.query.country}, City=${req.query.city || 'NONE'}`);
        // Pass it directly to the orchestrator
        const result = await searchHotels(req.query);
        res.json(result);
    } catch (error) {
        logger.error(`Hotels Route Error: ${error.message}`);
        res.status(500).json({ ok: false, success: false, count: 0, hotels: [], message: "Search failed." });
    }
});

// --- SELECTED LIVE RATE ---
router.get("/selected-live-rate", async (req, res) => {
    try {
        const result = await selectedLiveRate(req.query);
        res.json(result);
    } catch (error) {
        res.status(500).json({ ok: false, message: error.message });
    }
});

module.exports = router;