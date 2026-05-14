require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5050);

const PUBLIC_FRONTEND_URL =
  process.env.PUBLIC_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  "https://www.myspace-hotel.com";

const PUBLIC_API_BASE =
  process.env.PUBLIC_API_BASE ||
  process.env.BACKEND_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

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

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && clean(obj[k]) !== "") return obj[k];
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

function readNdjsonGzRows(filePath, maxRows = 30000) {
  if (!fs.existsSync(filePath)) return [];

  try {
    const text = zlib.gunzipSync(fs.readFileSync(filePath)).toString("utf8");
    const rows = [];

    for (const line of text.split(/\r?\n/)) {
      if (rows.length >= maxRows) break;
      const s = line.trim();
      if (!s) continue;

      try {
        rows.push(JSON.parse(s));
      } catch {}
    }

    return rows;
  } catch (err) {
    console.log("Failed to load NDJSON cache:", err.message);
    return [];
  }
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

  if (!cleaned) return "";
  return `https://photos.hotelbeds.com/giata/bigger/${cleaned}`;
}

function proxiedImageUrl(value) {
  const direct = hotelbedsDirectUrl(value);
  if (!direct) return "";
  return `${PUBLIC_API_BASE}/api/image?url=${encodeURIComponent(direct)}`;
}

function getHotelCode(raw, index) {
  const rawHotel = parseMaybeJson(raw?.raw_hotel_json);
  const hotelObj = rawHotel && typeof rawHotel === "object" ? rawHotel : raw;

  return clean(
    pick(raw, ["hotel_code", "hotelCode", "hotel_id", "hotelId", "supplier_hotel_id", "code", "id"]) ||
      pick(hotelObj, ["code", "hotelCode", "hotel_code", "hotel_id", "hotelId", "id"]) ||
      `hotel-${index + 1}`
  );
}

function findImagePath(raw) {
  const rawHotel = parseMaybeJson(raw?.raw_hotel_json);
  const hotelObj = rawHotel && typeof rawHotel === "object" ? rawHotel : raw;

  const direct =
    pick(raw, ["image_url", "imageUrl", "direct_image_url", "main_image", "mainImage", "thumbnail", "photo", "picture", "path", "image"]) ||
    pick(hotelObj, ["image_url", "imageUrl", "direct_image_url", "main_image", "mainImage", "thumbnail", "photo", "picture", "path", "image"]);

  if (direct) return direct;

  const arrays = [raw?.images, raw?.photos, raw?.pictures, hotelObj?.images, hotelObj?.photos, hotelObj?.pictures];

  for (const arr of arrays) {
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const imagePath =
        typeof item === "string"
          ? item
          : pick(item, ["path", "url", "imageUrl", "image_url", "mainImage", "thumbnail", "image"]);
      if (imagePath) return imagePath;
    }
  }

  return "";
}

function firstRate(raw) {
  const rawRate = parseMaybeJson(raw?.raw_rate_json);
  if (rawRate && typeof rawRate === "object") return rawRate;

  if (raw?.first_rate && typeof raw.first_rate === "object") return raw.first_rate;
  if (raw?.rate && typeof raw.rate === "object") return raw.rate;
  if (Array.isArray(raw?.rates) && raw.rates[0]) return raw.rates[0];

  const rawRoom = parseMaybeJson(raw?.raw_room_json);
  if (rawRoom?.rates?.[0]) return rawRoom.rates[0];

  const rawHotel = parseMaybeJson(raw?.raw_hotel_json);
  if (rawHotel?.rooms?.[0]?.rates?.[0]) return rawHotel.rooms[0].rates[0];

  return raw;
}

function destinationFromRow(raw) {
  const rawHotel = parseMaybeJson(raw?.raw_hotel_json);
  const hotelObj = rawHotel && typeof rawHotel === "object" ? rawHotel : raw;

  const country = clean(
    pick(raw, ["country", "countryName", "country_name"]) ||
      pick(hotelObj, ["country", "countryName", "country_name"])
  );

  const city = clean(
    pick(raw, ["city", "cityName", "city_name", "destination_name", "destinationName", "destination"]) ||
      pick(hotelObj, ["city", "cityName", "city_name", "destinationName", "destination_name", "destination"])
  );

  const destinationCode = clean(
    pick(raw, ["destination_code", "destinationCode", "city_code", "cityCode", "code"]) ||
      pick(hotelObj, ["destinationCode", "destination_code", "cityCode"])
  ).toUpperCase();

  if (!country || !city) return null;

  return {
    country,
    city,
    destination_code: destinationCode || city,
  };
}

function markupPrice(supplierTotal) {
  const supplier = money(supplierTotal);
  const configured = Number(process.env.PLATFORM_COMMISSION_PERCENT || "0.12");
  const markup = configured > 1 ? supplier * (configured / 100) : supplier * configured;

  return {
    supplier_total: supplier,
    platform_markup: money(markup),
    customer_total: money(supplier + markup),
  };
}

function makeRate(raw) {
  const rate = firstRate(raw);
  if (!rate || typeof rate !== "object") return null;

  const amount = num(
    pick(rate, ["customer_total", "selling_rate", "sellingRate", "net", "amount", "price", "total", "supplier_total", "supplier_amount", "gross"]) ||
      pick(raw, ["customer_total", "selling_rate", "sellingRate", "net", "amount", "price", "total", "supplier_total", "supplier_amount", "gross"])
  );

  const currency = clean(
    pick(rate, ["currency", "currency_code", "currencyCode"]) ||
      pick(raw, ["currency", "currency_code", "currencyCode"]) ||
      "GBP"
  ).toUpperCase();

  const rateKey = clean(
    pick(rate, ["rate_key", "rateKey", "key"]) ||
      pick(raw, ["rate_key", "rateKey", "key"])
  );

  if (!amount || amount <= 0 || !currency || !rateKey) return null;

  const alreadyCustomer = Boolean(pick(rate, ["customer_total"]) || pick(raw, ["customer_total"]));
  const pricing = alreadyCustomer
    ? {
        supplier_total: money(pick(rate, ["supplier_total", "supplier_amount"]) || pick(raw, ["supplier_total", "supplier_amount"]) || amount),
        platform_markup: 0,
        customer_total: money(amount),
      }
    : markupPrice(amount);

  return {
    rate_key: rateKey,
    supplier_total: pricing.supplier_total,
    customer_total: pricing.customer_total,
    platform_markup: pricing.platform_markup,
    amount: pricing.customer_total,
    currency,
    room_name: clean(pick(rate, ["room_name", "roomName", "room", "name"]) || pick(raw, ["room_name", "roomName", "room", "name"])) || "Selected room",
    board_name: clean(pick(rate, ["board_name", "boardName", "board", "boardCode"]) || pick(raw, ["board_name", "boardName", "board", "boardCode"])) || "Room only",
    payment_type: clean(pick(rate, ["payment_type", "paymentType"]) || pick(raw, ["payment_type", "paymentType"]) || "AT_WEB"),
    cancellation_policies: Array.isArray(rate.cancellationPolicies)
      ? rate.cancellationPolicies
      : Array.isArray(rate.cancellation_policies)
        ? rate.cancellation_policies
        : [],
  };
}

function normalizeHotel(raw, index) {
  const dest = destinationFromRow(raw);
  if (!dest) return null;

  const rate = makeRate(raw);
  if (!rate) return null;

  const rawHotel = parseMaybeJson(raw?.raw_hotel_json);
  const hotelObj = rawHotel && typeof rawHotel === "object" ? rawHotel : raw;

  const hotelId = getHotelCode(raw, index);
  const hotelName = clean(pick(raw, ["hotel_name", "hotelName", "name"]) || pick(hotelObj, ["name", "hotelName"])) || `Hotel ${index + 1}`;
  const imagePath = findImagePath(raw);

  return {
    hotel_id: hotelId,
    hotel_code: hotelId,
    hotel_name: hotelName,
    country: dest.country,
    city: dest.city,
    destination_code: dest.destination_code,
    area: clean(pick(raw, ["area", "zoneName", "zone_name", "district", "neighbourhood"]) || pick(hotelObj, ["zoneName", "zone_name"])),
    address: clean(pick(raw, ["address", "street", "streetName"]) || pick(hotelObj, ["address", "street", "streetName"])),
    latitude: clean(pick(raw, ["latitude", "lat"]) || pick(hotelObj, ["latitude", "lat"])),
    longitude: clean(pick(raw, ["longitude", "lng", "lon"]) || pick(hotelObj, ["longitude", "lng", "lon"])),
    rating: clean(pick(raw, ["rating", "stars", "categoryName", "category_name"]) || pick(hotelObj, ["categoryName", "category_name"])) || "Available",
    image_url: proxiedImageUrl(imagePath),
    direct_image_url: hotelbedsDirectUrl(imagePath),
    first_rate: rate,
    live_rate_ready: true,
  };
}

function dedupeHotels(hotels) {
  const map = new Map();

  for (const h of hotels) {
    if (!h || !h.hotel_id || !h.first_rate?.rate_key) continue;
    const key = `${h.hotel_id}|${h.first_rate.rate_key}`;
    if (!map.has(key)) map.set(key, h);
  }

  return [...map.values()];
}

function buildDestinations(hotels) {
  const map = new Map();

  for (const hotel of hotels) {
    if (!hotel.country || !hotel.city) continue;

    if (!map.has(hotel.country)) map.set(hotel.country, new Map());
    const cityMap = map.get(hotel.country);

    if (!cityMap.has(hotel.city)) {
      cityMap.set(hotel.city, {
        city: hotel.city,
        destination_code: hotel.destination_code || hotel.city,
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
    .sort((a, b) => {
      const ah = a.cities.reduce((s, x) => s + x.live_hotels, 0);
      const bh = b.cities.reduce((s, x) => s + x.live_hotels, 0);
      return bh - ah || a.country.localeCompare(b.country);
    });
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

function findHotels(country, city, area, keyword, limit = 120) {
  const query = `${area || ""} ${keyword || ""}`.trim();

  return LIVE_HOTELS
    .filter((h) => !country || norm(h.country) === norm(country))
    .filter((h) => !city || norm(h.city) === norm(city))
    .filter((h) => {
      if (!query) return true;
      const text = norm([h.hotel_name, h.area, h.address, h.city, h.country].join(" "));
      return query.split(/\s+/).some((part) => text.includes(norm(part)));
    })
    .slice(0, Math.max(1, Math.min(Number(limit || 120), 300)));
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

const NDJSON_CACHE = path.join(DATA_DIR, "live-rate-cache", "live-rates-000001.ndjson.gz");
const RAW_RATE_ROWS = readNdjsonGzRows(NDJSON_CACHE, 30000);
const HOTEL_CACHE = dedupeHotels(RAW_RATE_ROWS.map((row, index) => normalizeHotel(row, index)).filter(Boolean));
const LIVE_HOTELS = HOTEL_CACHE.filter((h) => h.first_rate?.rate_key && h.first_rate?.amount > 0);
const CATALOG_CACHE = buildDestinations(LIVE_HOTELS);

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "myspace-hotel-backend",
    cache_file: "live-rate-cache/live-rates-000001.ndjson.gz",
    raw_rate_rows_loaded: RAW_RATE_ROWS.length,
    live_rates: LIVE_HOTELS.length,
    live_hotels: LIVE_HOTELS.length,
    hotels_with_images: LIVE_HOTELS.filter((h) => h.image_url).length,
    countries: CATALOG_CACHE.length,
    public_api_base: PUBLIC_API_BASE,
    public_frontend_url: PUBLIC_FRONTEND_URL,
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  res.json({
    ok: true,
    countries: CATALOG_CACHE,
    total_countries: CATALOG_CACHE.length,
    total_live_hotels: LIVE_HOTELS.length,
    hotels_with_images: LIVE_HOTELS.filter((h) => h.image_url).length,
  });
});

app.get("/api/hotels/search", (req, res) => {
  const hotels = findHotels(
    clean(req.query.country),
    clean(req.query.city),
    clean(req.query.area),
    clean(req.query.keyword),
    Number(req.query.limit || 120)
  );

  res.json({
    ok: true,
    hotels,
    count: hotels.length,
    source: "ndjson_live_rate_cache",
  });
});

app.get("/api/live-rates/count", (req, res) => {
  res.json({
    ok: true,
    raw_rate_rows_loaded: RAW_RATE_ROWS.length,
    live_rates: LIVE_HOTELS.length,
    live_hotels: LIVE_HOTELS.length,
    hotels_with_images: LIVE_HOTELS.filter((h) => h.image_url).length,
    countries: CATALOG_CACHE.length,
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
      destination: [liveHotel.area, liveHotel.city, liveHotel.country].filter(Boolean).join(", "),
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
      metadata: {
        reservation_code,
        rooms: String(rooms),
        customer_total: String(customerTotal),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: booking.currency.toLowerCase(),
            unit_amount: Math.round(customerTotal * 100),
            product_data: {
              name: `${booking.hotel_name} - ${rooms} room${rooms === 1 ? "" : "s"}`,
            },
          },
        },
      ],
    });

    booking.stripe_session_id = session.id;
    saveLedger(ledger);

    res.json({
      ok: true,
      reservation_code,
      payment_url: session.url,
      customer_total: customerTotal,
    });
  } catch (err) {
    console.log("checkout error:", err.message);
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
  console.log("Cache file: live-rate-cache/live-rates-000001.ndjson.gz");
  console.log(`Raw rate rows loaded: ${RAW_RATE_ROWS.length}`);
  console.log(`Live rates loaded: ${LIVE_HOTELS.length}`);
  console.log(`Live hotels loaded: ${LIVE_HOTELS.length}`);
  console.log(`Live hotels with image URLs: ${LIVE_HOTELS.filter((h) => h.image_url).length}`);
  console.log(`Destination countries loaded: ${CATALOG_CACHE.length}`);
  console.log("Memory-safe NDJSON loader: READY");
  console.log("Image proxy: READY");
  console.log("==============================================");
  console.log("");
});