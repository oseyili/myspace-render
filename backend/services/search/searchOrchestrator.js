const crypto = require("crypto");
const { env } = require("../../config/env");
const logger = require("../../config/logger");
const { supplierStatus } = require("../../config/suppliers");
const { resolveCriteria } = require("../destination");
const cache = require("../cache");
const suppliers = require("../suppliers");
const { dedupeAndRank } = require("../ranking");
const { toUniversalHotel } = require("../../models/universalHotel");
const { callLegacy } = require("../suppliers/legacy/bridge");
const { number } = require("../../utils/text");
const { filterToRequestedLocation } = require("../destination/rules");
const { enrichPayload } = require("../supplierContentResolver");
const { getCountryCode } = require("../../utils/countryCodes");
const axios = require("axios");

// --- INTERCEPTOR: Replace native fetch with axios globally ---
// This fixes "fetch failed" errors for ALL supplier files automatically.
global.fetch = async (url, options) => {
    try {
        const config = {
            url: url,
            method: options?.method || 'GET',
            headers: options?.headers || {},
            timeout: 15000 // 15-second timeout to prevent hanging
        };

        // Only attach body if it exists and method allows it
        if (options?.body && ['POST', 'PUT', 'PATCH'].includes(config.method.toUpperCase())) {
            config.data = JSON.parse(options.body);
        }

        const response = await axios(config);
        
        return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            statusText: response.statusText,
            json: async () => response.data,
            text: async () => JSON.stringify(response.data)
        };
    } catch (error) {
        // If the error is due to a DNS or network timeout, log it clearly
        if (error.code === 'ENOTFOUND') {
            logger.error(`[NETWORK] DNS Lookup failed for URL: ${url}`);
        } else if (error.code === 'ECONNREFUSED') {
            logger.error(`[NETWORK] Connection refused for URL: ${url}`);
        } else if (error.code === 'ECONNABORTED') {
            logger.error(`[NETWORK] Request timeout for URL: ${url}`);
        } else if (error.response) {
            // The request was made and the server responded with a status code outside 2xx
            return {
                ok: false,
                status: error.response.status,
                statusText: error.response.statusText,
                json: async () => error.response.data,
                text: async () => JSON.stringify(error.response.data)
            };
        } else {
            logger.warn(`[GLOBAL FETCH] Unknown network error: ${error.message}`);
        }

        // Return a failure response that mimics a network crash
        return {
            ok: false,
            status: error.response?.status || 500,
            json: async () => ({}),
            text: async () => ""
        };
    }
};
// -----------------------------------------------------------------

function cacheKey(criteria) {
  return crypto.createHash("sha1").update(JSON.stringify({
    country: criteria.country, city: criteria.city, checkIn: criteria.checkIn, checkOut: criteria.checkOut,
    guests: criteria.guests, rooms: criteria.rooms, currency: criteria.currency, limit: criteria.limit
  })).digest("hex");
}

async function searchHotels(query = {}) {
  const started = Date.now();
  const criteria = resolveCriteria(query);
  
  if (criteria.country) {
      criteria.countryCode = getCountryCode(criteria.country);
      logger.info(`[MAP] Converted "${criteria.country}" to "${criteria.countryCode}"`);
  }
  
  const limit = Math.max(1, Math.min(number(criteria.limit || 60), 1000));
  const offset = Math.max(0, number(criteria.offset || 0));
  const key = cacheKey({ ...criteria, limit: Math.max(limit, 300) });

  const cached = cache.get(key);
  if (cached) return { ...cached, cached: true, offset, limit, hotels: cached.allHotels.slice(offset, offset + limit) };

  const legacyResult = await callLegacy("/api/supplier-union-hotel-search", { ...criteria, limit: Math.max(limit, 300), offset: 0 });
  const legacyHotels = Array.isArray(legacyResult.data?.hotels) ? legacyResult.data.hotels : [];

  const supplierResults = await Promise.allSettled(suppliers.map(async (supplier) => {
    const t = Date.now();
    try {
        const hotels = await supplier.search(criteria, { legacyHotels });
        return { supplier: supplier.code, name: supplier.name, status: "ok", count: hotels.length, ms: Date.now() - t, hotels };
    } catch (err) {
        return { supplier: supplier.code, name: supplier.name, status: "error", error: err.message, ms: Date.now() - t, hotels: [] };
    }
  }));

  const stats = {};
  const rows = [];
  for (const result of supplierResults) {
    if (result.status === "fulfilled") {
      stats[result.value.supplier] = { status: result.value.status, count: result.value.count, ms: result.value.ms };
      if (result.value.error) {
          logger.warn(`[ORCHESTRATOR] Supplier ${result.value.supplier} error: ${result.value.error}`);
      } else {
          if (result.value.count > 0) {
              logger.info(`[ORCHESTRATOR] Supplier ${result.value.supplier} returned ${result.value.count} hotels in ${result.value.ms}ms`);
          } else {
              logger.info(`[ORCHESTRATOR] Supplier ${result.value.supplier} found 0 hotels in ${result.value.ms}ms`);
          }
      }
      rows.push(...result.value.hotels);
    } else {
      stats.UNKNOWN = { status: "error", error: result.reason?.message || String(result.reason) };
    }
  }

  if (rows.length === 0 && legacyHotels.length) rows.push(...legacyHotels.map((h) => toUniversalHotel(h, criteria, "CURRENT_SUPPLIER")));

  const locationSafeRows = filterToRequestedLocation(rows, criteria);
  const allHotels = dedupeAndRank(locationSafeRows);

  const response = {
    ok: true,
    success: true,
    source: "platform_v2_modular_orchestrator",
    architecture: "routes_controllers_orchestrator_supplier_adapters",
    accommodationMode: "hotel_only",
    supplierScope: "webbeds_ratehawk_hyperguest_hotelbeds", 
    suppliers: stats,
    supplierConfiguration: supplierStatus(),
    count: Math.min(limit, Math.max(0, allHotels.length - offset)),
    totalAvailable: allHotels.length,
    hasMore: offset + limit < allHotels.length,
    allHotels,
    hotels: allHotels.slice(offset, offset + limit),
    customerMessage: allHotels.length ? "Hotels found for your search." : "We could not find available hotels for this destination right now. Please try another city or date.",
    ms: Date.now() - started
  };

  const enrichedResponse = await enrichPayload(response);
  cache.set(key, enrichedResponse, env.CACHE_TTL_MS);
  logger.info(`[ORCHESTRATOR] ${criteria.city || "COUNTRY-WIDE"}, ${criteria.country}: ${allHotels.length} hotels found in ${response.ms} ms`);
  return enrichedResponse;
}

async function selectedLiveRate(query = {}) {
  const criteria = resolveCriteria(query);
  if (criteria.country) {
      criteria.countryCode = getCountryCode(criteria.country);
      logger.info(`[MAP] Converted "${criteria.country}" to "${criteria.countryCode}"`);
  }
  const result = await callLegacy("/api/supplier-union-selected-live-rate", criteria, env.SEARCH_TIMEOUT_MS);
  return result.data || { ok: true, found: false, customer_offer: null, message: "Today's price could not be checked. Please try again shortly." };
}

module.exports = { searchHotels, selectedLiveRate };