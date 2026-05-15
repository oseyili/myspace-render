require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5050);

const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || "https://www.myspace-hotel.com";
const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE || process.env.BACKEND_BASE_URL || "https://myspace-hotel-backend.onrender.com";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

let stripe = null;
try {
  if (STRIPE_SECRET_KEY) stripe = require("stripe")(STRIPE_SECRET_KEY);
} catch {
  stripe = null;
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

const DATA_DIR = path.join(__dirname, "data");
const LEDGER_FILE = path.join(DATA_DIR, "booking_ledger.json");
const REGISTRY_FILE = path.join(DATA_DIR, "master_hotel_registry.json.gz");
const DESTINATION_FILE = path.join(DATA_DIR, "destination_master.json.gz");
const RATE_CHUNK_DIR = path.join(DATA_DIR, "live-rate-cache");

let CATALOG_HOTELS = [];
let LIVE_HOTELS = [];
let COUNTRY_LIST = [];

function clean(v) {
  return String(v ?? "").trim();
}

function norm(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function num(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return Number(num(v).toFixed(2));
}

function readJsonGz(file) {
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
  } catch (e) {
    console.log("Could not read", file, e.message);
    return [];
  }
}

function hotelbedsDirectUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleaned = raw.replace(/^\/+/, "").replace(/^giata\//i, "").replace(/^bigger\//i, "").replace(/^medium\//i, "").replace(/^small\//i, "");
  return cleaned ? `https://photos.hotelbeds.com/giata/bigger/${cleaned}` : "";
}

function proxiedImageUrl(value) {
  const direct = hotelbedsDirectUrl(value);
  return direct ? `${PUBLIC_API_BASE}/api/image?url=${encodeURIComponent(direct)}` : "";
}

function loadCatalogHotels() {
  const rows = readJsonGz(REGISTRY_FILE);
  CATALOG_HOTELS = rows
    .map((x, i) => {
      const id = clean(x.canonical_hotel_id || x.supplier_hotel_id || x.hotel_id || `catalog-${i}`);
      const image = clean(x.image_url || x.direct_image_url || "");
      return {
        hotel_id: id,
        hotel_code: id,
        hotel_name: clean(x.hotel_name || x.name || `Hotel ${i + 1}`),
        country: clean(x.country),
        city: clean(x.city),
        area: "",
        address: clean(x.address),
        latitude: clean(x.latitude),
        longitude: clean(x.longitude),
        image_url: proxiedImageUrl(image),
        direct_image_url: hotelbedsDirectUrl(image),
        live_rate_ready: false,
        price_confirmation_required: true,
        first_rate: null,
      };
    })
    .filter((x) => x.country && x.city && x.hotel_name);
}

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && clean(obj[k]) !== "") return obj[k];
  return "";
}

function makeRate(raw) {
  const amount = num(pick(raw, ["customer_total", "selling_rate", "sellingRate", "net", "amount", "price", "total"]));
  const currency = clean(pick(raw, ["currency", "currency_code", "currencyCode"]) || "GBP").toUpperCase();
  const rateKey = clean(pick(raw, ["rate_key", "rateKey", "key", "id"]));

  if (!amount || !currency || !rateKey) return null;

  const commission = Number(process.env.PLATFORM_COMMISSION_PERCENT || "0.12");
  const markup = commission > 1 ? amount * (commission / 100) : amount * commission;
  const customerTotal = pick(raw, ["customer_total"]) ? amount : amount + markup;

  return {
    rate_key: rateKey,
    supplier_total: money(amount),
    customer_total: money(customerTotal),
    amount: money(customerTotal),
    currency,
    room_name: clean(pick(raw, ["room_name", "roomName", "room", "name"]) || "Selected room"),
    board_name: clean(pick(raw, ["board_name", "boardName", "board", "boardCode"]) || "Room only"),
    payment_type: clean(pick(raw, ["payment_type", "paymentType"]) || "AT_WEB"),
    cancellation_policies: [],
  };
}

function normalizeLiveHotel(raw, index) {
  const rate = makeRate(raw);
  if (!rate) return null;

  const id = clean(pick(raw, ["hotel_id", "hotel_code", "hotelCode", "hotelId", "supplier_hotel_id", "code", "id"]) || `live-${index}`);
  const image = clean(raw.image_url || raw.direct_image_url || "");

  return {
    hotel_id: id,
    hotel_code: id,
    hotel_name: clean(raw.hotel_name || raw.hotelName || raw.name || `Hotel ${index + 1}`),
    country: clean(raw.destination_country || raw.country),
    city: clean(raw.destination_city || raw.city || raw.destination),
    destination_code: clean(raw.destination_code || raw.destinationCode || raw.city),
    area: clean(raw.area || raw.zoneName || raw.zone_name),
    address: clean(raw.address),
    latitude: clean(raw.latitude || raw.lat),
    longitude: clean(raw.longitude || raw.lng || raw.lon),
    image_url: proxiedImageUrl(image),
    direct_image_url: hotelbedsDirectUrl(image),
    first_rate: rate,
    live_rate_ready: true,
    price_confirmation_required: false,
  };
}

function loadLiveChunks() {
  LIVE_HOTELS = [];

  if (!fs.existsSync(RATE_CHUNK_DIR)) return;

  const files = fs.readdirSync(RATE_CHUNK_DIR)
    .filter((f) => f.startsWith("live-rates-smart-") && f.endsWith(".ndjson.gz"))
    .sort();

  const seen = new Set();

  for (const file of files) {
    const full = path.join(RATE_CHUNK_DIR, file);
    let text = "";

    try {
      text = zlib.gunzipSync(fs.readFileSync(full)).toString("utf8");
    } catch {
      continue;
    }

    for (const line of text.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;

      try {
        const raw = JSON.parse(s);
        const h = normalizeLiveHotel(raw, LIVE_HOTELS.length + 1);
        if (!h || !h.country || !h.city) continue;

        const key = `${h.hotel_id}|${h.first_rate.rate_key}`;
        if (seen.has(key)) continue;
        seen.add(key);
        LIVE_HOTELS.push(h);
      } catch {}
    }
  }
}

function buildCountryList() {
  const map = new Map();

  for (const h of CATALOG_HOTELS) {
    if (!h.country || !h.city) continue;
    if (!map.has(h.country)) map.set(h.country, new Map());
    const cityMap = map.get(h.country);
    if (!cityMap.has(h.city)) {
      cityMap.set(h.city, { city: h.city, destination_code: h.city, live_hotels: 0, catalog_hotels: 0 });
    }
    cityMap.get(h.city).catalog_hotels++;
  }

  for (const h of LIVE_HOTELS) {
    if (!h.country || !h.city) continue;
    if (!map.has(h.country)) map.set(h.country, new Map());
    const cityMap = map.get(h.country);
    if (!cityMap.has(h.city)) {
      cityMap.set(h.city, { city: h.city, destination_code: h.destination_code || h.city, live_hotels: 0, catalog_hotels: 0 });
    }
    cityMap.get(h.city).live_hotels++;
  }

  COUNTRY_LIST = [...map.entries()]
    .map(([country, cityMap]) => ({
      country,
      city_count: cityMap.size,
      cities: [...cityMap.values()].sort((a, b) => {
        if ((b.live_hotels || 0) !== (a.live_hotels || 0)) return (b.live_hotels || 0) - (a.live_hotels || 0);
        if ((b.catalog_hotels || 0) !== (a.catalog_hotels || 0)) return (b.catalog_hotels || 0) - (a.catalog_hotels || 0);
        return a.city.localeCompare(b.city);
      }),
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function findHotels(country, city, area, keyword, limit = 120) {
  const query = `${area || ""} ${keyword || ""}`.trim();

  const live = LIVE_HOTELS.filter((h) => !country || norm(h.country) === norm(country))
    .filter((h) => !city || norm(h.city) === norm(city))
    .filter((h) => {
      if (!query) return true;
      const text = norm([h.hotel_name, h.area, h.address, h.city, h.country].join(" "));
      return query.split(/\s+/).some((part) => text.includes(norm(part)));
    });

  if (live.length) return live.slice(0, Number(limit || 120));

  return CATALOG_HOTELS.filter((h) => !country || norm(h.country) === norm(country))
    .filter((h) => !city || norm(h.city) === norm(city))
    .filter((h) => {
      if (!query) return true;
      const text = norm([h.hotel_name, h.area, h.address, h.city, h.country].join(" "));
      return query.split(/\s+/).some((part) => text.includes(norm(part)));
    })
    .slice(0, Number(limit || 120));
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
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const response = await fetch(candidate, {
        headers: { "User-Agent": "Mozilla/5.0 MySpaceHotel", Accept: "image/*,*/*;q=0.8" },
      });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, contentType };
    } catch {}
  }

  return null;
}

function readLedger() {
  if (!fs.existsSync(LEDGER_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(LEDGER_FILE, "utf8")); } catch { return []; }
}

function saveLedger(data) {
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(data, null, 2), "utf8");
}

function makeCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function findLiveHotel(body) {
  const hotelId = clean(body.hotel_id);
  const rateKey = clean(body.rate_key);
  return LIVE_HOTELS.find((h) => clean(h.hotel_id) === hotelId && clean(h.first_rate?.rate_key) === rateKey) || null;
}

loadCatalogHotels();
loadLiveChunks();
buildCountryList();

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "myspace-hotel-backend",
    global_catalog_hotels: CATALOG_HOTELS.length,
    live_rates: LIVE_HOTELS.length,
    live_hotels: LIVE_HOTELS.length,
    hotels_with_images: [...CATALOG_HOTELS, ...LIVE_HOTELS].filter((h) => h.image_url).length,
    countries: COUNTRY_LIST.length,
    cities: COUNTRY_LIST.reduce((s, c) => s + c.city_count, 0),
  });
});

app.get("/api/live-rates/count", (req, res) => {
  res.json({
    ok: true,
    global_catalog_hotels: CATALOG_HOTELS.length,
    live_rates: LIVE_HOTELS.length,
    live_hotels: LIVE_HOTELS.length,
    countries: COUNTRY_LIST.length,
    cities: COUNTRY_LIST.reduce((s, c) => s + c.city_count, 0),
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  res.json({ ok: true, countries: COUNTRY_LIST });
});

app.get("/api/hotels/search", (req, res) => {
  const hotels = findHotels(clean(req.query.country), clean(req.query.city), clean(req.query.area), clean(req.query.keyword), Number(req.query.limit || 120));
  res.json({ ok: true, hotels, count: hotels.length });
});

app.get("/api/image", async (req, res) => {
  const image = await fetchImageBuffer(req.query.url);
  if (!image) return res.status(404).send("Image unavailable");
  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(image.buffer);
});

app.post("/reservation-request", async (req, res) => {
  try {
    const body = req.body || {};
    const liveHotel = findLiveHotel(body);

    if (!liveHotel) {
      const code = makeCode();
      const ledger = readLedger();
      ledger.unshift({ reservation_code: code, status: "PRICE_CONFIRMATION_REQUIRED", ...body, created_at: new Date().toISOString() });
      saveLedger(ledger);
      return res.json({ ok: true, reservation_code: code, message: "Your request has been received. We will confirm the latest availability and price before payment." });
    }

    if (!stripe) return res.status(500).json({ ok: false, message: "Secure payment unavailable." });

    const rooms = Math.max(1, Number(body.rooms || 1));
    const rate = liveHotel.first_rate;
    const customerTotal = money(rate.customer_total * rooms);
    const reservation_code = makeCode();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(reservation_code)}`,
      cancel_url: PUBLIC_FRONTEND_URL,
      customer_email: clean(body.customer_email) || undefined,
      metadata: { reservation_code },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: rate.currency.toLowerCase(),
          unit_amount: Math.round(customerTotal * 100),
          product_data: { name: `${liveHotel.hotel_name} - ${rooms} room${rooms === 1 ? "" : "s"}` },
        },
      }],
    });

    const ledger = readLedger();
    ledger.unshift({ reservation_code, status: "PENDING_PAYMENT", stripe_session_id: session.id, customer_total: customerTotal, ...body, created_at: new Date().toISOString() });
    saveLedger(ledger);

    res.json({ ok: true, reservation_code, payment_url: session.url });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not continue with this reservation." });
  }
});

app.post("/reservation/:code/mark-paid", (req, res) => {
  res.json({ ok: true, reservation_code: clean(req.params.code) });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("MYSPACE HOTEL BACKEND RUNNING");
  console.log("Global catalog hotels:", CATALOG_HOTELS.length);
  console.log("Live hotels:", LIVE_HOTELS.length);
  console.log("Countries:", COUNTRY_LIST.length);
  console.log("Cities:", COUNTRY_LIST.reduce((s, c) => s + c.city_count, 0));
});