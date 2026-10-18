const { URLSearchParams } = require("url");
const fs = require("fs");
const path = require("path");

// ============================================================
// HOTEL IMAGE INDEX - loaded once at startup
// ============================================================
let hotelImagesIndex = {};
try {
  const imgPath = path.join(__dirname, "data", "hotel-images-index.json");
  if (fs.existsSync(imgPath)) {
    hotelImagesIndex = JSON.parse(fs.readFileSync(imgPath, "utf8"));
    console.log("[Images] Loaded " + Object.keys(hotelImagesIndex).length + " hotel images");
  } else {
    console.warn("[Images] File not found: " + imgPath);
  }
} catch (e) {
  console.warn("[Images] Could not load image index:", e.message);
}

function lookupImage(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  if (hotelImagesIndex[key]) return hotelImagesIndex[key];

  const STOP = new Set(["the", "a", "an", "and", "of", "by", "at", "in", "on", "for", "with"]);
  const normalize = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)).join(" ").trim();

  const normKey = normalize(key);
  if (!normKey) return null;

  if (!lookupImage._normIndexBuilt) {
    lookupImage._normIndex = {};
    for (const k of Object.keys(hotelImagesIndex)) {
      const nk = normalize(k);
      if (nk && !lookupImage._normIndex[nk]) lookupImage._normIndex[nk] = hotelImagesIndex[k];
    }
    lookupImage._normIndexBuilt = true;
    console.log("[Images] Built normalized index with " + Object.keys(lookupImage._normIndex).length + " entries");
  }

  if (lookupImage._normIndex[normKey]) return lookupImage._normIndex[normKey];

  const words = normKey.split(/\s+/).filter(w => w.length > 3);
  if (words.length < 2) return null;

  let best = null;
  let bestScore = 0;
  for (const k of Object.keys(lookupImage._normIndex)) {
    const kw = k.split(/\s+/);
    let score = 0;
    for (const w of words) { if (kw.includes(w)) score++; }
    if (score >= 2 && score > bestScore) {
      bestScore = score;
      best = lookupImage._normIndex[k];
      if (score === words.length) break;
    }
  }
  return best;
}


function cleanText(v) {
  return String(v || "").trim();
}

function first(...vals) {
  return vals.find(v => v !== undefined && v !== null && String(v).trim() !== "");
}

function normalizeImage(img) {
  if (!img) return null;
  if (typeof img === "string") return img;
  return first(img.url, img.href, img.link, img.imageUrl, img.fullUrl, img.thumbnail);
}

﻿function normalizeSupplierHotel(raw = {}, supplier = "unknown", params = {}) {
  const id = first(raw.id, raw.hotelId, raw.hotel_id, raw.code, raw.propertyId, raw.property_id, raw.hid);
  const name = first(raw.name, raw.hotelName, raw.hotel_name, raw.propertyName, raw.title);

  const images = [
    ...(Array.isArray(raw.images) ? raw.images : []),
    ...(Array.isArray(raw.photos) ? raw.photos : []),
    ...(Array.isArray(raw.gallery) ? raw.gallery : []),
    raw.image,
    raw.mainImage,
    raw.thumbnail
  ].map(normalizeImage).filter(Boolean);

  // Fallback: attach image from the local index if the supplier didn't provide one
  if (images.length === 0 && name) {
    const fallbackImage = lookupImage(name);
    if (fallbackImage) images.push(fallbackImage);
  }

  // Image lookup disabled (lookupImage not yet defined)

  const price = first(
    raw.price, raw.minPrice, raw.minRate, raw.maxRate, raw.rate, raw.total, raw.amount,
    raw.rooms?.[0]?.price, raw.rooms?.[0]?.rate, raw.rooms?.[0]?.minRate,
    raw.rooms?.[0]?.net,
    raw.offers?.[0]?.price?.amount, raw.rates?.[0]?.price, raw.rates?.[0]?.amount
  );

  const rawPrice = price ? Number(String(price).replace(/[^\d.]/g, "")) : null;
  const supplierCurrency = String(first(raw.currency, raw.priceCurrency, "EUR")).toUpperCase();
  const FX = { GBP: 1, USD: 0.787, EUR: 0.855, AED: 0.272, NGN: 0.00053, CAD: 0.577, AUD: 0.518, JPY: 0.0050 };
  const requestedCurrency = String(params.currency || "GBP").toUpperCase();
  const convertedPrice = rawPrice ? rawPrice * (FX[requestedCurrency] || 1) / (FX[supplierCurrency] || 1) : null;

  // Extract board basis, room type, cancellation, star rating
  const firstRoom = Array.isArray(raw.rooms) && raw.rooms.length ? raw.rooms[0] : null;
  const boardName = firstRoom?.boardName || "";
  const boardCode = firstRoom?.boardCode || "";
  const rateClass = firstRoom?.rateClass || "";
  const cancelAmount = firstRoom?.cancellationPolicies?.[0]?.amount;
  const cancelFrom = firstRoom?.cancellationPolicies?.[0]?.from || "";
  const promoName = firstRoom?.promotions?.[0]?.name || "";

  // Extract room code from rateKey: "20261020|...|DBL.EY|NRF RO|RO|..."
  let roomCode = "";
  if (firstRoom?.rateKey) {
    const parts = String(firstRoom.rateKey).split("|");
    if (parts.length >= 5) roomCode = parts[4] || "";
  }

  // Cancellation status
  let cancellation = "See policy";
  const numNet = Number(firstRoom?.net || 0);
  const numCancel = Number(cancelAmount || 0);
  if (numCancel === 0) cancellation = "Free cancellation";
  else if (numCancel >= numNet) cancellation = "Non-refundable";
  else cancellation = "Partial refund";

  // Star rating from categoryName like "4 EST" or categoryCode like "4EST"
  const categoryRaw = String(first(raw.categoryName, raw.categoryCode, raw.category, "")).trim();
  const starMatch = categoryRaw.match(/(\d+)/);
  const starRating = starMatch ? Number(starMatch[1]) : null;

  return {
    id: cleanText(id || supplier + "-" + Math.random().toString(36).slice(2)),
    supplier: supplier + "-" + (id || "unknown"),
    name: cleanText(name),
    city: cleanText(first(raw.city, raw.cityName, raw.destination, raw.location?.city, raw.destinationName)),
    country: cleanText(first(raw.country, raw.countryName, raw.location?.country)),
    address: cleanText(first(raw.address, raw.location?.address, raw.addressLine, raw.zoneName, raw.zoneCode)),
    zone: cleanText(first(raw.zoneName, "")),
    starRating: starRating,
    categoryName: categoryRaw,
    boardName: cleanText(boardName),
    boardCode: cleanText(boardCode),
    rateClass: cleanText(rateClass),
    roomCode: cleanText(roomCode),
    cancellation: cancellation,
    cancellationFrom: cancelFrom,
    promotion: cleanText(promoName),
    latitude: raw.latitude ? Number(raw.latitude) : null,
    longitude: raw.longitude ? Number(raw.longitude) : null,
    images,
    image: images[0] || null,
    price: convertedPrice,
    currency: requestedCurrency,
    live: !!convertedPrice,
    raw
  };
}

function mergeHotels(hotels = []) {
  const map = new Map();

  for (const h of hotels) {
    if (!h || !h.name) continue;
    const key = `${h.name.toLowerCase()}|${h.city.toLowerCase()}|${h.country.toLowerCase()}`;
    const old = map.get(key);

    if (!old) {
      map.set(key, h);
    } else {
      old.suppliers = [...new Set([...(old.suppliers || [old.supplier]), h.supplier])];
      old.images = [...new Set([...(old.images || []), ...(h.images || [])])];
      old.image = old.image || h.image;
      old.price = old.price && h.price ? Math.min(old.price, h.price) : old.price || h.price;
      old.live = old.live || h.live;
    }
  }

  return [...map.values()].map(h => ({
    ...h,
    suppliers: h.suppliers || [h.supplier],
    sourceCount: (h.suppliers || [h.supplier]).length
  }));
}

async function safeFetchSupplier(name, fn) {
  try {
    const data = await fn();
    const list = Array.isArray(data) ? data : [];
    
    // --- DEBUG: Log the first hotel's raw structure from each supplier ---
    if (list.length > 0) {
      console.log(`[${name}] SUCCESS: Returned ${list.length} hotels.`);
      console.log(`[${name}] First hotel raw keys:`, Object.keys(list[0]).join(", "));
      console.log(`[${name}] First hotel raw images:`, JSON.stringify(list[0].images || list[0].photos || list[0].gallery || list[0].image || list[0].mainImage || list[0].thumbnail || "NO IMAGES FIELD FOUND"));
    } else {
      console.warn(`[${name}] Returned 0 hotels.`);
    }
    // -------------------------------------------------------------------
    
    return list;
  } catch (e) {
    console.error(`[${name}] failed:`, e.message);
    return [];
  }
}

async function postJson(url, headers, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  const data = await r.json();
  
  // DEBUG: Log the raw HyperGuest response shape to the terminal
  if (url.includes("hyperguest")) {
    console.log(`[HyperGuest DEBUG] Response keys:`, Object.keys(data).join(", "));
    console.log(`[HyperGuest DEBUG] Response sample:`, JSON.stringify(data).slice(0, 500));
  }
  
  return data.hotels || data.results || data.properties || data.data?.hotels || data.data || [];
}

async function fetchWebBedsInventory(params) {
  const baseUrl = process.env.WEBBEDS_BASE_URL;
  const username = process.env.WEBBEDS_USERNAME || process.env.WEBBEDS_USER;
  const password = process.env.WEBBEDS_PASSWORD || process.env.WEBBEDS_PASS;
  const companyId = process.env.WEBBEDS_COMPANY_ID || process.env.WEBBEDS_COMPANY_CODE;

  if (!baseUrl || !username || !password || !companyId) return [];

  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  
  return postJson(baseUrl, {
    Authorization: `Basic ${auth}`,
    "X-Company-Id": companyId
  }, params);
}

// ============================================================
// HOTELBEDS (Hotelbeds / TravelBeds API)
// ============================================================
// Hotelbeds uses a signature-based authentication:
//   SHA256(apiKey + secret + timestamp)
// Destination codes are resolved dynamically from the Hotelbeds
// Locations API to support every city in the world.
// ============================================================

﻿let hotelbedsCityCodeMap = {};
try {
  const path = require("path");
  const fs = require("fs");
  const mapPath = path.join(__dirname, "data", "hotelbeds-city-to-code.json");
  if (fs.existsSync(mapPath)) {
    hotelbedsCityCodeMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
    console.log("[Hotelbeds] Loaded " + Object.keys(hotelbedsCityCodeMap).length + " city mappings");
  } else {
    console.warn("[Hotelbeds] City map file not found at " + mapPath);
  }
} catch (e) {
  console.warn("[Hotelbeds] Could not load city map: " + e.message);
}

const hotelbedsDestinationCache = new Map();

﻿async function resolveHotelbedsDestination(params) {
  const city = String(params.city || "").trim().toLowerCase();
  const country = String(params.country || "").trim().toLowerCase();
  if (!city) return null;

  const cacheKey = country + "|" + city;
  if (hotelbedsDestinationCache.has(cacheKey)) {
    return hotelbedsDestinationCache.get(cacheKey);
  }

  const localCode = hotelbedsCityCodeMap[cacheKey];
  if (localCode && /^[A-Z]{3,4}$/.test(localCode.trim())) {
    hotelbedsDestinationCache.set(cacheKey, localCode);
    console.log("[Hotelbeds] Resolved " + city + ", " + country + " -> " + localCode + " (local cache)");
    return localCode;
  }

  const baseUrl = String(process.env.HOTELBEDS_BASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = String(process.env.HOTELBEDS_API_KEY || "").trim();
  const secret = String(process.env.HOTELBEDS_SECRET || "").trim();
  if (!baseUrl || !apiKey || !secret) {
    console.warn("[Hotelbeds] Missing credentials for API fallback");
    return null;
  }

  try {
    const ts = Math.floor(Date.now() / 1000);
    const sig = require("crypto").createHash("sha256").update(apiKey + secret + ts).digest("hex");
    const url = baseUrl + "/hotel-content-api/1.0/locations/destinations?fields=code,name,countryCode&language=ENG&from=1&to=1000&useSecondaryLanguage=false";
    const res = await fetch(url, { headers: { "Api-key": apiKey, "X-Signature": sig, "Accept": "application/json" } });
    if (!res.ok) {
      console.warn("[Hotelbeds] API fallback failed: " + res.status);
      return null;
    }
    const data = await res.json();
    const destinations = Array.isArray(data.destinations) ? data.destinations : [];
    const getName = (d) => {
      if (!d) return "";
      if (typeof d.name === "string") return d.name;
      if (d.name && typeof d.name === "object" && d.name.content) return d.name.content;
      return "";
    };
    const match = destinations.find((d) => getName(d).toLowerCase() === city && /^[A-Z]{3,4}$/.test(String(d.code || "").trim()));
    if (match && match.code) {
      hotelbedsDestinationCache.set(cacheKey, match.code);
      console.log("[Hotelbeds] Resolved " + city + ", " + country + " -> " + match.code + " (API)");
      return match.code;
    }
    console.warn("[Hotelbeds] No destination found for " + city + ", " + country);
    return null;
  } catch (e) {
    console.error("[Hotelbeds] Lookup error: " + e.message);
    return null;
  }
}


async function fetchHotelbedsInventory(params) {
  const baseUrl = String(process.env.HOTELBEDS_BASE_URL || "").trim().replace(/\/$/, "");
  const apiKey = String(process.env.HOTELBEDS_API_KEY || "").trim();
  const secret = String(process.env.HOTELBEDS_SECRET || "").trim();

  if (!baseUrl || !apiKey || !secret) {
    console.warn("[Hotelbeds] Missing credentials in .env");
    return [];
  }

  // Resolve the destination code (LON, PAR, NYC, etc.)
  const destinationCode = await resolveHotelbedsDestination(params);
  if (!destinationCode) return [];

  // Build the Hotelbeds Availability request
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = require("crypto")
    .createHash("sha256")
    .update(apiKey + secret + timestamp)
    .digest("hex");

  const body = {
    stay: {
      checkIn: params.checkIn,
      checkOut: params.checkOut
    },
    occupancies: [
      {
        rooms: params.rooms || 1,
        adults: params.adults || 2,
        children: params.children || 0
      }
    ],
    destination: {
      code: destinationCode
    },
    filter: {
      maxHotels: 500
    }
  };

  try {
    const res = await fetch(`${baseUrl}/hotel-api/1.0/hotels`, {
      method: "POST",
      headers: {
        "Api-key": apiKey,
        "X-Signature": signature,
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Hotelbeds ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    console.log("[HB-RAW-RESP] HTTP OK. Body keys:", Object.keys(data || {}).join(", "));
      console.log("[HB-RAW-RESP] hotels field:", JSON.stringify(data?.hotels).slice(0, 500));
      const hotels = Array.isArray(data?.hotels?.hotels) ? data.hotels.hotels : [];
      console.log(`[Hotelbeds] Returned ${hotels.length} hotels for ${destinationCode}`);
      return hotels;
  } catch (e) {
    console.error("[Hotelbeds] Fetch failed:", e.message);
    return [];
  }
}

async function fetchRateHawkInventory(params) {
  const baseUrl = process.env.RATEHAWK_BASE_URL;
  const keyId = process.env.RATEHAWK_KEY_ID;
  const keyToken = process.env.RATEHAWK_KEY_TOKEN || process.env.RATEHAWK_API_TOKEN;

  if (!baseUrl || !keyId || !keyToken) return [];

  const auth = Buffer.from(`${keyId}:${keyToken}`).toString("base64");
  
  return postJson(baseUrl, {
    Authorization: `Basic ${auth}`
  }, params);
}
// ============================================================
// HYPERGUEST STATIC DATA FETCHER (for images)
// This fetches the full hotel list (with images) once and caches it.
// It refreshes every 6 hours.
// ============================================================
let hyperGuestStaticCache = {
  data: null,
  timestamp: 0
};

async function fetchHyperGuestStaticData() {
  const cacheAge = Date.now() - hyperGuestStaticCache.timestamp;
  const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

  // Return cached data if it's still fresh
  if (hyperGuestStaticCache.data && cacheAge < CACHE_DURATION) {
    return hyperGuestStaticCache.data;
  }

  const url = process.env.HYPERGUEST_STATIC_URL || "https://hg-static.hyperguest.com/hotels.json";
  const user = "developer";
  const password = process.env.HYPERGUEST_DEV_PASSWORD || "";
  const token = process.env.HYPERGUEST_API_KEY || process.env.HYPERGUEST_TOKEN || process.env.HYPERGUEST_AUTH_TOKEN;

  const headers = {
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json"
  };

  if (user && password) {
    const auth = Buffer.from(`${user}:${password}`).toString("base64");
    headers["Authorization"] = `Basic ${auth}`;
  } else if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    console.error("[HyperGuest Static] No credentials available.");
    return null;
  }

  try {
    console.log("[HyperGuest Static] Downloading fresh hotel data with images...");
    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`[HyperGuest Static] Failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    hyperGuestStaticCache.data = data;
    hyperGuestStaticCache.timestamp = Date.now();
    console.log(`[HyperGuest Static] Success. Cached ${Array.isArray(data) ? data.length : 'N/A'} records.`);
    return data;
  } catch (e) {
    console.error("[HyperGuest Static] Fetch error:", e.message);
    return null;
  }
}
async function fetchHyperGuestInventory(params) {
  const token = process.env.HYPERGUEST_AUTH_TOKEN || process.env.HYPERGUEST_API_KEY || process.env.HYPERGUEST_TOKEN;
  const baseUrl = process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/";
  if (!token || !baseUrl) return [];

  const fs = require("fs");
  const path = require("path");
  const cachePath = path.join(__dirname, "data", "hyperguest-static-cache.json");
  if (!fs.existsSync(cachePath)) {
    console.warn("[HyperGuest] Static cache not found at " + cachePath);
    return [];
  }
  const staticCache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  const byCity = staticCache.byCity || {};

  const cityKey = String(params.city || "").trim().toLowerCase();
  const hotelIds = byCity[cityKey] || [];
  if (!hotelIds.length) {
    console.log("[HyperGuest] No hotels in cache for city: " + cityKey);
    return [];
  }

  const idsToQuery = hotelIds.slice(0, 50);

  const nights = (() => {
    const start = new Date(params.checkIn);
    const end = new Date(params.checkOut);
    const diff = Math.ceil((end - start) / 86400000);
    return Number.isFinite(diff) && diff > 0 ? diff : 1;
  })();

  const q = new URLSearchParams({
    hotelIds: idsToQuery.join(","),
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    nights: String(nights),
    guests: String(params.adults || 2),
    currency: String(params.currency || "GBP")
  });

  const url = baseUrl.replace(/\/$/, "") + "/?" + q.toString();
  console.log("[HyperGuest] Requesting " + idsToQuery.length + " hotels for " + cityKey);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/json",
      "Accept-Encoding": "gzip, deflate"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    console.warn("[HyperGuest] Failed " + res.status + ": " + text.slice(0, 200));
    return [];
  }

  const data = await res.json();
  const results = Array.isArray(data && data.results) ? data.results : [];

  // Map HyperGuest shape to Hotelbeds-compatible shape
  const mapped = results.map(h => {
    const info = h.propertyInfo || {};
    const firstRoom = Array.isArray(h.rooms) && h.rooms.length ? h.rooms[0] : null;
    const minRate = firstRoom && firstRoom.rates && firstRoom.rates[0]
      ? (firstRoom.rates[0].net || firstRoom.rates[0].amount || firstRoom.rates[0].price)
      : null;
    return {
      code: h.propertyId,
      hotelId: h.propertyId,
      name: info.name,
      categoryCode: info.starRating ? info.starRating + "EST" : "",
      categoryName: info.starRating ? info.starRating + " STARS" : "",
      destinationCode: params.destinationCode || "",
      destinationName: info.cityName || "",
      zoneName: info.regionName || "",
      latitude: info.latitude,
      longitude: info.longitude,
      address: info.address || "",
      city: info.cityName || "",
      countryCode: info.countryCode || "",
      rooms: firstRoom ? [{
        roomName: firstRoom.roomTypeCode || "Available room",
        boardName: firstRoom.boardName || "",
        net: minRate,
        currency: "GBP",
        price: minRate,
        rate_source_id: "hyperguest-" + h.propertyId
      }] : [],
      minRate: minRate,
      maxRate: minRate,
      currency: "GBP"
    };
  });
  console.log("[HyperGuest] Returned " + results.length + " hotels");
  return mapped;
}

async function federatedHotelSearch(req, res) {
  const body = req.body || {};
  const q = req.query || {};

  // FIX: Global Destination. Never default to London.
  const rawDestination = q.destination || q.city || body.destination || body.city || body.location || q.location || "";
  const rawCountry = q.country || body.country || body.countryCode || q.countryCode || "";

  // If the user typed "Paris, France", split it into city and country for the suppliers
  let city = q.city || body.city || rawDestination;
  let country = rawCountry;
  
  if (rawDestination && rawDestination.includes(",") && !country) {
    const parts = rawDestination.split(",");
    city = parts[0].trim();
    country = parts[1].trim();
  }

  // Safety check: If no destination at all, return an error instead of defaulting to London.
  if (!city && !country) {
    return res.status(400).json({
      ok: false,
      message: "Please provide a valid destination (city or country) to search."
    });
  }

  const params = {
    destination: rawDestination || city,
    city: city,
    country: country || "GB",
    checkIn: q.checkIn || body.checkIn,
    checkOut: q.checkOut || body.checkOut,
    adults: Number(q.adults || body.adults || 2),
    children: Number(q.children || body.children || 0),
    rooms: Number(q.rooms || body.rooms || 1),
    nationality: q.nationality || body.nationality || "GB"
  };

  const [webbeds, ratehawk, hyperguest, hotelbeds] = await Promise.all([
    safeFetchSupplier("WebBeds", () => fetchWebBedsInventory(params)),
    safeFetchSupplier("RateHawk", () => fetchRateHawkInventory(params)),
    safeFetchSupplier("HyperGuest", () => fetchHyperGuestInventory(params)),
    safeFetchSupplier("Hotelbeds", () => fetchHotelbedsInventory(params))
  ]);

  // Log if all suppliers failed to help debug the "could not complete" error
  if (webbeds.length === 0 && ratehawk.length === 0 && hyperguest.length === 0 && hotelbeds.length === 0) {
    console.error("[SEARCH FAILED] All suppliers returned 0 results. Params sent:", JSON.stringify(params));
  }

  const hotels = mergeHotels([
    ...webbeds.map(h => normalizeSupplierHotel(h, "WebBeds")),
    ...ratehawk.map(h => normalizeSupplierHotel(h, "RateHawk")),
    ...hyperguest.map(h => normalizeSupplierHotel(h, "HyperGuest")),
    ...hotelbeds.map(h => normalizeSupplierHotel(h, "Hotelbeds"))
  ])
    .filter(h => h.name && h.live && h.price)
    .sort((a, b) => a.price - b.price);

  res.json({
    ok: true,
    live: true,
    total: hotels.length,
    suppliers: {
      WebBeds: webbeds.length,
      RateHawk: ratehawk.length,
      HyperGuest: hyperguest.length,
      Hotelbeds: hotelbeds.length
    },
    hotels
  });
}

module.exports = {
  federatedHotelSearch,
  normalizeSupplierHotel,
  mergeHotels
};



