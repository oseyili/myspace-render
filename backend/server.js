require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5050);

const DATA_DIR = path.join(__dirname, "data");
const LEDGER_FILE = path.join(DATA_DIR, "booking_ledger.json");

const PUBLIC_FRONTEND_URL =
  process.env.PUBLIC_FRONTEND_URL ||
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:5173";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

const HOTELBEDS_API_KEY = process.env.HOTELBEDS_API_KEY || "";
const HOTELBEDS_SECRET = process.env.HOTELBEDS_SECRET || "";
const HOTELBEDS_BASE_URL =
  process.env.HOTELBEDS_BASE_URL ||
  "https://api.test.hotelbeds.com/hotel-api/1.0";

app.use(cors({ origin: true, credentials: true }));

let stripe = null;
try {
  if (STRIPE_SECRET_KEY) stripe = require("stripe")(STRIPE_SECRET_KEY);
} catch {
  stripe = null;
}

app.post("/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(400).send("Stripe webhook unavailable");

    const signature = req.headers["stripe-signature"];
    const event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const reservationCode = session.metadata?.reservation_code || "";

      if (reservationCode) {
        const ledger = readLedger();
        const booking = ledger.find((x) => x.reservation_code === reservationCode);

        if (booking) {
          booking.status = "paid";
          booking.payment_confirmed = true;
          booking.payment_confirmed_at = new Date().toISOString();
          booking.stripe_session_id = session.id || "";
          booking.stripe_payment_intent = session.payment_intent || "";
          saveLedger(ledger);
        }
      }
    }

    res.json({ received: true });
  } catch {
    res.status(400).send("Webhook error");
  }
});

app.use(express.json({ limit: "10mb" }));

const FX = {
  GBP: 1,
  USD: 1.27,
  EUR: 1.17,
  NGN: 1900,
  AED: 4.66,
  CAD: 1.72,
  AUD: 1.92,
  ZAR: 23.2,
  CHF: 1.11,
  JPY: 197,
};

const DESTINATION_FALLBACK = {
  LON: { country: "United Kingdom", city: "London", currency: "GBP" },
  PAR: { country: "France", city: "Paris", currency: "EUR" },
  BCN: { country: "Spain", city: "Barcelona", currency: "EUR" },
  MAD: { country: "Spain", city: "Madrid", currency: "EUR" },
  DXB: { country: "United Arab Emirates", city: "Dubai", currency: "AED" },
  NYC: { country: "United States", city: "New York", currency: "USD" },
  LOS: { country: "Nigeria", city: "Lagos", currency: "NGN" },
  ABV: { country: "Nigeria", city: "Abuja", currency: "NGN" },
};

const EMERGENCY_NUMBERS = {
  "united kingdom": {
    emergency: "999",
    european: "112",
    police_non_emergency: "101",
    medical_non_emergency: "111",
  },
  "united states": { emergency: "911" },
  france: { emergency: "112", police: "17", ambulance: "15", fire: "18" },
  spain: { emergency: "112" },
  "united arab emirates": { emergency: "999", ambulance: "998" },
  nigeria: { emergency: "112" },
};

const SEARCH_STOPWORDS = new Set([
  "hotel",
  "hotels",
  "property",
  "properties",
  "room",
  "rooms",
  "stay",
  "stays",
  "short",
  "near",
  "in",
  "at",
  "the",
  "a",
  "an",
  "and",
  "or",
  "for",
  "to",
  "with",
]);

let IMAGE_MAP = null;
let HOTEL_CACHE = null;
let CATALOG_CACHE = null;
const liveRateMemory = new Map();

function clean(v) {
  return String(v ?? "").trim();
}

function norm(v) {
  return clean(v)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTerms(v) {
  return norm(v)
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .filter((x) => !SEARCH_STOPWORDS.has(x));
}

function num(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return Number(num(v).toFixed(2));
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && clean(obj[k]) !== "") return obj[k];
  }
  return "";
}

function makeCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function calculateMerchantPrice(supplierTotal) {
  const supplier = money(supplierTotal);
  let markup = 0;

  if (supplier < 100) markup = 5;
  else if (supplier < 300) markup = 10;
  else if (supplier < 700) markup = 15;
  else markup = Math.max(35, supplier * 0.05);

  const processing = money(supplier * 0.029);
  const customerTotal = money(supplier + processing + markup);

  return {
    supplier_total: supplier,
    processing_buffer: processing,
    platform_markup: money(markup),
    customer_total: customerTotal,
    estimated_gross_profit: money(markup),
    pricing_model: "merchant_markup_v1",
  };
}

function readLedger() {
  if (!fs.existsSync(LEDGER_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveLedger(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2), "utf8");
}

function readJson(filename) {
  const file = path.join(DATA_DIR, filename);
  if (!fs.existsSync(file)) {
    console.log(`Missing file: ${filename}`);
    return null;
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    console.log(`Reading ${filename}: ${raw.length} bytes`);
    return JSON.parse(raw);
  } catch (err) {
    console.log(`Failed reading ${filename}: ${err.message}`);
    return null;
  }
}

function extractArray(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.hotels)) return json.hotels;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.items)) return json.items;
  if (json.data && Array.isArray(json.data.hotels)) return json.data.hotels;
  if (json.catalog && Array.isArray(json.catalog.hotels)) return json.catalog.hotels;

  for (const value of Object.values(json)) {
    if (Array.isArray(value)) return value;
  }

  return [];
}

function loadArray(filename) {
  const arr = extractArray(readJson(filename));
  console.log(`${filename}: ${arr.length} records`);
  return arr;
}

function firstRate(raw) {
  const rates = [];

  if (Array.isArray(raw.rates)) rates.push(...raw.rates);
  if (raw.rate) rates.push(raw.rate);
  if (raw.first_rate) rates.push(raw.first_rate);

  if (Array.isArray(raw.rooms)) {
    for (const room of raw.rooms) {
      if (Array.isArray(room.rates)) {
        for (const r of room.rates) {
          rates.push({
            ...r,
            room_name: pick(room, ["name", "roomName", "room_name"]) || pick(r, ["room_name", "roomName"]),
          });
        }
      }
    }
  }

  return rates[0] || raw;
}

function makeFirstRate(rate, fallbackCurrency = "GBP") {
  const supplierAmount = num(
    pick(rate, ["selling_rate", "sellingRate", "net", "amount", "price", "total", "totalNet"])
  );

  const currency = clean(
    pick(rate, ["currency", "payment_currency", "paymentCurrency"]) || fallbackCurrency || "GBP"
  ).toUpperCase();

  const price = calculateMerchantPrice(supplierAmount);

  return {
    rate_key: clean(pick(rate, ["rate_key", "rateKey", "key", "id"])),
    amount: price.customer_total,
    selling_rate: price.customer_total,
    customer_amount: price.customer_total,
    customer_total: price.customer_total,
    supplier_amount: supplierAmount,
    supplier_total: price.supplier_total,
    processing_buffer: price.processing_buffer,
    platform_markup: price.platform_markup,
    estimated_gross_profit: price.estimated_gross_profit,
    pricing_model: price.pricing_model,
    currency,
    room_name: clean(pick(rate, ["room_name", "roomName", "room", "name"])) || "Selected room",
    board_name: clean(pick(rate, ["board_name", "boardName", "board", "mealPlan"])) || "Room only",
    payment_type: clean(pick(rate, ["payment_type", "paymentType"])) || "Stripe secure payment",
    cancellation_policies: Array.isArray(rate.cancellation_policies)
      ? rate.cancellation_policies
      : Array.isArray(rate.cancellationPolicies)
        ? rate.cancellationPolicies
        : [],
    display_note: "Final payable hotel price",
  };
}

function buildImageMap() {
  if (IMAGE_MAP) return IMAGE_MAP;

  IMAGE_MAP = { byId: new Map(), byName: new Map() };

  const images = loadArray("hotel_images_live_backup.json");

  for (const img of images) {
    const id = clean(pick(img, ["hotel_code", "hotelCode", "hotel_id", "hotelId", "code", "id"]));
    const name = clean(pick(img, ["hotel_name", "hotelName", "name"]));
    const url = clean(pick(img, ["image_url", "imageUrl", "url", "image", "src", "main_image", "mainImage", "thumbnail"]));

    if (id && url.startsWith("http")) IMAGE_MAP.byId.set(id, url);
    if (name && url.startsWith("http")) IMAGE_MAP.byName.set(norm(name), url);
  }

  return IMAGE_MAP;
}

function normalizeRateHotel(raw, i) {
  const imageMap = buildImageMap();
  const rate = firstRate(raw);

  const hotelId =
    clean(pick(raw, ["hotel_code", "hotelCode", "hotel_id", "hotelId", "code", "id", "hotel"])) ||
    `rate-${i + 1}`;

  const destinationCode = clean(
    pick(raw, ["destination_code", "destinationCode", "city_code", "cityCode", "destination"])
  ).toUpperCase();

  const fallback = DESTINATION_FALLBACK[destinationCode] || {};

  const country = clean(pick(raw, ["country", "countryName", "country_name"]) || fallback.country || "");
  const city = clean(
    pick(raw, ["city", "cityName", "city_name", "destinationName", "destination_name"]) ||
      fallback.city ||
      destinationCode ||
      ""
  );

  const hotelName =
    clean(pick(raw, ["hotel_name", "hotelName", "name", "hotel", "property_name", "propertyName"])) ||
    `Hotel ${i + 1}`;

  const first_rate = makeFirstRate(rate, fallback.currency || "GBP");
  if (!first_rate.rate_key) first_rate.rate_key = `LOCAL-${hotelId}-${i}`;

  const imageUrl =
    clean(pick(raw, ["image_url", "imageUrl", "image", "main_image", "mainImage", "thumbnail"])) ||
    imageMap.byId.get(hotelId) ||
    imageMap.byName.get(norm(hotelName)) ||
    "";

  return {
    id: hotelId,
    hotel_id: hotelId,
    hotel_code: hotelId,
    hotel_name: hotelName,
    country,
    city,
    destination_code: destinationCode || city.toUpperCase(),
    area: clean(pick(raw, ["zoneName", "zone_name", "area", "neighbourhood", "neighborhood", "district"])),
    address: clean(pick(raw, ["address", "addressLine", "full_address", "fullAddress"])),
    rating: clean(pick(raw, ["categoryName", "category", "stars", "rating"])) || "Available",
    latitude: clean(pick(raw, ["latitude", "lat"])),
    longitude: clean(pick(raw, ["longitude", "lng", "lon"])),
    image_url: imageUrl.startsWith("http") ? imageUrl : "",
    has_verified_image: imageUrl.startsWith("http"),
    live_rate_ready: first_rate.supplier_amount > 0 && Boolean(first_rate.currency) && Boolean(first_rate.rate_key),
    first_rate,
    merchant_pricing_enabled: true,
    source: "cached_live_rate",
  };
}

function normalizeSupplierHotel(raw, i) {
  const imageMap = buildImageMap();

  const hotelId =
    clean(pick(raw, ["supplier_hotel_id", "hotel_code", "hotelCode", "hotel_id", "hotelId", "code", "id"])) ||
    `supplier-${i + 1}`;

  const destinationCode = clean(
    pick(raw, ["destination_code", "destinationCode", "city_code", "cityCode", "destination"])
  ).toUpperCase();

  const fallback = DESTINATION_FALLBACK[destinationCode] || {};

  const hotelName =
    clean(pick(raw, ["hotel_name", "hotelName", "name", "hotel", "property_name", "propertyName"])) ||
    `Hotel ${i + 1}`;

  const country = clean(pick(raw, ["country", "countryName", "country_name"]) || fallback.country || "");
  const city = clean(
    pick(raw, ["city", "cityName", "city_name", "destinationName", "destination_name"]) ||
      fallback.city ||
      destinationCode ||
      ""
  );

  const imageUrl =
    clean(pick(raw, ["image", "image_url", "imageUrl", "main_image", "mainImage", "thumbnail"])) ||
    imageMap.byId.get(hotelId) ||
    imageMap.byName.get(norm(hotelName)) ||
    "";

  return {
    id: hotelId,
    hotel_id: hotelId,
    hotel_code: hotelId,
    hotel_name: hotelName,
    country,
    city,
    destination_code: destinationCode || city.toUpperCase(),
    area: clean(pick(raw, ["zoneName", "zone_name", "area", "neighbourhood", "neighborhood", "district"])),
    address: clean(pick(raw, ["address", "addressLine", "full_address", "fullAddress"])),
    rating: clean(pick(raw, ["categoryName", "category", "stars", "rating"])) || "Available",
    latitude: clean(pick(raw, ["latitude", "lat"])),
    longitude: clean(pick(raw, ["longitude", "lng", "lon"])),
    image_url: imageUrl.startsWith("http") ? imageUrl : "",
    has_verified_image: imageUrl.startsWith("http"),
    live_rate_ready: false,
    first_rate: {
      rate_key: "",
      amount: 0,
      selling_rate: 0,
      customer_amount: 0,
      customer_total: 0,
      supplier_amount: 0,
      supplier_total: 0,
      currency: fallback.currency || "",
      room_name: "Live room rate required",
      board_name: "Live board details required",
      payment_type: "Reservation request",
      cancellation_policies: [],
    },
    merchant_pricing_enabled: true,
    source: "supplier_catalog",
  };
}

function buildHotels() {
  if (HOTEL_CACHE) return HOTEL_CACHE;

  const rateRecords = [
    ...loadArray("hotel_live_rates_seed.json"),
    ...loadArray("hotel_live_rates_london_seed.json"),
  ];

  const supplierRecords = loadArray("hotel_supplier_feed.json");

  const byId = new Map();

  for (let i = 0; i < supplierRecords.length; i++) {
    const h = normalizeSupplierHotel(supplierRecords[i], i);
    if (h.hotel_id && h.country && h.city) byId.set(String(h.hotel_id), h);
  }

  for (let i = 0; i < rateRecords.length; i++) {
    const h = normalizeRateHotel(rateRecords[i], i);
    if (h.hotel_id && h.country && h.city) byId.set(String(h.hotel_id), h);
  }

  HOTEL_CACHE = [...byId.values()];

  console.log(`Loaded hotels: ${HOTEL_CACHE.length}`);
  console.log(`Cached live-rate hotels: ${HOTEL_CACHE.filter((h) => h.live_rate_ready).length}`);
  console.log(`Image hotels: ${HOTEL_CACHE.filter((h) => h.has_verified_image).length}`);

  return HOTEL_CACHE;
}

function buildDestinations() {
  if (CATALOG_CACHE) return CATALOG_CACHE;

  const map = new Map();

  for (const h of buildHotels()) {
    if (!h.country || !h.city) continue;

    if (!map.has(h.country)) map.set(h.country, new Map());
    const cityMap = map.get(h.country);

    if (!cityMap.has(h.city)) {
      cityMap.set(h.city, {
        city: h.city,
        destination_code: h.destination_code,
        currency: h.first_rate.currency || "",
        live_hotels: 0,
        image_hotels: 0,
      });
    }

    const c = cityMap.get(h.city);
    if (h.live_rate_ready) c.live_hotels += 1;
    if (h.has_verified_image) c.image_hotels += 1;
    if (!c.currency && h.first_rate.currency) c.currency = h.first_rate.currency;
  }

  CATALOG_CACHE = [...map.entries()]
    .map(([country, cityMap]) => ({
      country,
      city_count: cityMap.size,
      cities: [...cityMap.values()].sort((a, b) => a.city.localeCompare(b.city)),
    }))
    .filter((x) => x.city_count > 0)
    .sort((a, b) => a.country.localeCompare(b.country));

  console.log(`Catalogue countries: ${CATALOG_CACHE.length}`);
  console.log(`Catalogue cities: ${CATALOG_CACHE.reduce((s, x) => s + x.city_count, 0)}`);

  return CATALOG_CACHE;
}

function hotelSearchText(h) {
  return norm([h.hotel_name, h.area, h.address, h.city, h.country, h.destination_code, h.rating].join(" "));
}

function scoreHotel(h, queryText) {
  const text = hotelSearchText(h);
  const hotelName = norm(h.hotel_name);
  const area = norm(h.area);
  const address = norm(h.address);
  const terms = searchTerms(queryText);

  let score = 0;

  if (h.live_rate_ready) score += 400;
  if (h.has_verified_image) score += 80;

  const fullQuery = norm(queryText);

  if (fullQuery && hotelName === fullQuery) score += 3000;
  if (fullQuery && hotelName.startsWith(fullQuery)) score += 2200;
  if (fullQuery && hotelName.includes(fullQuery)) score += 1600;
  if (fullQuery && area.includes(fullQuery)) score += 1100;
  if (fullQuery && address.includes(fullQuery)) score += 700;

  for (const term of terms) {
    if (hotelName.split(" ").includes(term)) score += 500;
    else if (hotelName.includes(term)) score += 350;

    if (area.split(" ").includes(term)) score += 450;
    else if (area.includes(term)) score += 300;

    if (address.includes(term)) score += 160;
    if (text.includes(term)) score += 80;
  }

  return score;
}

function basicCityMatch(h, country, city) {
  if (country && norm(h.country) !== norm(country)) return false;
  if (city && norm(h.city) !== norm(city) && norm(h.destination_code) !== norm(city)) return false;
  return true;
}

function findBestHotels(country, city, area, keyword, limit) {
  const queryText = `${area} ${keyword}`.trim();
  const terms = searchTerms(queryText);
  const cityHotels = buildHotels().filter((h) => basicCityMatch(h, country, city));

  if (!terms.length) {
    return cityHotels
      .map((hotel) => ({ hotel, score: scoreHotel(hotel, "") }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.hotel.hotel_name.localeCompare(b.hotel.hotel_name);
      })
      .slice(0, limit)
      .map((x) => x.hotel);
  }

  const scored = cityHotels
    .map((hotel) => {
      const text = hotelSearchText(hotel);
      const score = scoreHotel(hotel, queryText);
      const matchedTerms = terms.filter((term) => text.includes(term)).length;

      return {
        hotel,
        score: score + matchedTerms * 120,
        matchedTerms,
      };
    })
    .filter((x) => x.matchedTerms > 0 || x.score > 500)
    .sort((a, b) => {
      if (b.matchedTerms !== a.matchedTerms) return b.matchedTerms - a.matchedTerms;
      if (b.score !== a.score) return b.score - a.score;
      return a.hotel.hotel_name.localeCompare(b.hotel.hotel_name);
    });

  if (scored.length > 0) return scored.slice(0, limit).map((x) => x.hotel);

  return cityHotels
    .map((hotel) => ({ hotel, score: scoreHotel(hotel, "") }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.hotel.hotel_name.localeCompare(b.hotel.hotel_name);
    })
    .slice(0, limit)
    .map((x) => x.hotel);
}

function hotelbedsConfigured() {
  return Boolean(HOTELBEDS_API_KEY && HOTELBEDS_SECRET && HOTELBEDS_BASE_URL);
}

function hotelbedsHeaders() {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash("sha256")
    .update(`${HOTELBEDS_API_KEY}${HOTELBEDS_SECRET}${timestamp}`)
    .digest("hex");

  return {
    "Api-key": HOTELBEDS_API_KEY,
    "X-Signature": signature,
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip",
  };
}

function rateCacheKey(hotelId, checkin, checkout, guests, rooms) {
  return `${hotelId}|${checkin}|${checkout}|${guests}|${rooms}`;
}

function occupantsFromGuests(guests, rooms) {
  const roomCount = Math.max(1, Number(rooms || 1));
  const guestCount = Math.max(1, Number(guests || 1));
  const baseAdults = Math.max(1, Math.floor(guestCount / roomCount));
  const extra = guestCount - baseAdults * roomCount;

  const occupancies = [];

  for (let i = 0; i < roomCount; i++) {
    occupancies.push({
      rooms: 1,
      adults: baseAdults + (i < extra ? 1 : 0),
      children: 0,
    });
  }

  return occupancies;
}

async function hotelbedsAvailabilityForHotels(hotels, checkin, checkout, guests, rooms) {
  if (!hotelbedsConfigured()) return new Map();

  const ids = [...new Set(hotels.map((h) => Number(h.hotel_id)).filter((x) => Number.isFinite(x) && x > 0))].slice(0, 40);
  if (!ids.length) return new Map();

  const cached = new Map();
  const missing = [];

  for (const id of ids) {
    const key = rateCacheKey(id, checkin, checkout, guests, rooms);
    const hit = liveRateMemory.get(key);

    if (hit && Date.now() - hit.savedAt < 15 * 60 * 1000) cached.set(String(id), hit.hotel);
    else missing.push(id);
  }

  if (!missing.length) return cached;

  const body = {
    stay: { checkIn: checkin, checkOut: checkout },
    occupancies: occupantsFromGuests(guests, rooms),
    hotels: { hotel: missing },
  };

  try {
    const response = await fetch(`${HOTELBEDS_BASE_URL.replace(/\/$/, "")}/hotels`, {
      method: "POST",
      headers: hotelbedsHeaders(),
      body: JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      console.log(`Hotelbeds availability failed ${response.status}: ${text.slice(0, 500)}`);
      return cached;
    }

    const data = JSON.parse(text);
    const returnedHotels = data?.hotels?.hotels || data?.hotels || [];
    const result = new Map(cached);

    for (const hb of returnedHotels) {
      const hotelId = clean(hb.code || hb.hotelCode || hb.hotel_code || hb.hotel_id || hb.id);
      const room = Array.isArray(hb.rooms) ? hb.rooms[0] : null;
      const rate = room && Array.isArray(room.rates) ? room.rates[0] : null;
      if (!hotelId || !rate) continue;

      const supplierAmount = num(rate.sellingRate || rate.net || rate.amount);
      const price = calculateMerchantPrice(supplierAmount);

      const first_rate = {
        rate_key: clean(rate.rateKey || rate.rate_key),
        amount: price.customer_total,
        selling_rate: price.customer_total,
        customer_amount: price.customer_total,
        customer_total: price.customer_total,
        supplier_amount: supplierAmount,
        supplier_total: price.supplier_total,
        processing_buffer: price.processing_buffer,
        platform_markup: price.platform_markup,
        estimated_gross_profit: price.estimated_gross_profit,
        pricing_model: price.pricing_model,
        currency: clean(hb.currency || rate.currency || data?.hotels?.currency || "GBP").toUpperCase(),
        room_name: clean(room.name || room.roomName || rate.roomName || "Selected room"),
        board_name: clean(rate.boardName || rate.board_name || rate.boardCode || "Room only"),
        payment_type: clean(rate.paymentType || rate.payment_type || "Stripe secure payment"),
        cancellation_policies: Array.isArray(rate.cancellationPolicies) ? rate.cancellationPolicies : [],
        display_note: "Final payable hotel price",
      };

      if (!first_rate.rate_key || !first_rate.amount) continue;

      const update = {
        hotel_id: hotelId,
        live_rate_ready: true,
        first_rate,
      };

      const key = rateCacheKey(hotelId, checkin, checkout, guests, rooms);
      liveRateMemory.set(key, { savedAt: Date.now(), hotel: update });
      result.set(String(hotelId), update);
    }

    return result;
  } catch (err) {
    console.log(`Hotelbeds availability error: ${err.message}`);
    return cached;
  }
}

function mergeLiveRate(hotel, live) {
  if (!live) return hotel;

  return {
    ...hotel,
    live_rate_ready: true,
    first_rate: live.first_rate,
    merchant_pricing_enabled: true,
    source: "hotelbeds_live",
  };
}

async function googleTextSearch(query) {
  if (!GOOGLE_MAPS_API_KEY) return [];

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.googleMapsUri,places.rating,places.currentOpeningHours",
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 5,
      }),
    });

    const data = await response.json();

    return Array.isArray(data.places)
      ? data.places.map((p) => ({
          name: clean(p.displayName?.text),
          address: clean(p.formattedAddress),
          phone: clean(p.internationalPhoneNumber),
          maps: clean(p.googleMapsUri),
          rating: p.rating || "",
          open_now:
            p.currentOpeningHours?.openNow === true
              ? "Open now"
              : p.currentOpeningHours?.openNow === false
                ? "Closed now"
                : "",
        }))
      : [];
  } catch (err) {
    console.log(`Google Places error: ${err.message}`);
    return [];
  }
}

async function buildGuide(destination, country) {
  const lowerCountry = norm(country);
  const emergency = EMERGENCY_NUMBERS[lowerCountry] || { emergency: "112" };

  const [hospitals, police, pharmacies, restaurants, airports, stations, attractions, museums, taxis] =
    await Promise.all([
      googleTextSearch(`hospital near ${destination}`),
      googleTextSearch(`police station near ${destination}`),
      googleTextSearch(`pharmacy near ${destination}`),
      googleTextSearch(`restaurants near ${destination}`),
      googleTextSearch(`airport near ${destination}`),
      googleTextSearch(`train station near ${destination}`),
      googleTextSearch(`tourist attractions near ${destination}`),
      googleTextSearch(`museum near ${destination}`),
      googleTextSearch(`taxi service near ${destination}`),
    ]);

  return {
    destination,
    emergency,
    hospitals,
    police,
    pharmacies,
    restaurants,
    airports,
    stations,
    attractions,
    museums,
    taxis,
  };
}

app.get("/", (req, res) => {
  const countries = buildDestinations();
  const hotels = buildHotels();

  res.json({
    ok: true,
    service: "MySpace Hotel reservation service",
    pricing: "merchant_markup_enabled",
    fast_search: "forgiving_area_keyword_enabled",
    travel_guide: Boolean(GOOGLE_MAPS_API_KEY),
    hotels: hotels.length,
    cached_live_hotels: hotels.filter((h) => h.live_rate_ready).length,
    image_hotels: hotels.filter((h) => h.has_verified_image).length,
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.city_count, 0),
    stripe: Boolean(stripe),
    stripe_webhook: Boolean(STRIPE_WEBHOOK_SECRET),
    hotelbeds_live_enabled: hotelbedsConfigured(),
  });
});

app.get("/health", (req, res) => {
  const countries = buildDestinations();
  const hotels = buildHotels();

  res.json({
    ok: true,
    pricing: "merchant_markup_enabled",
    fast_search: "forgiving_area_keyword_enabled",
    travel_guide: Boolean(GOOGLE_MAPS_API_KEY),
    hotels: hotels.length,
    cached_live_hotels: hotels.filter((h) => h.live_rate_ready).length,
    image_hotels: hotels.filter((h) => h.has_verified_image).length,
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.city_count, 0),
    stripe: Boolean(stripe),
    stripe_webhook: Boolean(STRIPE_WEBHOOK_SECRET),
    hotelbeds_live_enabled: hotelbedsConfigured(),
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const countries = buildDestinations();

  res.json({
    ok: true,
    countries,
    total_countries: countries.length,
    total_cities: countries.reduce((s, x) => s + x.city_count, 0),
  });
});

app.get("/api/hotels/search", async (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city || req.query.destination_code);
  const area = clean(req.query.area);
  const keyword = clean(req.query.keyword);
  const checkin = clean(req.query.checkin) || new Date().toISOString().slice(0, 10);
  const checkout = clean(req.query.checkout) || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const guests = Number(req.query.guests || 2);
  const rooms = Number(req.query.rooms || 1);
  const limit = area || keyword ? 30 : 40;

  const matching = findBestHotels(country, city, area, keyword, limit);
  const liveUpdates = await hotelbedsAvailabilityForHotels(matching, checkin, checkout, guests, rooms);

  const hotels = matching
    .map((h) => mergeLiveRate(h, liveUpdates.get(String(h.hotel_id))))
    .sort((a, b) => {
      const bs = scoreHotel(b, `${area} ${keyword}`);
      const as = scoreHotel(a, `${area} ${keyword}`);
      if (bs !== as) return bs - as;
      return a.hotel_name.localeCompare(b.hotel_name);
    });

  res.json({
    ok: true,
    count: hotels.length,
    hotels,
    country,
    city,
    area,
    keyword,
    search_mode: "forgiving_area_keyword_ranked",
    hotelbeds_live_checked: hotelbedsConfigured(),
    pricing: "merchant_markup_enabled",
  });
});

app.get("/api/travel-guide/live", async (req, res) => {
  try {
    const country = clean(req.query.country);
    const city = clean(req.query.city);
    const area = clean(req.query.area);

    const destination = [area, city, country].filter(Boolean).join(", ");

    if (!destination) {
      return res.status(400).json({
        ok: false,
        message: "Destination required",
      });
    }

    const guide = await buildGuide(destination, country);

    res.json({
      ok: true,
      guide,
    });
  } catch (err) {
    console.log(`Guide error: ${err.message}`);
    res.status(500).json({ ok: false, message: "Guide unavailable" });
  }
});

app.get("/api/currency/convert", (req, res) => {
  const amount = num(req.query.amount);
  const from = clean(req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to || "USD").toUpperCase();

  if (!amount || !FX[from] || !FX[to]) {
    return res.json({ ok: false, message: "Conversion unavailable." });
  }

  const converted = (amount / FX[from]) * FX[to];

  res.json({
    ok: true,
    amount,
    from,
    to,
    converted: Number(converted.toFixed(2)),
  });
});

app.get("/image-proxy", (req, res) => {
  const url = clean(req.query.url);
  if (!url.startsWith("http://") && !url.startsWith("https://")) return res.status(400).send("Invalid image URL");
  res.redirect(url);
});

app.get("/api/ledger", (req, res) => {
  const ledger = readLedger();

  const totals = ledger.reduce(
    (acc, row) => {
      acc.customer_total += num(row.customer_total);
      acc.supplier_total += num(row.supplier_total);
      acc.platform_profit += num(row.platform_markup);
      return acc;
    },
    { customer_total: 0, supplier_total: 0, platform_profit: 0 }
  );

  res.json({
    ok: true,
    bookings: ledger.length,
    totals: {
      customer_total: money(totals.customer_total),
      supplier_total: money(totals.supplier_total),
      platform_profit: money(totals.platform_profit),
    },
    ledger,
  });
});

app.post("/reservation-request", async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({ ok: false, message: "Stripe unavailable" });
    }

    const body = req.body || {};
    const supplierTotal = money(body.supplier_total || body.supplier_amount || body.amount || 0);

    if (!supplierTotal) {
      return res.status(400).json({ ok: false, message: "Supplier amount missing." });
    }

    const pricing = calculateMerchantPrice(supplierTotal);
    const reservation_code = makeCode();

    const booking = {
      reservation_code,
      created_at: new Date().toISOString(),
      status: "awaiting_payment",
      payment_confirmed: false,
      hotel_id: clean(body.hotel_id),
      hotel_name: clean(body.hotel_name),
      destination: clean(body.destination),
      checkin: clean(body.checkin),
      checkout: clean(body.checkout),
      guests: Number(body.guests || 1),
      rooms: Number(body.rooms || 1),
      customer_name: clean(body.customer_name),
      customer_email: clean(body.customer_email),
      customer_phone: clean(body.customer_phone),
      note: clean(body.note),
      rate_key: clean(body.rate_key),
      supplier_total: pricing.supplier_total,
      processing_buffer: pricing.processing_buffer,
      platform_markup: pricing.platform_markup,
      customer_total: pricing.customer_total,
      estimated_gross_profit: pricing.estimated_gross_profit,
      currency: clean(body.currency || "GBP").toUpperCase(),
      pricing_model: pricing.pricing_model,
    };

    const ledger = readLedger();
    ledger.unshift(booking);
    saveLedger(ledger);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(reservation_code)}`,
      cancel_url: `${PUBLIC_FRONTEND_URL}`,
      customer_email: booking.customer_email || undefined,
      metadata: {
        reservation_code,
        pricing_model: pricing.pricing_model,
        supplier_total: String(pricing.supplier_total),
        customer_total: String(pricing.customer_total),
        platform_markup: String(pricing.platform_markup),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.currency.toLowerCase(),
            unit_amount: Math.round(pricing.customer_total * 100),
            product_data: {
              name: booking.hotel_name || "Hotel booking",
              description: "Final payable hotel price",
            },
          },
        },
      ],
    });

    return res.json({
      ok: true,
      reservation_code,
      payment_url: session.url,
      amount: pricing.customer_total,
      currency: booking.currency,
      pricing,
    });
  } catch (err) {
    console.log(`Reservation error: ${err.message}`);
    return res.status(500).json({ ok: false, message: "Reservation failed" });
  }
});

app.post("/reservation/:code/mark-paid", (req, res) => {
  const code = clean(req.params.code);
  const ledger = readLedger();
  const index = ledger.findIndex((x) => x.reservation_code === code);

  if (index >= 0) {
    ledger[index].status = "paid_page_returned";
    ledger[index].paid_page_returned_at = new Date().toISOString();
    saveLedger(ledger);
  }

  res.json({ ok: true, reservation_code: code });
});

app.listen(PORT, "0.0.0.0", () => {
  const countries = buildDestinations();
  const hotels = buildHotels();

  console.log(`MySpace Hotel backend running on port ${PORT}`);
  console.log(`Hotels: ${hotels.length}`);
  console.log(`Cached live-rate hotels: ${hotels.filter((h) => h.live_rate_ready).length}`);
  console.log(`Hotelbeds live enabled: ${hotelbedsConfigured()}`);
  console.log(`Hotelbeds availability endpoint: ${HOTELBEDS_BASE_URL.replace(/\/$/, "")}/hotels`);
  console.log(`Hotelbeds booking endpoint: ${HOTELBEDS_BASE_URL.replace(/\/$/, "")}/bookings`);
  console.log(`Image hotels: ${hotels.filter((h) => h.has_verified_image).length}`);
  console.log(`Countries: ${countries.length}`);
  console.log(`Cities: ${countries.reduce((s, x) => s + x.city_count, 0)}`);
  console.log(`Stripe enabled: ${Boolean(stripe)}`);
  console.log(`Stripe webhook enabled: ${Boolean(STRIPE_WEBHOOK_SECRET)}`);
  console.log(`Google Places enabled: ${Boolean(GOOGLE_MAPS_API_KEY)}`);
  console.log(`Merchant pricing: ENABLED`);
  console.log(`Fast search: FORGIVING AREA + KEYWORD ENABLED`);
  console.log(`Travel Guide API: ENABLED`);
  console.log(`Ledger file: ${LEDGER_FILE}`);
});