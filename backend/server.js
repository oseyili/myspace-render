const { attachRealOnlyRoutes } = require("./real-only-live-index");
﻿require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
attachRealOnlyRoutes(app);
const PORT = Number(process.env.PORT || 5050);

const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || "http://localhost:5173";
const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE || `http://127.0.0.1:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

let stripe = null;
try {
  if (STRIPE_SECRET_KEY) stripe = require("stripe")(STRIPE_SECRET_KEY);
} catch {
  stripe = null;
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "30mb" }));

const DATA_DIR = path.join(__dirname, "data");
const LEDGER_FILE = path.join(DATA_DIR, "booking_ledger.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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
};

function clean(v) {
  return String(v ?? "").trim();
}

function norm(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
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

function parseMaybeJson(v) {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (!s || (!s.startsWith("{") && !s.startsWith("["))) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

function readJson(file) {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

function extractArray(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  for (const key of ["hotels", "data", "results", "items", "rows", "countries", "destinations"]) {
    const value = parseMaybeJson(json[key]);
    if (Array.isArray(value)) return value;
  }

  for (const value of Object.values(json)) {
    const parsed = parseMaybeJson(value);
    if (Array.isArray(parsed)) return parsed;
  }

  return [];
}

function loadArray(file) {
  return extractArray(readJson(file));
}

function loadAllRows() {
  const rows = [];
  const files = fs.existsSync(DATA_DIR)
    ? fs.readdirSync(DATA_DIR).filter((f) => f.toLowerCase().endsWith(".json"))
    : [];

  for (const file of files) {
    if (file === "booking_ledger.json") continue;
    const loaded = loadArray(file);
    for (const row of loaded) rows.push(row);
  }

  return rows;
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
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2), "utf8");
}

function makeCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function markupPrice(supplierTotal) {
  const supplier = money(supplierTotal);
  let markup = 0;

  if (supplier < 100) markup = 8;
  else if (supplier < 300) markup = 15;
  else if (supplier < 700) markup = 25;
  else markup = Math.max(35, supplier * 0.05);

  return {
    supplier_total: supplier,
    platform_markup: money(markup),
    customer_total: money(supplier + markup),
  };
}

function hotelbedsDirectUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const cleaned = raw
    .replace(/^\/+/, "")
    .replace(/^giata\//i, "")
    .replace(/^bigger\//i, "")
    .replace(/^medium\//i, "")
    .replace(/^small\//i, "");

  return `https://photos.hotelbeds.com/giata/bigger/${cleaned}`;
}

function proxiedImageUrl(value) {
  const direct = hotelbedsDirectUrl(value);
  if (!direct) return "";
  return `${PUBLIC_API_BASE}/api/image?url=${encodeURIComponent(direct)}`;
}

function getHotelCode(raw) {
  const rawHotel = parseMaybeJson(raw.raw_hotel_json);
  const hotelObj = rawHotel && typeof rawHotel === "object" ? rawHotel : raw;

  return clean(
    pick(raw, ["hotel_code", "hotelCode", "hotel_id", "hotelId", "code", "id"]) ||
      pick(hotelObj, ["code", "hotelCode", "hotel_code", "id"])
  );
}

function findImagePath(raw) {
  const rawHotel = parseMaybeJson(raw.raw_hotel_json);
  const hotelObj = rawHotel && typeof rawHotel === "object" ? rawHotel : raw;

  const direct =
    pick(raw, ["image_url", "imageUrl", "main_image", "mainImage", "thumbnail", "photo", "picture"]) ||
    pick(hotelObj, ["image_url", "imageUrl", "main_image", "mainImage", "thumbnail", "photo", "picture"]);

  if (direct) return direct;

  const arrays = [
    raw.images,
    raw.photos,
    raw.pictures,
    hotelObj.images,
    hotelObj.photos,
    hotelObj.pictures,
  ];

  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;

    for (const item of arr) {
      const imagePath =
        typeof item === "string"
          ? item
          : pick(item, ["path", "url", "imageUrl", "image_url", "mainImage", "thumbnail"]);

      if (imagePath) return imagePath;
    }
  }

  return "";
}

function buildImageMap(rows) {
  const map = new Map();

  for (const row of rows) {
    const code = getHotelCode(row);
    const imagePath = findImagePath(row);

    if (code && imagePath && !map.has(code)) {
      map.set(code, imagePath);
    }
  }

  return map;
}

function firstRate(raw) {
  const rawRate = parseMaybeJson(raw.raw_rate_json);
  if (rawRate && typeof rawRate === "object") return rawRate;

  if (raw.rate && typeof raw.rate === "object") return raw.rate;
  if (Array.isArray(raw.rates) && raw.rates[0]) return raw.rates[0];

  const rawRoom = parseMaybeJson(raw.raw_room_json);
  if (rawRoom?.rates?.[0]) return rawRoom.rates[0];

  const rawHotel = parseMaybeJson(raw.raw_hotel_json);
  if (rawHotel?.rooms?.[0]?.rates?.[0]) return rawHotel.rooms[0].rates[0];

  if (Array.isArray(raw.rooms)) {
    for (const room of raw.rooms) {
      if (Array.isArray(room.rates) && room.rates[0]) return room.rates[0];
    }
  }

  return raw;
}

function destinationFromRow(raw) {
  const rawHotel = parseMaybeJson(raw.raw_hotel_json);
  const hotelObj = rawHotel && typeof rawHotel === "object" ? rawHotel : raw;

  const destinationCode = clean(
    pick(raw, ["destination_code", "destinationCode", "city_code", "cityCode"]) ||
      pick(hotelObj, ["destinationCode", "destination_code"])
  ).toUpperCase();

  const fallback = DESTINATION_FALLBACK[destinationCode] || {};

  const country = clean(
    pick(raw, ["country", "countryName", "country_name"]) ||
      pick(hotelObj, ["country", "countryName", "country_name"]) ||
      fallback.country
  );

  const city = clean(
    pick(raw, ["city", "cityName", "city_name", "destination_name", "destinationName"]) ||
      pick(hotelObj, ["city", "cityName", "city_name", "destinationName", "destination_name"]) ||
      fallback.city
  );

  if (!country || !city) return null;
  return { country, city, destination_code: destinationCode || city };
}

function makeRate(raw) {
  const rate = firstRate(raw);
  if (!rate || typeof rate !== "object") return null;

  const amount = num(
    pick(rate, ["selling_rate", "sellingRate", "net", "amount", "price", "total"]) ||
      pick(raw, ["selling_rate", "sellingRate", "net", "amount", "price", "total"])
  );

  const currency = clean(pick(rate, ["currency"]) || pick(raw, ["currency"]) || "GBP").toUpperCase();
  const rateKey = clean(pick(rate, ["rate_key", "rateKey", "key"]) || pick(raw, ["rate_key", "rateKey", "key"]));

  if (!amount || amount <= 0 || !currency || !rateKey) return null;

  const pricing = markupPrice(amount);

  return {
    rate_key: rateKey,
    supplier_total: pricing.supplier_total,
    customer_total: pricing.customer_total,
    platform_markup: pricing.platform_markup,
    amount: pricing.customer_total,
    currency,
    room_name: clean(pick(rate, ["room_name", "roomName", "room", "name"]) || pick(raw, ["room_name", "roomName", "room", "name"])) || "Selected room",
    board_name: clean(pick(rate, ["board_name", "boardName", "board"]) || pick(raw, ["board_name", "boardName", "board"])) || "Room only",
    cancellation_policies: Array.isArray(rate.cancellationPolicies) ? rate.cancellationPolicies : [],
  };
}

const ALL_ROWS = loadAllRows();
const IMAGE_BY_CODE = buildImageMap(ALL_ROWS);

function normalizeHotel(raw, index) {
  const dest = destinationFromRow(raw);
  if (!dest) return null;

  const rate = makeRate(raw);
  if (!rate) return null;

  const rawHotel = parseMaybeJson(raw.raw_hotel_json);
  const hotelObj = rawHotel && typeof rawHotel === "object" ? rawHotel : raw;

  const hotelId = getHotelCode(raw) || `hotel-${index + 1}`;
  const ownImage = findImagePath(raw);
  const linkedImage = IMAGE_BY_CODE.get(hotelId) || "";
  const finalImage = ownImage || linkedImage;

  return {
    hotel_id: hotelId,
    hotel_code: hotelId,
    hotel_name: clean(pick(raw, ["hotel_name", "hotelName", "name"]) || pick(hotelObj, ["name", "hotelName"])) || `Hotel ${index + 1}`,
    country: dest.country,
    city: dest.city,
    destination_code: dest.destination_code,
    area: clean(pick(raw, ["area", "zoneName", "zone_name", "district", "neighbourhood"]) || pick(hotelObj, ["zoneName", "zone_name"])),
    address: clean(pick(raw, ["address", "street", "streetName"])),
    latitude: clean(pick(raw, ["latitude", "lat"]) || pick(hotelObj, ["latitude", "lat"])),
    longitude: clean(pick(raw, ["longitude", "lng"]) || pick(hotelObj, ["longitude", "lng"])),
    rating: clean(pick(raw, ["rating", "stars", "categoryName", "category_name"]) || pick(hotelObj, ["categoryName", "category_name"])) || "Available",
    image_url: proxiedImageUrl(finalImage),
    direct_image_url: hotelbedsDirectUrl(finalImage),
    raw_hotel_json: typeof raw.raw_hotel_json === "string" ? raw.raw_hotel_json : "",
    first_rate: rate,
    live_rate_ready: true,
  };
}

const HOTEL_CACHE = ALL_ROWS.map(normalizeHotel).filter(Boolean);
const LIVE_HOTELS = HOTEL_CACHE.filter((h) => h.first_rate?.rate_key && h.first_rate?.amount > 0);

function buildDestinations() {
  const map = new Map();

  for (const row of ALL_ROWS) {
    const dest = destinationFromRow(row);
    if (!dest) continue;

    if (!map.has(dest.country)) map.set(dest.country, new Map());
    const cityMap = map.get(dest.country);

    if (!cityMap.has(dest.city)) {
      cityMap.set(dest.city, {
        city: dest.city,
        destination_code: dest.destination_code,
        live_hotels: 0,
      });
    }
  }

  for (const hotel of LIVE_HOTELS) {
    if (!map.has(hotel.country)) map.set(hotel.country, new Map());
    const cityMap = map.get(hotel.country);

    if (!cityMap.has(hotel.city)) {
      cityMap.set(hotel.city, {
        city: hotel.city,
        destination_code: hotel.destination_code,
        live_hotels: 0,
      });
    }

    cityMap.get(hotel.city).live_hotels += 1;
  }

  return [...map.entries()]
    .map(([country, cityMap]) => ({
      country,
      city_count: cityMap.size,
      cities: [...cityMap.values()].sort((a, b) => {
        if ((b.live_hotels || 0) !== (a.live_hotels || 0)) return (b.live_hotels || 0) - (a.live_hotels || 0);
        return a.city.localeCompare(b.city);
      }),
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

const CATALOG_CACHE = buildDestinations();

function findHotels(country, city, area, keyword) {
  const query = `${area || ""} ${keyword || ""}`.trim();

  return LIVE_HOTELS
    .filter((h) => !country || norm(h.country) === norm(country))
    .filter((h) => !city || norm(h.city) === norm(city))
    .filter((h) => {
      if (!query) return true;
      const text = norm([h.hotel_name, h.area, h.address, h.city, h.country].join(" "));
      return query.split(/\s+/).some((part) => text.includes(norm(part)));
    })
    .slice(0, 80);
}

function firstDefault() {
  const preferredCountry = CATALOG_CACHE.find((c) => norm(c.country) === "united kingdom") || CATALOG_CACHE[0] || null;
  const preferredCity =
    preferredCountry?.cities?.find((c) => c.live_hotels > 0 && norm(c.city) === "london") ||
    preferredCountry?.cities?.find((c) => c.live_hotels > 0) ||
    preferredCountry?.cities?.[0] ||
    null;

  return {
    country: preferredCountry?.country || "",
    city: preferredCity?.city || "",
  };
}

function maps(query) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function destinationName(country, city, area) {
  return [area, city, country].filter(Boolean).join(", ");
}

function guidePlace(destination, name, type, purpose) {
  return { name, type, purpose, maps: maps(`${name} near ${destination}`) };
}

async function fetchImageBuffer(url) {
  const original = clean(url);
  if (!/^https?:\/\//i.test(original)) return null;

  const candidates = [original];

  if (original.includes("photos.hotelbeds.com/giata/")) {
    const after = original.split("photos.hotelbeds.com/giata/")[1] || "";
    const stripped = after.replace(/^\/+/, "").replace(/^bigger\//i, "").replace(/^medium\//i, "").replace(/^small\//i, "");

    candidates.push(`https://photos.hotelbeds.com/giata/bigger/${stripped}`);
    candidates.push(`https://photos.hotelbeds.com/giata/medium/${stripped}`);
    candidates.push(`https://photos.hotelbeds.com/giata/small/${stripped}`);
    candidates.push(`https://photos.hotelbeds.com/giata/${stripped}`);
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate, {
        headers: {
          "User-Agent": "Mozilla/5.0 MySpaceHotel",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) continue;

      return { buffer, contentType: contentType || "image/jpeg" };
    } catch {}
  }

  return null;
}

function findLiveHotelByReservationBody(body) {
  const hotelId = clean(body.hotel_id);
  const rateKey = clean(body.rate_key);
  return LIVE_HOTELS.find((hotel) => clean(hotel.hotel_id) === hotelId && clean(hotel.first_rate?.rate_key) === rateKey) || null;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    hotels: LIVE_HOTELS.length,
    countries: CATALOG_CACHE.length,
    live_hotels: LIVE_HOTELS.length,
    hotels_with_images: LIVE_HOTELS.filter((h) => h.image_url).length,
  });
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/api/bootstrap", (req, res) => {
  const defaults = firstDefault();

  res.json({
    ok: true,
    countries: CATALOG_CACHE,
    default_country: defaults.country,
    default_city: defaults.city,
    hotels: findHotels(defaults.country, defaults.city, "", ""),
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  res.json({ ok: true, countries: CATALOG_CACHE });
});

app.get("/api/hotels/search", (req, res) => {
  res.json({
    ok: true,
    hotels: findHotels(clean(req.query.country), clean(req.query.city), clean(req.query.area), clean(req.query.keyword)),
  });
});

app.get("/api/image", async (req, res) => {
  try {
    const image = await fetchImageBuffer(req.query.url);

    if (!image) return res.status(404).send("Image unavailable");

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(image.buffer);
  } catch {
    res.status(404).send("Image unavailable");
  }
});

app.get("/api/travel-guide/live", async (req, res) => {
  const country = clean(req.query.country || "United Kingdom");
  const city = clean(req.query.city || "London");
  const area = clean(req.query.area);
  const destination = destinationName(country, city, area);
  const hotels = findHotels(country, city, area, "").slice(0, 8);

  res.json({
    ok: true,
    guide: {
      destination,
      hotels: hotels.map((h) => ({
        name: h.hotel_name,
        type: "Stay nearby",
        purpose: [h.area, h.address].filter(Boolean).join(", ") || `${h.city}, ${h.country}`,
        address: [h.area, h.address].filter(Boolean).join(", "),
        rating: h.rating,
        maps: h.latitude && h.longitude ? `https://www.google.com/maps?q=${h.latitude},${h.longitude}` : maps(`${h.hotel_name} ${h.city} ${h.country}`),
      })),
      emergency: {
        emergency: "112",
        medical: "Use the emergency number for urgent medical support",
        police: "Use the emergency number for immediate safety support",
        fire: "Use the emergency number for fire or rescue",
      },
      hospitals: [guidePlace(destination, "Nearest emergency hospital", "Medical", "Urgent medical care close to your stay area")],
      police: [guidePlace(destination, "Nearest police station", "Safety", "Support for safety concerns, theft reports or lost documents")],
      pharmacies: [guidePlace(destination, "Nearby pharmacy", "Medicine", "Medicine, health essentials and prescriptions")],
      restaurants: [guidePlace(destination, "Best restaurants nearby", "Food", "Good options for arrival night and local dining")],
      transport: [guidePlace(destination, "Nearest train or metro station", "Transport", "Public transport access for moving around the city")],
      attractions: [guidePlace(destination, "Top attractions nearby", "Explore", "Popular places close to your stay area")],
      taxis: [guidePlace(destination, "Taxi ranks nearby", "Taxi", "Useful when you need a quick local pickup")],
    },
  });
});

app.get("/api/currency/convert", (req, res) => {
  const amount = num(req.query.amount);
  const from = clean(req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to || "USD").toUpperCase();

  if (!amount || !FX[from] || !FX[to]) return res.json({ ok: false });

  res.json({ ok: true, converted: money((amount / FX[from]) * FX[to]) });
});

app.post("/reservation-request", async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ ok: false, message: "Secure payment unavailable." });

    const body = req.body || {};
    const liveHotel = findLiveHotelByReservationBody(body);

    if (!liveHotel) {
      return res.status(400).json({
        ok: false,
        message: "This stay is no longer available. Please refresh and choose another available stay.",
      });
    }

    const rooms = Math.max(1, Number(body.rooms || 1));
    const rate = liveHotel.first_rate;
    const customerTotal = money(rate.customer_total * rooms);
    const reservation_code = makeCode();

    const booking = {
      reservation_code,
      created_at: new Date().toISOString(),
      booking_status: "PENDING_PAYMENT",
      hotel_id: liveHotel.hotel_id,
      hotel_name: liveHotel.hotel_name,
      destination: destinationName(liveHotel.country, liveHotel.city, liveHotel.area),
      checkin: clean(body.checkin),
      checkout: clean(body.checkout),
      guests: Number(body.guests || 1),
      rooms,
      customer_name: clean(body.customer_name),
      customer_email: clean(body.customer_email),
      customer_phone: clean(body.customer_phone),
      note: clean(body.note),
      rate_key: rate.rate_key,
      supplier_total: money(rate.supplier_total * rooms),
      customer_total: customerTotal,
      amount: customerTotal,
      currency: rate.currency,
    };

    const ledger = readLedger();
    ledger.unshift(booking);
    saveLedger(ledger);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(reservation_code)}`,
      cancel_url: PUBLIC_FRONTEND_URL,
      customer_email: booking.customer_email || undefined,
      metadata: { reservation_code, rooms: String(rooms), customer_total: String(customerTotal) },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.currency.toLowerCase(),
            unit_amount: Math.round(customerTotal * 100),
            product_data: { name: `${booking.hotel_name} - ${rooms} room${rooms === 1 ? "" : "s"}` },
          },
        },
      ],
    });

    booking.stripe_session_id = session.id;
    saveLedger(ledger);

    res.json({ ok: true, reservation_code, payment_url: session.url, customer_total: customerTotal });
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ ok: false, message: "Could not create secure checkout." });
  }
});

app.post("/reservation/:code/mark-paid", (req, res) => {
  const code = clean(req.params.code);
  const ledger = readLedger();
  const index = ledger.findIndex((x) => x.reservation_code === code);

  if (index >= 0) {
    ledger[index].payment_confirmed = true;
    ledger[index].booking_status = "PAYMENT_RECEIVED";
    saveLedger(ledger);
  }

  res.json({ ok: true, reservation_code: code });
});

app.get("/api/bookings", (req, res) => {
  res.json({ ok: true, bookings: readLedger() });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("==============================================");
  console.log("MYSPACE HOTEL BACKEND RUNNING");
  console.log("==============================================");
  console.log(`Port: ${PORT}`);
  console.log(`Destination countries loaded: ${CATALOG_CACHE.length}`);
  console.log(`Live hotels loaded: ${LIVE_HOTELS.length}`);
  console.log(`Live hotels with image URLs: ${LIVE_HOTELS.filter((h) => h.image_url).length}`);
  console.log("Image proxy: READY");
  console.log("==============================================");
  console.log("");
});