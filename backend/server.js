require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();
const PORT = Number(process.env.PORT || 5050);

const PUBLIC_FRONTEND_URL =
  process.env.PUBLIC_FRONTEND_URL ||
  process.env.PUBLIC_APP_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:5173";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

const HOTELBEDS_API_KEY = process.env.HOTELBEDS_API_KEY || "";
const HOTELBEDS_SECRET = process.env.HOTELBEDS_SECRET || "";
const HOTELBEDS_BASE_URL =
  process.env.HOTELBEDS_BASE_URL ||
  "https://api.hotelbeds.com/hotel-api/1.0";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || process.env.SMTP_USERNAME || "";
const SMTP_PASS = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";
const SMTP_FROM =
  process.env.SMTP_FROM ||
  process.env.RESEND_FROM ||
  process.env.RESERVATIONS_EMAIL ||
  "reservations@myspace-hotel.com";

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

let stripe = null;
try {
  if (STRIPE_SECRET_KEY) stripe = require("stripe")(STRIPE_SECRET_KEY);
} catch {
  stripe = null;
}

let transporter = null;
try {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
} catch {
  transporter = null;
}

const DATA_DIR = path.join(__dirname, "data");
const reservations = new Map();
const liveRateMemory = new Map();

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

function clean(v) {
  return String(v ?? "").trim();
}

function norm(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function num(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && clean(obj[k]) !== "") return obj[k];
  }
  return "";
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

function makeCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
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
  const amount = num(pick(rate, ["selling_rate", "sellingRate", "net", "amount", "price", "total", "totalNet"]));
  const currency = clean(pick(rate, ["currency", "payment_currency", "paymentCurrency"]) || fallbackCurrency || "GBP").toUpperCase();

  return {
    rate_key: clean(pick(rate, ["rate_key", "rateKey", "key", "id"])),
    amount,
    selling_rate: amount,
    currency,
    room_name: clean(pick(rate, ["room_name", "roomName", "room", "name"])) || "Selected room",
    board_name: clean(pick(rate, ["board_name", "boardName", "board", "mealPlan"])) || "Room only",
    payment_type: clean(pick(rate, ["payment_type", "paymentType"])) || "Stripe secure payment",
    cancellation_policies: Array.isArray(rate.cancellation_policies)
      ? rate.cancellation_policies
      : Array.isArray(rate.cancellationPolicies)
        ? rate.cancellationPolicies
        : [],
  };
}

let IMAGE_MAP = null;
let HOTEL_CACHE = null;
let CATALOG_CACHE = null;

function buildImageMap() {
  if (IMAGE_MAP) return IMAGE_MAP;

  IMAGE_MAP = {
    byId: new Map(),
    byName: new Map(),
  };

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

  const destinationCode = clean(pick(raw, ["destination_code", "destinationCode", "city_code", "cityCode", "destination"])).toUpperCase();
  const fallback = DESTINATION_FALLBACK[destinationCode] || {};

  const country = clean(pick(raw, ["country", "countryName", "country_name"]) || fallback.country || "");
  const city = clean(pick(raw, ["city", "cityName", "city_name", "destinationName", "destination_name"]) || fallback.city || destinationCode || "");

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
    live_rate_ready: first_rate.amount > 0 && Boolean(first_rate.currency) && Boolean(first_rate.rate_key),
    first_rate,
    source: "cached_live_rate",
  };
}

function normalizeSupplierHotel(raw, i) {
  const imageMap = buildImageMap();

  const hotelId =
    clean(pick(raw, ["supplier_hotel_id", "hotel_code", "hotelCode", "hotel_id", "hotelId", "code", "id"])) ||
    `supplier-${i + 1}`;

  const destinationCode = clean(pick(raw, ["destination_code", "destinationCode", "city_code", "cityCode", "destination"])).toUpperCase();
  const fallback = DESTINATION_FALLBACK[destinationCode] || {};

  const hotelName =
    clean(pick(raw, ["hotel_name", "hotelName", "name", "hotel", "property_name", "propertyName"])) ||
    `Hotel ${i + 1}`;

  const country = clean(pick(raw, ["country", "countryName", "country_name"]) || fallback.country || "");
  const city = clean(pick(raw, ["city", "cityName", "city_name", "destinationName", "destination_name"]) || fallback.city || destinationCode || "");

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
      currency: "",
      room_name: "Live room rate required",
      board_name: "Live board details required",
      payment_type: "Reservation request",
      cancellation_policies: [],
    },
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

function matchesHotel(h, country, city, area, keyword) {
  if (country && norm(h.country) !== norm(country)) return false;
  if (city && norm(h.city) !== norm(city) && norm(h.destination_code) !== norm(city)) return false;

  const text = norm([h.hotel_name, h.country, h.city, h.destination_code, h.area, h.address, h.rating].join(" "));

  if (area && !text.includes(norm(area))) return false;
  if (keyword && !text.includes(norm(keyword))) return false;

  return true;
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
    "Accept": "application/json",
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

  const ids = [...new Set(hotels.map((h) => Number(h.hotel_id)).filter((x) => Number.isFinite(x) && x > 0))].slice(0, 100);
  if (!ids.length) return new Map();

  const cached = new Map();
  const missing = [];

  for (const id of ids) {
    const key = rateCacheKey(id, checkin, checkout, guests, rooms);
    const hit = liveRateMemory.get(key);

    if (hit && Date.now() - hit.savedAt < 15 * 60 * 1000) {
      cached.set(String(id), hit.hotel);
    } else {
      missing.push(id);
    }
  }

  if (!missing.length) return cached;

  const body = {
    stay: {
      checkIn: checkin,
      checkOut: checkout,
    },
    occupancies: occupantsFromGuests(guests, rooms),
    hotels: {
      hotel: missing,
    },
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

      const first_rate = {
        rate_key: clean(rate.rateKey || rate.rate_key),
        amount: num(rate.sellingRate || rate.net || rate.amount),
        selling_rate: num(rate.sellingRate || rate.net || rate.amount),
        currency: clean(hb.currency || rate.currency || data?.hotels?.currency || "GBP").toUpperCase(),
        room_name: clean(room.name || room.roomName || rate.roomName || "Selected room"),
        board_name: clean(rate.boardName || rate.board_name || rate.boardCode || "Room only"),
        payment_type: clean(rate.paymentType || rate.payment_type || "Stripe secure payment"),
        cancellation_policies: Array.isArray(rate.cancellationPolicies) ? rate.cancellationPolicies : [],
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
    source: "hotelbeds_live",
  };
}

async function sendReservationEmail(body, reservationCode, paymentUrl) {
  if (!transporter || !clean(body.customer_email)) return false;

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: clean(body.customer_email),
      subject: `MySpace Hotel reservation ${reservationCode}`,
      html: `
        <h2>Reservation received</h2>
        <p><b>Reservation code:</b> ${reservationCode}</p>
        <p><b>Hotel:</b> ${clean(body.hotel_name)}</p>
        <p><b>Destination:</b> ${clean(body.destination)}</p>
        <p><b>Dates:</b> ${clean(body.checkin)} to ${clean(body.checkout)}</p>
        <p><b>Guests:</b> ${clean(body.guests)}</p>
        <p><b>Rooms:</b> ${clean(body.rooms)}</p>
        <p><b>Amount:</b> ${clean(body.currency)} ${clean(body.amount)}</p>
        ${
          paymentUrl
            ? `<p><a href="${paymentUrl}">Continue secure payment</a></p>`
            : `<p>Your reservation request was received. We will follow up with confirmed availability.</p>`
        }
      `,
    });

    return true;
  } catch (err) {
    console.log(`Email failed: ${err.message}`);
    return false;
  }
}

app.get("/", (req, res) => {
  const countries = buildDestinations();
  const hotels = buildHotels();

  res.json({
    ok: true,
    service: "MySpace Hotel reservation service",
    hotels: hotels.length,
    cached_live_hotels: hotels.filter((h) => h.live_rate_ready).length,
    hotelbeds_live_enabled: hotelbedsConfigured(),
    image_hotels: hotels.filter((h) => h.has_verified_image).length,
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.city_count, 0),
    stripe: Boolean(stripe),
    smtp: Boolean(transporter),
  });
});

app.get("/health", (req, res) => {
  const countries = buildDestinations();
  const hotels = buildHotels();

  res.json({
    ok: true,
    hotels: hotels.length,
    cached_live_hotels: hotels.filter((h) => h.live_rate_ready).length,
    hotelbeds_live_enabled: hotelbedsConfigured(),
    image_hotels: hotels.filter((h) => h.has_verified_image).length,
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.city_count, 0),
    stripe: Boolean(stripe),
    smtp: Boolean(transporter),
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
  const limit = Math.min(120, Math.max(1, Number(req.query.limit || 120)));

  const matching = buildHotels()
    .filter((h) => matchesHotel(h, country, city, area, keyword))
    .sort((a, b) => {
      if (a.live_rate_ready !== b.live_rate_ready) return a.live_rate_ready ? -1 : 1;
      if (a.has_verified_image !== b.has_verified_image) return a.has_verified_image ? -1 : 1;
      return a.hotel_name.localeCompare(b.hotel_name);
    })
    .slice(0, limit);

  const liveUpdates = await hotelbedsAvailabilityForHotels(matching, checkin, checkout, guests, rooms);

  const hotels = matching.map((h) => mergeLiveRate(h, liveUpdates.get(String(h.hotel_id))));

  res.json({
    ok: true,
    count: hotels.length,
    hotels,
    country,
    city,
    hotelbeds_live_checked: hotelbedsConfigured(),
  });
});

app.get("/api/hotels/selected-live-price-v2", async (req, res) => {
  const hotelId = clean(req.query.hotel_id || req.query.id);
  const checkin = clean(req.query.checkin) || new Date().toISOString().slice(0, 10);
  const checkout = clean(req.query.checkout) || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const guests = Number(req.query.guests || 2);
  const rooms = Number(req.query.rooms || 1);

  const hotel = buildHotels().find((h) => String(h.hotel_id) === String(hotelId));

  if (!hotel) {
    return res.json({
      ok: false,
      live_payment_ready: false,
      message: "Hotel not found.",
    });
  }

  const liveUpdates = await hotelbedsAvailabilityForHotels([hotel], checkin, checkout, guests, rooms);
  const live = liveUpdates.get(String(hotel.hotel_id));
  const finalHotel = mergeLiveRate(hotel, live);

  if (!finalHotel.live_rate_ready) {
    return res.json({
      ok: true,
      live_payment_ready: false,
      hotel_id: hotel.hotel_id,
      hotel_name: hotel.hotel_name,
      message: "Live rate is not available for this hotel right now.",
    });
  }

  res.json({
    ok: true,
    live_payment_ready: true,
    hotel_id: finalHotel.hotel_id,
    hotel_name: finalHotel.hotel_name,
    amount: finalHotel.first_rate.amount,
    currency: finalHotel.first_rate.currency,
    rate_key: finalHotel.first_rate.rate_key,
    room_name: finalHotel.first_rate.room_name,
    board_name: finalHotel.first_rate.board_name,
    payment_type: finalHotel.first_rate.payment_type,
    cancellation_policies: finalHotel.first_rate.cancellation_policies || [],
  });
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

app.post("/reservation-request", async (req, res) => {
  try {
    const body = req.body || {};
    const reservation_code = makeCode();
    const payAmount = num(body.amount);
    const currency = clean(body.currency).toLowerCase();

    reservations.set(reservation_code, {
      reservation_code,
      ...body,
      amount: payAmount,
      currency: currency.toUpperCase(),
      status: payAmount > 0 ? "ready_for_secure_payment" : "reservation_request",
      created_at: new Date().toISOString(),
    });

    let paymentUrl = "";

    if (stripe && payAmount > 0 && currency && clean(body.rate_key)) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(reservation_code)}`,
        cancel_url: `${PUBLIC_FRONTEND_URL}/?reservation=${encodeURIComponent(reservation_code)}&status=cancelled`,
        customer_email: clean(body.customer_email) || undefined,
        metadata: {
          reservation_code,
          hotel_id: clean(body.hotel_id),
          rate_key: clean(body.rate_key),
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Math.round(payAmount * 100),
              product_data: {
                name: clean(body.hotel_name).slice(0, 250) || "Hotel reservation",
                description: `${clean(body.checkin)} to ${clean(body.checkout)}`.slice(0, 250),
              },
            },
          },
        ],
      });

      paymentUrl = session.url || "";
    }

    const email_sent = await sendReservationEmail(body, reservation_code, paymentUrl);

    if (paymentUrl) {
      return res.json({ ok: true, reservation_code, payment_url: paymentUrl, email_sent });
    }

    res.json({
      ok: true,
      reservation_code,
      email_sent,
      message: "Reservation request received.",
    });
  } catch (err) {
    console.log(`Reservation failed: ${err.message}`);
    res.status(500).json({ ok: false, message: "Reservation request could not be completed." });
  }
});

app.post("/reservation/:code/mark-paid", (req, res) => {
  const code = clean(req.params.code);
  const existing = reservations.get(code);

  if (existing) {
    existing.status = "paid";
    existing.paid_at = new Date().toISOString();
    reservations.set(code, existing);
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
  console.log(`Image hotels: ${hotels.filter((h) => h.has_verified_image).length}`);
  console.log(`Countries: ${countries.length}`);
  console.log(`Cities: ${countries.reduce((s, x) => s + x.city_count, 0)}`);
  console.log(`Stripe enabled: ${Boolean(stripe)}`);
  console.log(`SMTP enabled: ${Boolean(transporter)}`);
});
