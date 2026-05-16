require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const Stripe = require("stripe");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));

const PORT = Number(process.env.PORT || 5050);
const PUBLIC_FRONTEND_URL =
  process.env.PUBLIC_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  "https://www.myspace-hotel.com";

const PUBLIC_API_BASE =
  process.env.PUBLIC_API_BASE ||
  process.env.BACKEND_BASE_URL ||
  `http://127.0.0.1:${PORT}`;

const DATA_DIR = path.join(__dirname, "data");
const LIVE_CACHE_DIR = path.join(DATA_DIR, "live-rate-cache");
const MASTER_REGISTRY_FILE = path.join(DATA_DIR, "master_hotel_registry.json.gz");
const DESTINATION_MASTER_FILE = path.join(DATA_DIR, "destination_master.json.gz");
const BOOKINGS_FILE = path.join(DATA_DIR, "booking_ledger.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function clean(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return clean(v).toLowerCase();
}

function number(v) {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return Number(number(v).toFixed(2));
}

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file, fallback = []) {
  try {
    if (!exists(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function readJsonGz(file, fallback = []) {
  try {
    if (!exists(file)) return fallback;
    return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
  } catch (err) {
    console.log("READ GZ FAILED:", file, err.message);
    return fallback;
  }
}

function readNdjsonGz(file) {
  try {
    const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
    return text.split(/\r?\n/).filter(Boolean).map((x) => JSON.parse(x));
  } catch (err) {
    console.log("SKIP BAD CHUNK:", file, err.message);
    return [];
  }
}

function flattenDestinationRows(value) {
  const rows = [];

  function walk(node) {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (typeof node !== "object") return;

    if (node.country && node.city) {
      rows.push({ country: clean(node.country), city: clean(node.city) });
      return;
    }

    for (const child of Object.values(node)) walk(child);
  }

  walk(value);
  return rows;
}

function makeReservationCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function propertyTypeFromNameAndText(name, text = "") {
  const value = lower(`${name} ${text}`);

  if (
    value.includes("apartment") ||
    value.includes("residence") ||
    value.includes("studio") ||
    value.includes("flat") ||
    value.includes("penthouse") ||
    value.includes("holiday home") ||
    value.includes("serviced")
  ) {
    return "Apartment";
  }

  if (value.includes("villa")) return "Villa";
  if (value.includes("resort")) return "Resort";
  if (value.includes("guest house") || value.includes("guesthouse")) return "Guest house";
  return "Hotel";
}

function normalImageUrl(value) {
  const raw = clean(value);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;

  const cleaned = raw
    .replace(/^\/+/, "")
    .replace(/^giata\//i, "")
    .replace(/^bigger\//i, "")
    .replace(/^medium\//i, "")
    .replace(/^small\//i, "");

  return cleaned ? `https://photos.hotelbeds.com/giata/bigger/${cleaned}` : "";
}

function proxyImageUrl(value) {
  const direct = normalImageUrl(value);
  if (!direct) return "";
  return `${PUBLIC_API_BASE}/api/image?url=${encodeURIComponent(direct)}`;
}

function textMatch(h, q) {
  if (!q) return true;
  const value = lower([h.hotel_name, h.address, h.area, h.city, h.country, h.property_type].join(" "));
  return lower(q)
    .split(/\s+/)
    .filter(Boolean)
    .some((part) => value.includes(part));
}

function sortHotelsForCustomer(a, b) {
  const aLive = a.live_rate_ready ? 1 : 0;
  const bLive = b.live_rate_ready ? 1 : 0;
  if (bLive !== aLive) return bLive - aLive;

  const aPrice = number(a.first_rate?.amount || 999999999);
  const bPrice = number(b.first_rate?.amount || 999999999);
  if (aLive && bLive && aPrice !== bPrice) return aPrice - bPrice;

  return clean(a.hotel_name).localeCompare(clean(b.hotel_name));
}

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
  KES: 165,
  GHS: 17,
  INR: 106,
  SGD: 1.72,
};

const SMTP_HOST = clean(process.env.SMTP_HOST);
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = clean(process.env.SMTP_USER || process.env.SMTP_USERNAME);
const SMTP_PASS = clean(process.env.SMTP_PASS || process.env.SMTP_PASSWORD);
const SMTP_FROM = clean(process.env.SMTP_FROM) || `MySpace Hotel <${SMTP_USER}>`;
const RESERVATION_EMAIL = clean(process.env.RESERVATION_EMAIL || process.env.SUPPORT_EMAIL || SMTP_USER);
const SUPPORT_EMAIL = clean(process.env.SUPPORT_EMAIL || RESERVATION_EMAIL);

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function smtpSecureValue() {
  if (process.env.SMTP_SECURE !== undefined) return String(process.env.SMTP_SECURE).toLowerCase() === "true";
  if (String(process.env.SMTP_USE_TLS || "").toLowerCase() === "true" && SMTP_PORT === 465) return true;
  return SMTP_PORT === 465;
}

let mailer = null;

function getMailer() {
  if (mailer) return mailer;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  mailer = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: smtpSecureValue(),
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return mailer;
}

function emailShell(title, bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f3f7fb;padding:24px;color:#07111f">
      <div style="max-width:720px;margin:auto;background:white;border-radius:18px;overflow:hidden;border:1px solid #dbe5f2">
        <div style="background:#123b7b;color:white;padding:22px">
          <div style="letter-spacing:8px;font-weight:900;color:#ffd34d">MYSPACE HOTEL</div>
          <h1 style="margin:12px 0 0;font-size:28px">${title}</h1>
        </div>
        <div style="padding:24px;font-size:16px;line-height:1.55">
          ${bodyHtml}
        </div>
        <div style="padding:18px 24px;background:#f6f8fc;color:#52627c;font-size:13px">
          MySpace Hotel | ${SUPPORT_EMAIL}
        </div>
      </div>
    </div>
  `;
}

function bookingRows(booking) {
  return `
    <table style="width:100%;border-collapse:collapse;margin-top:16px">
      ${[
        ["Reservation code", booking.reservation_code],
        ["Property", booking.hotel_name],
        ["Destination", booking.destination],
        ["Check-in", booking.checkin],
        ["Check-out", booking.checkout],
        ["Guests", booking.guests],
        ["Rooms", booking.rooms],
        ["Total", booking.amount ? `${booking.currency} ${booking.amount}` : "To be confirmed"],
        ["Status", booking.status === "PAYMENT_READY" ? "Ready for secure checkout" : "Confirmation required"],
        ["Customer", booking.customer_name],
        ["Email", booking.customer_email],
        ["Phone", booking.customer_phone],
        ["Special requests", booking.note || "None"],
      ]
        .map(
          ([k, v]) => `
            <tr>
              <td style="border-bottom:1px solid #e6edf7;padding:10px;font-weight:700;width:38%">${k}</td>
              <td style="border-bottom:1px solid #e6edf7;padding:10px">${clean(v) || "-"}</td>
            </tr>
          `
        )
        .join("")}
    </table>
  `;
}

async function sendReservationEmails(booking) {
  const transport = getMailer();

  if (!transport) {
    console.log("EMAIL SKIPPED: SMTP is not fully configured.");
    return { customer_sent: false, admin_sent: false, skipped: true };
  }

  const customerSubject =
    booking.status === "PAYMENT_READY"
      ? `Your MySpace Hotel reservation is ready - ${booking.reservation_code}`
      : `We received your MySpace Hotel request - ${booking.reservation_code}`;

  const customerHtml = emailShell(
    booking.status === "PAYMENT_READY" ? "Reservation ready" : "Request received",
    `
      <p>Dear ${clean(booking.customer_name) || "Customer"},</p>
      <p>
        ${
          booking.status === "PAYMENT_READY"
            ? "Your reservation details have been received and the stay is ready for secure checkout."
            : "Your reservation request has been received. We will confirm current availability and price before payment."
        }
      </p>
      ${bookingRows(booking)}
      <p style="margin-top:20px">Thank you for choosing MySpace Hotel.</p>
    `
  );

  const adminHtml = emailShell(
    "New reservation request",
    `
      <p>A new reservation request has been submitted.</p>
      ${bookingRows(booking)}
    `
  );

  let customerSent = false;
  let adminSent = false;

  if (booking.customer_email) {
    try {
      await transport.sendMail({
        from: SMTP_FROM,
        to: booking.customer_email,
        replyTo: SUPPORT_EMAIL,
        subject: customerSubject,
        html: customerHtml,
      });
      customerSent = true;
    } catch (err) {
      console.log("CUSTOMER EMAIL FAILED:", err.message);
    }
  }

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: RESERVATION_EMAIL,
      replyTo: booking.customer_email || SUPPORT_EMAIL,
      subject: `New MySpace Hotel reservation - ${booking.reservation_code}`,
      html: adminHtml,
    });
    adminSent = true;
  } catch (err) {
    console.log("ADMIN EMAIL FAILED:", err.message);
  }

  return { customer_sent: customerSent, admin_sent: adminSent, skipped: false };
}

console.log("");
console.log("==============================================");
console.log("MYSPACE HOTEL GLOBAL CUSTOMER ENGINE");
console.log("==============================================");

const GLOBAL_HOTELS_RAW = readJsonGz(MASTER_REGISTRY_FILE, []);
const DESTINATION_RAW = readJsonGz(DESTINATION_MASTER_FILE, []);
const DESTINATION_ROWS = flattenDestinationRows(DESTINATION_RAW);

const DESTINATION_INDEX = new Map();
const GLOBAL_HOTEL_INDEX = new Map();
const HOTEL_LOOKUP_BY_ID = new Map();
const HOTEL_LOOKUP_BY_NAME = new Map();
const LIVE_RATE_INDEX = new Map();

for (const row of DESTINATION_ROWS) {
  const country = clean(row.country);
  const city = clean(row.city);
  if (!country || !city) continue;

  const key = `${country}|||${city}`;
  if (!DESTINATION_INDEX.has(key)) {
    DESTINATION_INDEX.set(key, { country, city, catalog_hotels: 0, live_hotels: 0 });
  }
}

for (const raw of GLOBAL_HOTELS_RAW) {
  const country = clean(raw.country);
  const city = clean(raw.city);
  const hotelName = clean(raw.hotel_name || raw.name);
  if (!country || !city || !hotelName) continue;

  const hotelId =
    clean(raw.canonical_hotel_id) ||
    clean(raw.supplier_hotel_id) ||
    clean(raw.hotel_id) ||
    crypto.createHash("md5").update(`${country}|${city}|${hotelName}`).digest("hex");

  const key = `${country}|||${city}`;

  if (!DESTINATION_INDEX.has(key)) {
    DESTINATION_INDEX.set(key, { country, city, catalog_hotels: 0, live_hotels: 0 });
  }

  const imageRaw = clean(raw.direct_image_url || raw.image_url);

  const hotel = {
    hotel_id: hotelId,
    hotel_code: hotelId,
    hotel_name: hotelName,
    country,
    city,
    area: clean(raw.area || raw.zone || raw.district),
    address: clean(raw.address),
    latitude: clean(raw.latitude),
    longitude: clean(raw.longitude),
    property_type: propertyTypeFromNameAndText(hotelName, clean(raw.category_name || raw.hotel_type)),
    image_url: proxyImageUrl(imageRaw),
    direct_image_url: normalImageUrl(imageRaw),
    live_rate_ready: false,
    price_confirmation_required: true,
    room_count: 0,
    first_rate: null,
    rooms: [],
  };

  if (!GLOBAL_HOTEL_INDEX.has(key)) GLOBAL_HOTEL_INDEX.set(key, []);
  GLOBAL_HOTEL_INDEX.get(key).push(hotel);

  DESTINATION_INDEX.get(key).catalog_hotels += 1;
  HOTEL_LOOKUP_BY_ID.set(lower(hotelId), hotel);
  HOTEL_LOOKUP_BY_NAME.set(lower(hotelName), hotel);
}

function addLiveRateRow(row) {
  const hotelName = clean(row.hotel_name || row.hotelName || row.name);
  const rateKey = clean(row.rate_key || row.rateKey || row.key || row.id);
  const amount = money(row.selling_rate || row.sellingRate || row.customer_total || row.amount || row.net || row.price);
  const currency = clean(row.currency || row.currency_code || row.currencyCode || "GBP").toUpperCase();

  if (!hotelName || !rateKey || !amount || !currency) return false;

  const hotelId =
    clean(row.hotel_id || row.hotel_code || row.hotelCode || row.supplier_hotel_id || row.code) ||
    crypto.createHash("md5").update(hotelName).digest("hex");

  let country = clean(row.destination_country || row.country || row.countryName || row.country_name);
  let city = clean(row.destination_city || row.city || row.cityName || row.city_name || row.destination || row.destinationName);

  const registryHotel = HOTEL_LOOKUP_BY_ID.get(lower(hotelId)) || HOTEL_LOOKUP_BY_NAME.get(lower(hotelName));

  if ((!country || !city || lower(country) === "unknown") && registryHotel) {
    country = registryHotel.country;
    city = registryHotel.city;
  }

  if (!country || !city || lower(country) === "unknown") return false;

  const cityKey = `${country}|||${city}`;

  if (!DESTINATION_INDEX.has(cityKey)) {
    DESTINATION_INDEX.set(cityKey, { country, city, catalog_hotels: 0, live_hotels: 0 });
  }

  if (!LIVE_RATE_INDEX.has(cityKey)) LIVE_RATE_INDEX.set(cityKey, new Map());
  const cityMap = LIVE_RATE_INDEX.get(cityKey);

  if (!cityMap.has(hotelId)) {
    const imageRaw =
      clean(row.direct_image_url || row.image_url) ||
      clean(registryHotel?.direct_image_url || registryHotel?.image_url);

    cityMap.set(hotelId, {
      hotel_id: hotelId,
      hotel_code: hotelId,
      hotel_name: hotelName,
      country,
      city,
      area: clean(row.area || row.zone_name || row.zoneName || registryHotel?.area),
      address: clean(row.address || registryHotel?.address),
      latitude: clean(row.latitude || row.lat || registryHotel?.latitude),
      longitude: clean(row.longitude || row.lng || row.lon || registryHotel?.longitude),
      property_type: propertyTypeFromNameAndText(hotelName, clean(row.category_name || row.categoryName)),
      image_url: proxyImageUrl(imageRaw),
      direct_image_url: normalImageUrl(imageRaw),
      live_rate_ready: true,
      price_confirmation_required: false,
      rooms: [],
    });
  }

  const hotel = cityMap.get(hotelId);
  if (hotel.rooms.some((r) => clean(r.rate_key) === rateKey)) return false;

  hotel.rooms.push({
    room_name: clean(row.room_name || row.roomName || row.room || "Selected room"),
    board_name: clean(row.board_name || row.boardName || row.board || "Room only"),
    payment_type: clean(row.payment_type || row.paymentType || "Secure checkout"),
    currency,
    amount,
    rate_key: rateKey,
    cancellation_policies: Array.isArray(row.cancellation_policies) ? row.cancellation_policies : [],
  });

  return true;
}

let RAW_LIVE_ROWS = 0;
let USABLE_LIVE_ROWS = 0;

if (exists(LIVE_CACHE_DIR)) {
  const chunkFiles = fs
    .readdirSync(LIVE_CACHE_DIR)
    .filter((f) => f.startsWith("live-rates-smart-") && f.endsWith(".ndjson.gz"))
    .sort();

  for (const file of chunkFiles) {
    const rows = readNdjsonGz(path.join(LIVE_CACHE_DIR, file));
    RAW_LIVE_ROWS += rows.length;
    for (const row of rows) {
      if (addLiveRateRow(row)) USABLE_LIVE_ROWS += 1;
    }
  }
}

let TOTAL_LIVE_HOTELS = 0;
let TOTAL_LIVE_RATES = 0;

for (const [cityKey, cityMap] of LIVE_RATE_INDEX.entries()) {
  TOTAL_LIVE_HOTELS += cityMap.size;

  if (DESTINATION_INDEX.has(cityKey)) {
    DESTINATION_INDEX.get(cityKey).live_hotels = cityMap.size;
  }

  for (const hotel of cityMap.values()) {
    hotel.rooms.sort((a, b) => number(a.amount) - number(b.amount));
    const cheapest = hotel.rooms[0] || null;
    hotel.room_count = hotel.rooms.length;
    hotel.first_rate = cheapest;
    TOTAL_LIVE_RATES += hotel.rooms.length;
  }
}

function buildCountries() {
  const countries = new Map();

  for (const row of DESTINATION_INDEX.values()) {
    if (!countries.has(row.country)) countries.set(row.country, []);

    countries.get(row.country).push({
      city: row.city,
      destination_code: row.city,
      live_hotels: row.live_hotels || 0,
      catalog_hotels: row.catalog_hotels || 0,
    });
  }

  return [...countries.entries()]
    .map(([country, cities]) => ({
      country,
      city_count: cities.length,
      hotel_count: cities.reduce((s, c) => s + number(c.catalog_hotels), 0),
      live_hotel_count: cities.reduce((s, c) => s + number(c.live_hotels), 0),
      cities: cities.sort((a, b) => {
        if ((b.live_hotels || 0) !== (a.live_hotels || 0)) return (b.live_hotels || 0) - (a.live_hotels || 0);
        if ((b.catalog_hotels || 0) !== (a.catalog_hotels || 0)) return (b.catalog_hotels || 0) - (a.catalog_hotels || 0);
        return a.city.localeCompare(b.city);
      }),
    }))
    .filter((c) => c.country && c.cities.length)
    .sort((a, b) => a.country.localeCompare(b.country));
}

const COUNTRY_RESPONSE = buildCountries();

function getHotelsForSearch(country, city, area, keyword, propertyType, limit) {
  const key = `${clean(country)}|||${clean(city)}`;

  const liveHotels = LIVE_RATE_INDEX.has(key) ? [...LIVE_RATE_INDEX.get(key).values()] : [];
  const catalogHotels = GLOBAL_HOTEL_INDEX.get(key) || [];
  const merged = new Map();

  for (const h of catalogHotels) {
    merged.set(lower(h.hotel_id || h.hotel_name), {
      ...h,
      live_rate_ready: false,
      price_confirmation_required: true,
      room_count: 0,
      first_rate: null,
      rooms: [],
    });
  }

  for (const h of liveHotels) {
    merged.set(lower(h.hotel_id || h.hotel_name), {
      ...h,
      live_rate_ready: true,
      price_confirmation_required: false,
      room_count: h.rooms.length,
      first_rate: h.rooms[0] || null,
      rooms: h.rooms.slice(0, 20),
    });
  }

  let hotels = [...merged.values()];

  if (area) hotels = hotels.filter((h) => textMatch(h, area));
  if (keyword) hotels = hotels.filter((h) => textMatch(h, keyword));

  if (propertyType && propertyType !== "all") {
    const p = lower(propertyType);
    hotels = hotels.filter((h) => {
      const t = lower(h.property_type);
      if (p === "hotel") return t === "hotel" || t === "resort";
      if (p === "apartment") return t === "apartment" || t === "villa" || t === "guest house";
      return t === p;
    });
  }

  hotels.sort(sortHotelsForCustomer);
  return hotels.slice(0, Math.max(1, Math.min(number(limit || 120), 500)));
}

async function fetchImageBuffer(url) {
  const raw = clean(url);
  if (!/^https?:\/\//i.test(raw)) return null;

  const candidates = [raw];

  if (raw.includes("photos.hotelbeds.com/giata/")) {
    const tail = raw.split("photos.hotelbeds.com/giata/")[1] || "";
    const stripped = tail.replace(/^\/+/, "").replace(/^bigger\//i, "").replace(/^medium\//i, "").replace(/^small\//i, "");
    candidates.push(`https://photos.hotelbeds.com/giata/bigger/${stripped}`);
    candidates.push(`https://photos.hotelbeds.com/giata/medium/${stripped}`);
    candidates.push(`https://photos.hotelbeds.com/giata/small/${stripped}`);
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

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel",
    message: "Global hotel search and selected-stay live price engine is running.",
    email_configured: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS),
  });
});

app.get("/status", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel",
    global_catalog_hotels: GLOBAL_HOTELS_RAW.length,
    countries: COUNTRY_RESPONSE.length,
    cities: DESTINATION_INDEX.size,
    raw_live_rows: RAW_LIVE_ROWS,
    usable_live_rows: USABLE_LIVE_ROWS,
    selectable_hotels: GLOBAL_HOTELS_RAW.length,
    cached_instant_checkout_hotels: TOTAL_LIVE_HOTELS,
    cached_live_rate_rows: TOTAL_LIVE_RATES,
    live_cities: LIVE_RATE_INDEX.size,
    email_configured: Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS),
    reservation_email_configured: Boolean(RESERVATION_EMAIL),
  });
});

app.get("/api/live-rates/count", (req, res) => {
  res.json({
    ok: true,
    global_catalog_hotels: GLOBAL_HOTELS_RAW.length,
    countries: COUNTRY_RESPONSE.length,
    cities: DESTINATION_INDEX.size,
    raw_live_rows: RAW_LIVE_ROWS,
    usable_live_rows: USABLE_LIVE_ROWS,
    selectable_hotels: GLOBAL_HOTELS_RAW.length,
    cached_instant_checkout_hotels: TOTAL_LIVE_HOTELS,
    cached_live_rate_rows: TOTAL_LIVE_RATES,
    live_cities: LIVE_RATE_INDEX.size,
    model: "Global catalogue with selected-destination live price cache",
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  res.json({
    ok: true,
    countries: COUNTRY_RESPONSE,
    total_countries: COUNTRY_RESPONSE.length,
    total_cities: DESTINATION_INDEX.size,
  });
});

app.get("/api/hotels/search", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const area = clean(req.query.area);
  const keyword = clean(req.query.keyword);
  const propertyType = clean(req.query.property_type || req.query.stay_type || "all");
  const limit = number(req.query.limit || 120);

  if (!country || !city) {
    return res.json({
      ok: true,
      hotels: [],
      count: 0,
      message: "Choose a country and city to see available stays.",
    });
  }

  const hotels = getHotelsForSearch(country, city, area, keyword, propertyType, limit);

  res.json({
    ok: true,
    hotels,
    count: hotels.length,
    country,
    city,
    property_type: propertyType,
    message: hotels.length ? "Available stays loaded." : "No matching stay found. Try another city or clear filters.",
  });
});

app.get("/api/hotels/live-check", (req, res) => {
  const hotelId = lower(req.query.hotel_id);
  const hotelName = lower(req.query.hotel_name);
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const key = `${country}|||${city}`;
  const cityMap = LIVE_RATE_INDEX.get(key);

  if (!cityMap) {
    return res.json({
      ok: true,
      live_payment_ready: false,
      payment_ready: false,
      price_status: "We will confirm the latest availability and price before payment.",
    });
  }

  let found = null;

  for (const hotel of cityMap.values()) {
    if (lower(hotel.hotel_id) === hotelId || lower(hotel.hotel_name) === hotelName) {
      found = hotel;
      break;
    }
  }

  if (!found || !found.rooms.length) {
    return res.json({
      ok: true,
      live_payment_ready: false,
      payment_ready: false,
      price_status: "We will confirm the latest availability and price before payment.",
    });
  }

  const cheapest = found.rooms[0];

  res.json({
    ok: true,
    live_payment_ready: true,
    payment_ready: true,
    price_status: "Current total is available for secure checkout.",
    hotel_id: found.hotel_id,
    hotel_name: found.hotel_name,
    country: found.country,
    city: found.city,
    amount: cheapest.amount,
    currency: cheapest.currency,
    room_name: cheapest.room_name,
    board_name: cheapest.board_name,
    payment_type: cheapest.payment_type,
    rate_key: cheapest.rate_key,
    rooms: found.rooms.slice(0, 20),
    first_rate: cheapest,
  });
});

app.get("/api/currency/convert", async (req, res) => {
  const amount = number(req.query.amount || 1);
  const from = clean(req.query.from_currency || req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to_currency || req.query.to || "USD").toUpperCase();

  if (!amount || amount <= 0) {
    return res.status(400).json({ ok: false, message: "Amount must be greater than zero." });
  }

  if (from === to) {
    return res.json({ ok: true, amount, from_currency: from, to_currency: to, rate: 1, converted: money(amount), source: "same_currency" });
  }

  try {
    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`);
    const data = await response.json();

    if (data?.result === "success" && data?.rates?.[to]) {
      const rate = number(data.rates[to]);
      return res.json({
        ok: true,
        amount,
        from_currency: from,
        to_currency: to,
        rate,
        converted: money(amount * rate),
        source: "live_exchange_rate",
        date: data.time_last_update_utc || "",
      });
    }
  } catch {}

  if (FX[from] && FX[to]) {
    const converted = (amount / FX[from]) * FX[to];
    return res.json({
      ok: true,
      amount,
      from_currency: from,
      to_currency: to,
      rate: money(FX[to] / FX[from]),
      converted: money(converted),
      source: "fallback_estimate",
    });
  }

  res.status(503).json({
    ok: false,
    message: "Currency conversion is temporarily unavailable for this currency pair.",
  });
});

app.get("/api/guide", (req, res) => {
  const country = clean(req.query.country || "your destination");
  const city = clean(req.query.city || "");
  const area = clean(req.query.area || "");
  const destination = [area, city, country].filter(Boolean).join(", ");

  const emergencyByCountry = {
    "United Kingdom": { emergency: "999 or 112", police: "999", ambulance: "999", fire: "999" },
    "United States": { emergency: "911", police: "911", ambulance: "911", fire: "911" },
    Canada: { emergency: "911", police: "911", ambulance: "911", fire: "911" },
    Nigeria: { emergency: "112", police: "112", ambulance: "112", fire: "112" },
    France: { emergency: "112", police: "17", ambulance: "15", fire: "18" },
    Spain: { emergency: "112", police: "112", ambulance: "112", fire: "112" },
    Italy: { emergency: "112", police: "112", ambulance: "118", fire: "115" },
    Germany: { emergency: "112", police: "110", ambulance: "112", fire: "112" },
    "United Arab Emirates": { emergency: "999", police: "999", ambulance: "998", fire: "997" },
    Australia: { emergency: "000", police: "000", ambulance: "000", fire: "000" },
    Japan: { emergency: "110 / 119", police: "110", ambulance: "119", fire: "119" },
    "South Africa": { emergency: "112 / 10111", police: "10111", ambulance: "112", fire: "112" },
  };

  const emergency = emergencyByCountry[country] || { emergency: "112", police: "112", ambulance: "112", fire: "112" };

  res.json({
    ok: true,
    guide: {
      destination,
      emergency,
    },
  });
});

app.get("/api/image", async (req, res) => {
  const url = clean(req.query.url);

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).send("Invalid image URL");
  }

  const image = await fetchImageBuffer(url);

  if (!image) {
    return res.status(404).send("Image unavailable");
  }

  res.setHeader("Content-Type", image.contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(image.buffer);
});

app.post("/reservation-request", async (req, res) => {
  try {
    const body = req.body || {};
    const code = makeReservationCode();
    const bookings = readJson(BOOKINGS_FILE, []);

    const rateKey = clean(body.rate_key);
    const amount = money(body.amount);

    const booking = {
      reservation_code: code,
      created_at: new Date().toISOString(),
      status: rateKey && amount > 0 ? "PAYMENT_READY" : "CONFIRMATION_REQUIRED",
      hotel_id: clean(body.hotel_id),
      hotel_name: clean(body.hotel_name),
      destination: clean(body.destination),
      checkin: clean(body.checkin),
      checkout: clean(body.checkout),
      guests: number(body.guests),
      rooms: number(body.rooms),
      customer_name: clean(body.customer_name),
      customer_email: clean(body.customer_email),
      customer_phone: clean(body.customer_phone),
      note: clean(body.note),
      rate_key: rateKey,
      amount,
      currency: clean(body.currency),
      room_name: clean(body.room_name),
      board_name: clean(body.board_name),
      price_display: clean(body.price_display),
    };

    bookings.unshift(booking);
    writeJson(BOOKINGS_FILE, bookings);

    let paymentUrl = null;

    if (stripe && booking.status === "PAYMENT_READY" && booking.amount > 0) {
      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          payment_method_types: ["card"],
          customer_email: booking.customer_email || undefined,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: (booking.currency || "GBP").toLowerCase(),
                unit_amount: Math.round(Number(booking.amount) * 100),
                product_data: {
                  name: booking.hotel_name || "MySpace Hotel stay",
                  description: `${booking.destination || ""} | ${booking.checkin || ""} to ${booking.checkout || ""}`,
                },
              },
            },
          ],
          metadata: {
            reservation_code: booking.reservation_code,
            hotel_id: booking.hotel_id,
            hotel_name: booking.hotel_name,
            customer_email: booking.customer_email,
          },
          success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(booking.reservation_code)}`,
          cancel_url: `${PUBLIC_FRONTEND_URL}/?payment=cancelled&code=${encodeURIComponent(booking.reservation_code)}`,
        });

        paymentUrl = session.url;
        booking.stripe_session_id = session.id;
        booking.payment_url_created_at = new Date().toISOString();
        writeJson(BOOKINGS_FILE, bookings);
      } catch (err) {
        console.log("STRIPE CHECKOUT FAILED:", err.message);
      }
    }

    const emailResult = await sendReservationEmails(booking);

    res.json({
      ok: true,
      reservation_code: code,
      status: booking.status,
      payment_url: paymentUrl,
      email: emailResult,
      message:
        paymentUrl
          ? "Secure checkout is ready."
          : booking.status === "PAYMENT_READY"
          ? "Reservation saved. Secure checkout could not be opened automatically."
          : "Your request has been received. We will confirm availability and price before payment.",
    });
  } catch (err) {
    console.log("RESERVATION FAILED:", err.message);
    res.status(500).json({
      ok: false,
      message: "Reservation could not be created.",
    });
  }
});

app.post("/reservation/:code/mark-paid", (req, res) => {
  const code = clean(req.params.code);
  const bookings = readJson(BOOKINGS_FILE, []);
  const item = bookings.find((b) => clean(b.reservation_code) === code);

  if (item) {
    item.status = "PAYMENT_RECEIVED";
    item.payment_confirmed_at = new Date().toISOString();
    writeJson(BOOKINGS_FILE, bookings);
  }

  res.json({ ok: true, reservation_code: code });
});

app.get("/api/bookings", (req, res) => {
  res.json({
    ok: true,
    bookings: readJson(BOOKINGS_FILE, []),
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("MYSPACE HOTEL BACKEND RUNNING");
  console.log("Port:", PORT);
  console.log("Global hotels:", GLOBAL_HOTELS_RAW.length);
  console.log("Countries:", COUNTRY_RESPONSE.length);
  console.log("Cities:", DESTINATION_INDEX.size);
  console.log("Raw live rows:", RAW_LIVE_ROWS);
  console.log("Usable live rows:", USABLE_LIVE_ROWS);
  console.log("Selectable hotels:", GLOBAL_HOTELS_RAW.length);
  console.log("Cached instant checkout hotels:", TOTAL_LIVE_HOTELS);
  console.log("Cached live rate rows:", TOTAL_LIVE_RATES);
  console.log("Email configured:", Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS));
  console.log("Reservation email:", RESERVATION_EMAIL ? "configured" : "missing");
  console.log("");
});


