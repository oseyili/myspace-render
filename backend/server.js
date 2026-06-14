const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

try {
  require("dotenv").config();
} catch {}

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {}

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors({ origin: true, credentials: true }));
app.use((req, res, next) => {
  if (req.originalUrl === "/api/stripe/webhook") return next();
  return express.json({ limit: "25mb" })(req, res, next);
});

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const HOTELS_FILE = path.join(DATA_DIR, "live_hotels.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const PARTNERS_FILE = path.join(DATA_DIR, "partner_applications.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const SERVICE_ACTIVITY_FILE = path.join(DATA_DIR, "service_activity.json");
const SUPPLIER_AUDIT_FILE = path.join(DATA_DIR, "supplier_rate_audit.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
}

ensureFile(BOOKINGS_FILE, []);
ensureFile(PARTNERS_FILE, []);
ensureFile(FEEDBACK_FILE, []);
ensureFile(SERVICE_ACTIVITY_FILE, []);
ensureFile(SUPPLIER_AUDIT_FILE, []);

function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed;
  } catch {
    return fallback;
  }
}

function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function clean(v) {
  return String(v || "").trim();
}

function lower(v) {
  return clean(v).toLowerCase();
}

function number(v) {
  const n = Number(String(v || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(v) {
  return Number(number(v).toFixed(2));
}

function nowISO() {
  return new Date().toISOString();
}

function makeRef(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function privateSupplierName(v) {
  const value = clean(v).toUpperCase();
  return value || "MYSPACE_INTERNAL";
}

function supplierCodeFromName(name) {
  return privateSupplierName(name)
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "MYSPACE_INTERNAL";
}

function makeSupplierRateId(parts) {
  const raw = [
    parts.supplier_name,
    parts.supplier_hotel_id,
    parts.hotel_id,
    parts.room_code,
    parts.price,
    parts.currency,
    parts.timestamp
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24).toUpperCase();
}

function supplierMetaFromHotel(h, rate = null, requestedCurrency = "") {
  const supplierName = privateSupplierName(
    rate?.supplier_name ||
      rate?.supplier ||
      rate?.source ||
      rate?.provider ||
      h.supplier_name ||
      h.supplier ||
      h.source ||
      h.provider ||
      h.partner ||
      h.inventory_source ||
      "MYSPACE_INTERNAL"
  );

  const supplierCode = clean(
    rate?.supplier_code ||
      rate?.source_code ||
      h.supplier_code ||
      h.source_code ||
      supplierCodeFromName(supplierName)
  );

  const supplierHotelId = clean(
    rate?.supplier_hotel_id ||
      rate?.supplierHotelId ||
      rate?.hotel_supplier_id ||
      rate?.hotel_code ||
      h.supplier_hotel_id ||
      h.supplierHotelId ||
      h.hotel_supplier_id ||
      h.hotel_code ||
      h.code ||
      h.hotel_id ||
      h.hotelId ||
      h.id
  );

  const supplierRateKey = clean(
    rate?.supplier_rate_id ||
      rate?.supplierRateId ||
      rate?.rate_key ||
      rate?.rateKey ||
      rate?.rate_id ||
      rate?.rateId ||
      rate?.room_code ||
      rate?.roomCode ||
      ""
  );

  const currency = clean(requestedCurrency || rate?.currency || h.currency || "GBP").toUpperCase();
  const price = money(rate?.nightly_rate || rate?.amount || rate?.price || h.price || h.amount || h.nightly_rate || 0);
  const timestamp = clean(rate?.rate_source_timestamp || rate?.updated_at || rate?.created_at || h.rate_source_timestamp || h.updated_at || h.created_at || nowISO());

  return {
    supplier_name: supplierName,
    supplier_code: supplierCode || supplierCodeFromName(supplierName),
    supplier_hotel_id: supplierHotelId,
    supplier_rate_key: supplierRateKey,
    supplier_rate_id: makeSupplierRateId({
      supplier_name: supplierName,
      supplier_hotel_id: supplierHotelId,
      hotel_id: clean(h.hotel_id || h.hotelId || h.id || h.code || h.hotel_code),
      room_code: supplierRateKey,
      price,
      currency,
      timestamp
    }),
    supplier_currency: currency,
    supplier_price: price,
    rate_source_timestamp: timestamp
  };
}

function publicRateSource(meta) {
  return {
    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",
    price_trace_available: true
  };
}

function recordActivity(action, payload, response) {
  const logs = readJSON(SERVICE_ACTIVITY_FILE, []);
  logs.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    action,
    payload,
    response
  });
  writeJSON(SERVICE_ACTIVITY_FILE, logs.slice(0, 3000));
}

function recordSupplierAudit(action, payload) {
  const rows = readJSON(SUPPLIER_AUDIT_FILE, []);
  rows.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    action,
    ...payload
  });
  writeJSON(SUPPLIER_AUDIT_FILE, rows.slice(0, 10000));
}

function mailTo() {
  return clean(process.env.MAIL_TO || "reservations@myspace-hotel.com");
}

function mailFrom() {
  return clean(
    process.env.MAIL_FROM ||
      process.env.SMTP_FROM ||
      process.env.RESEND_FROM ||
      "MySpace Hotel <reservations@myspace-hotel.com>"
  );
}

function htmlEscape(v) {
  return clean(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmailHtml(title, rows) {
  const body = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#0b1d51;width:210px;">${htmlEscape(label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${htmlEscape(value)}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;">
      <div style="max-width:760px;margin:auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="background:#0b1d51;color:#ffffff;padding:22px 26px;">
          <div style="font-size:26px;font-weight:900;">MYSPACE HOTEL</div>
          <div style="font-size:15px;margin-top:6px;">${htmlEscape(title)}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${body}
        </table>
        <div style="padding:18px 26px;color:#64748b;font-size:13px;">
          Sent automatically from MySpace Hotel booking platform.
        </div>
      </div>
    </div>`;
}

async function sendEmailNotification(subject, rows) {
  const to = mailTo();
  const from = mailFrom();
  const html = buildEmailHtml(subject, rows);
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  if (!to) {
    recordActivity("email_skipped", { subject }, { reason: "MAIL_TO missing" });
    return { ok: false, skipped: true, reason: "MAIL_TO missing" };
  }

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from, to, subject, html, text })
      });

      const data = await res.json().catch(() => ({}));
      recordActivity("email_resend", { subject, to }, { ok: res.ok, status: res.status, data });
      return { ok: res.ok, provider: "resend", status: res.status, data };
    } catch (err) {
      recordActivity("email_resend_error", { subject, to }, { error: err.message });
      return { ok: false, provider: "resend", error: err.message };
    }
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && nodemailer) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      const info = await transporter.sendMail({ from, to, subject, html, text });
      recordActivity("email_smtp", { subject, to }, { ok: true, messageId: info.messageId });
      return { ok: true, provider: "smtp", messageId: info.messageId };
    } catch (err) {
      recordActivity("email_smtp_error", { subject, to }, { error: err.message });
      return { ok: false, provider: "smtp", error: err.message };
    }
  }

  recordActivity("email_skipped", { subject, to }, { reason: "No RESEND_API_KEY or SMTP configuration available" });
  return { ok: false, skipped: true, reason: "No email provider configured" };
}

const SANCTIONED_COUNTRIES = new Set([
  "Afghanistan",
  "Belarus",
  "Burundi",
  "Central African Republic",
  "Chad",
  "Congo Republic",
  "Cuba",
  "Democratic Republic of the Congo",
  "Eritrea",
  "Iraq",
  "Iran",
  "Libya",
  "Myanmar",
  "North Korea",
  "Somalia",
  "South Sudan",
  "Sudan",
  "Syria",
  "Russia",
  "Venezuela",
  "Yemen"
]);

function isBlockedCountry(country) {
  return SANCTIONED_COUNTRIES.has(clean(country));
}

function readHotels() {
  const hotels = readJSON(HOTELS_FILE, []);
  return Array.isArray(hotels) ? hotels : [];
}

function firstImage(h) {
  const candidates = [
    h.image,
    h.image_url,
    h.direct_image_url,
    h.main_image,
    h.photo,
    h.thumbnail,
    Array.isArray(h.images) ? h.images[0] : "",
    Array.isArray(h.photos) ? h.photos[0] : ""
  ];

  for (const item of candidates) {
    if (!item) continue;
    if (typeof item === "string" && item.startsWith("http")) return item;
    if (typeof item === "object") {
      const url = item.url || item.image_url || item.path;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }

  return "";
}

function normalizeRoomRate(r, h, index, amount, currency) {
  const meta = supplierMetaFromHotel(h, r, currency);

  return {
    roomCode: clean(r.rate_id || r.rate_key || r.room_code || meta.supplier_rate_key || `ROOM-${index + 1}`),
    roomName: clean(r.room_name || r.roomName || r.rate_name || "Available room"),
    board: clean(r.board_name || r.board || r.rate_name || "Room only"),
    price: money(r.nightly_rate || r.amount || r.price || amount),
    convertedPrice: money(r.nightly_rate || r.amount || r.price || amount),
    displayCurrency: clean(r.currency || currency).toUpperCase(),
    cancellation: clean(r.cancellation || "Cancellation information is shown before you complete your booking."),
    taxes: clean(r.taxes || "Applicable taxes and fees are shown before you complete your booking."),

    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",

    _supplier_name: meta.supplier_name,
    _supplier_code: meta.supplier_code,
    _supplier_hotel_id: meta.supplier_hotel_id,
    _supplier_rate_id: meta.supplier_rate_id,
    _supplier_rate_key: meta.supplier_rate_key,
    _supplier_currency: meta.supplier_currency,
    _supplier_price: meta.supplier_price
  };
}

function normalizeHotel(h, requestedCurrency = "") {
  const rates = Array.isArray(h.rates) ? h.rates : [];
  const firstRate = rates.find((r) => number(r.nightly_rate || r.amount || r.price) > 0) || null;
  const meta = supplierMetaFromHotel(h, firstRate, requestedCurrency);

  const amount = firstRate
    ? money(firstRate.nightly_rate || firstRate.amount || firstRate.price)
    : money(h.price || h.amount || h.nightly_rate || 0);

  const currency = clean(requestedCurrency || firstRate?.currency || h.currency || "GBP").toUpperCase();
  const hotelId = clean(h.hotel_id || h.hotelId || h.id || h.code || h.hotel_code || meta.supplier_hotel_id);

  const rooms = rates.length
    ? rates.slice(0, 8).map((r, index) => normalizeRoomRate(r, h, index, amount, currency))
    : [
        {
          roomCode: "STANDARD",
          roomName: "Available room",
          board: "Room only",
          price: amount,
          convertedPrice: amount,
          displayCurrency: currency,
          cancellation: "Cancellation information is shown before you complete your booking.",
          taxes: "Applicable taxes and fees are shown before you complete your booking.",
          ...publicRateSource(meta),
          _supplier_name: meta.supplier_name,
          _supplier_code: meta.supplier_code,
          _supplier_hotel_id: meta.supplier_hotel_id,
          _supplier_rate_id: meta.supplier_rate_id,
          _supplier_rate_key: meta.supplier_rate_key,
          _supplier_currency: meta.supplier_currency,
          _supplier_price: meta.supplier_price
        }
      ];

  return {
    hotelId,
    hotel_id: hotelId,
    name: clean(h.name || h.hotel_name || h.hotelName || "Hotel"),
    hotel_name: clean(h.name || h.hotel_name || h.hotelName || "Hotel"),
    country: clean(h.country),
    city: clean(h.city),
    area: clean(h.area),
    address: clean(h.address),
    stars: clean(h.stars || h.rating || h.category || ""),
    image: firstImage(h),
    facilities: Array.isArray(h.facilities) ? h.facilities.slice(0, 8) : [],
    rooms,
    availableToBook: amount > 0,
    price: amount,
    currency,
    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",

    _supplier_name: meta.supplier_name,
    _supplier_code: meta.supplier_code,
    _supplier_hotel_id: meta.supplier_hotel_id,
    _supplier_rate_id: meta.supplier_rate_id,
    _supplier_rate_key: meta.supplier_rate_key,
    _supplier_currency: meta.supplier_currency,
    _supplier_price: meta.supplier_price
  };
}

function publicHotel(h) {
  const rooms = Array.isArray(h.rooms)
    ? h.rooms.map((room) => ({
        roomCode: room.roomCode,
        roomName: room.roomName,
        board: room.board,
        price: room.price,
        convertedPrice: room.convertedPrice,
        displayCurrency: room.displayCurrency,
        cancellation: room.cancellation,
        taxes: room.taxes,
        rate_source_id: room.rate_source_id,
        rate_source_timestamp: room.rate_source_timestamp,
        source_health: room.source_health
      }))
    : [];

  return {
    hotelId: h.hotelId,
    hotel_id: h.hotel_id,
    name: h.name,
    hotel_name: h.hotel_name,
    country: h.country,
    city: h.city,
    area: h.area,
    address: h.address,
    stars: h.stars,
    image: h.image,
    facilities: h.facilities,
    rooms,
    availableToBook: h.availableToBook,
    price: h.price,
    currency: h.currency,
    rate_source_id: h.rate_source_id,
    rate_source_timestamp: h.rate_source_timestamp,
    source_health: h.source_health
  };
}

function buildDestinations() {
  const map = new Map();

  for (const h of readHotels()) {
    const country = clean(h.country);
    const city = clean(h.city);

    if (!country || !city) continue;
    if (isBlockedCountry(country)) continue;

    if (!map.has(country)) map.set(country, new Set());
    map.get(country).add(city);
  }

  return [...map.entries()]
    .map(([country, citySet]) => ({
      country,
      cities: [...citySet].sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function fallbackHotels(country, city, currency) {
  const hotel = {
    hotel_id: `MSH-${city || "CITY"}-001`.replace(/\s+/g, "-").toUpperCase(),
    name: `MySpace Hotel Collection - ${city || "Selected Destination"}`,
    country,
    city,
    stars: 4,
    image: "",
    supplier_name: "MYSPACE_INTERNAL",
    supplier_code: "MYSPACE_INTERNAL",
    supplier_hotel_id: `MSH-${city || "CITY"}-001`.replace(/\s+/g, "-").toUpperCase(),
    price: 125,
    currency,
    facilities: ["Wi-Fi", "Reception", "Restaurant", "Comfortable rooms"],
    rates: [
      {
        rate_id: "STANDARD",
        room_name: "Standard Room",
        board_name: "Room only",
        price: 125,
        currency,
        supplier_name: "MYSPACE_INTERNAL",
        supplier_code: "MYSPACE_INTERNAL"
      }
    ]
  };

  return [normalizeHotel(hotel, currency)];
}

function internalSearchHotels(query) {
  const country = clean(query.country);
  const city = clean(query.city);
  const currency = clean(query.currency || "GBP").toUpperCase();

  let hotels = readHotels()
    .filter((h) => !isBlockedCountry(h.country))
    .filter((h) => !country || lower(h.country) === lower(country))
    .filter((h) => !city || lower(h.city) === lower(city))
    .map((h) => normalizeHotel(h, currency))
    .filter((h) => h.name && h.country && h.city);

  hotels.sort((a, b) => {
    if (b.availableToBook !== a.availableToBook) return Number(b.availableToBook) - Number(a.availableToBook);
    return a.name.localeCompare(b.name);
  });

  if (!hotels.length && country && city) hotels = fallbackHotels(country, city, currency);

  return hotels.slice(0, 120);
}

function searchHotels(query) {
  return internalSearchHotels(query).map(publicHotel);
}

function findInternalOffer(payload) {
  const hotelId = clean(payload.hotelId || payload.hotel_id);
  const rateSourceId = clean(payload.rate_source_id || payload.rateSourceId || payload.supplier_rate_id);
  const roomCode = clean(payload.roomCode || payload.room_code);

  const hotels = internalSearchHotels({
    country: payload.country,
    city: payload.city,
    currency: payload.currency
  });

  let hotel =
    hotels.find((h) => clean(h.hotelId) === hotelId || clean(h.hotel_id) === hotelId) ||
    hotels.find((h) => clean(h.rate_source_id) === rateSourceId) ||
    hotels[0];

  if (!hotel) {
    hotel = fallbackHotels(clean(payload.country || "United Kingdom"), clean(payload.city || "London"), clean(payload.currency || "GBP"))[0];
  }

  let room =
    (hotel.rooms || []).find((r) => clean(r.rate_source_id) === rateSourceId) ||
    (hotel.rooms || []).find((r) => clean(r.roomCode) === roomCode) ||
    (hotel.rooms || [])[0];

  if (!room) room = hotel.rooms[0];

  return { hotel, room };
}

function getBaseUrl(req) {
  const envBase =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";

  if (envBase) return envBase.replace(/\/$/, "");
  if (req.headers.origin) return String(req.headers.origin).replace(/\/$/, "");
  return "http://localhost:5173";
}

function stripeCurrency(currency) {
  return clean(currency || "GBP").toLowerCase();
}

function stripeAmount(amount) {
  const n = number(amount);
  const safe = n > 0 ? n : 1;
  return Math.max(50, Math.round(safe * 100));
}

async function createStripeCheckout(req, res) {
  try {
    const paymentLink =
      process.env.STRIPE_PAYMENT_LINK ||
      process.env.VITE_STRIPE_PAYMENT_LINK ||
      process.env.PUBLIC_STRIPE_PAYMENT_LINK ||
      "";

    const secretKey = process.env.STRIPE_SECRET_KEY || "";

    const amount = money(req.body.amount || req.body.total || req.body.price || 0);
    const currency = clean(req.body.currency || "GBP").toUpperCase();
    const hotelName = clean(req.body.hotelName || req.body.hotel || "MySpace Hotel Reservation");
    const customerEmail = clean(req.body.customerEmail || req.body.email || "");
    const customerName = clean(req.body.customerName || "");
    const bookingRef = clean(req.body.bookingRef || makeRef("MSH"));

    if (secretKey) {
      const baseUrl = getBaseUrl(req);
      const body = new URLSearchParams();

      body.append("mode", "payment");
      body.append("success_url", `${baseUrl}/?payment=success&booking=${encodeURIComponent(bookingRef)}`);
      body.append("cancel_url", `${baseUrl}/?payment=cancelled&booking=${encodeURIComponent(bookingRef)}`);
      body.append("line_items[0][quantity]", "1");
      body.append("line_items[0][price_data][currency]", stripeCurrency(currency));
      body.append("line_items[0][price_data][unit_amount]", String(stripeAmount(amount)));
      body.append("line_items[0][price_data][product_data][name]", hotelName);
      body.append("line_items[0][price_data][product_data][description]", "MySpace Hotel reservation");
      body.append("metadata[booking_reference]", bookingRef);
      body.append("metadata[hotel_name]", hotelName);
      body.append("metadata[customer_name]", customerName);
      body.append("metadata[source]", "myspace-hotel");
      body.append("metadata[rate_source_id]", clean(req.body.rate_source_id || ""));
      body.append("metadata[supplier_code]", clean(req.body.supplier_code || ""));

      if (customerEmail) body.append("customer_email", customerEmail);

      const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      });

      const stripeData = await stripeRes.json();

      if (!stripeRes.ok || !stripeData.url) {
        return res.status(400).json({
          ok: false,
          message: "Secure payment could not be started. Please check your payment settings.",
          stripe_error: stripeData?.error?.message || "Stripe checkout session failed."
        });
      }

      recordActivity("stripe_checkout_started", req.body, {
        bookingRef,
        amount,
        currency,
        checkoutSession: stripeData.id
      });

      return res.json({
        ok: true,
        url: stripeData.url,
        bookingRef,
        message: "Secure payment is ready."
      });
    }

    if (paymentLink) {
      return res.json({
        ok: true,
        url: paymentLink,
        bookingRef,
        message: "Secure payment is ready."
      });
    }

    return res.status(400).json({
      ok: false,
      message: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to your environment."
    });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({
      ok: false,
      message: "Secure payment could not be started. Please try again."
    });
  }
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel",
    message: "Welcome to MySpace Hotel.",
    timestamp: nowISO()
  });
});

app.get("/status", (req, res) => {
  const destinations = buildDestinations();
  res.json({
    ok: true,
    service: "MySpace Hotel",
    hotelsAvailable: readHotels().length,
    destinationCountries: destinations.length,
    destinationCities: destinations.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    supplierAuditRecords: readJSON(SUPPLIER_AUDIT_FILE, []).length,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    mailReady: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)),
    mailTo: mailTo(),
    timestamp: nowISO()
  });
});

app.get("/api/status", (req, res) => {
  const destinations = buildDestinations();
  res.json({
    ok: true,
    service: "MySpace Hotel",
    hotelsAvailable: readHotels().length,
    destinationCountries: destinations.length,
    destinationCities: destinations.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    supplierAuditRecords: readJSON(SUPPLIER_AUDIT_FILE, []).length,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    mailReady: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)),
    mailTo: mailTo(),
    timestamp: nowISO()
  });
});

app.get("/api/destinations", (req, res) => res.json(buildDestinations()));
app.get("/destinations", (req, res) => res.json(buildDestinations()));


app.get("/api/hotels/search", (req, res) => {
  const internalHotels = internalSearchHotels(req.query);
  const hotels = internalHotels.map(publicHotel);

  recordActivity("hotel_search", req.query, { count: hotels.length });

  for (const h of internalHotels.slice(0, 120)) {
    recordSupplierAudit("rate_returned_to_search", {
      hotelId: h.hotelId,
      hotelName: h.name,
      country: h.country,
      city: h.city,
      supplier_name: h._supplier_name,
      supplier_code: h._supplier_code,
      supplier_hotel_id: h._supplier_hotel_id,
      supplier_rate_id: h._supplier_rate_id,
      price: h.price,
      currency: h.currency,
      rate_source_timestamp: h.rate_source_timestamp
    });
  }

  res.json({ ok: true, hotels, count: hotels.length, country: clean(req.query.country), city: clean(req.query.city) });
});

app.get("/search", (req, res) => {
  const internalHotels = internalSearchHotels(req.query);
  const hotels = internalHotels.map(publicHotel);
  res.json({ ok: true, hotels, count: hotels.length });
});

app.post("/api/prebook", (req, res) => {
  const { hotel, room } = findInternalOffer(req.body);

  const response = {
    ok: true,
    reviewReference: makeRef("REVIEW"),
    hotelId: hotel.hotelId,
    hotelName: hotel.name,
    roomCode: room.roomCode,
    roomName: room.roomName,
    board: room.board,
    cancellationPolicy: room.cancellation,
    taxesAndFees: room.taxes,
    amount: room.convertedPrice || room.price,
    currency: room.displayCurrency || clean(req.body.currency || "GBP").toUpperCase(),
    rate_source_id: room.rate_source_id || hotel.rate_source_id,
    rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
    source_health: "verified",
    expiresInSeconds: 900,
    message: "Your room details are ready to review before booking."
  };

  recordSupplierAudit("prebook_rate_review", {
    reviewReference: response.reviewReference,
    hotelId: hotel.hotelId,
    hotelName: hotel.name,
    roomCode: room.roomCode,
    supplier_name: room._supplier_name || hotel._supplier_name,
    supplier_code: room._supplier_code || hotel._supplier_code,
    supplier_hotel_id: room._supplier_hotel_id || hotel._supplier_hotel_id,
    supplier_rate_id: room._supplier_rate_id || hotel._supplier_rate_id,
    supplier_rate_key: room._supplier_rate_key || hotel._supplier_rate_key,
    price: response.amount,
    currency: response.currency,
    rate_source_timestamp: response.rate_source_timestamp
  });

  recordActivity("booking_review", req.body, response);
  res.json(response);
});

// MSH SUPPLIER TRACKING OVERRIDE START
function mshAuditFile() {
  return typeof SUPPLIER_AUDIT_FILE !== "undefined"
    ? SUPPLIER_AUDIT_FILE
    : path.join(DATA_DIR, "supplier_rate_audit.json");
}

function mshSupplierDefault() {
  return clean(process.env.DEFAULT_SUPPLIER_NAME || "HOTELBEDS").toUpperCase() || "HOTELBEDS";
}

function mshSupplierCode(name) {
  return clean(name || mshSupplierDefault()).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "HOTELBEDS";
}

function mshAppendSupplierAudit(action, payload) {
  const file = mshAuditFile();
  ensureFile(file, []);
  const rows = readJSON(file, []);
  rows.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    action,
    ...payload
  });
  writeJSON(file, rows.slice(0, 10000));
}

function mshFindPublicOffer(payload) {
  const hotelId = clean(payload.hotelId || payload.hotel_id);
  const rateSourceId = clean(payload.rate_source_id || payload.rateSourceId);
  const roomCode = clean(payload.roomCode || payload.room_code);

  const offers = searchHotels({
    country: payload.country,
    city: payload.city,
    currency: payload.currency || "GBP"
  });

  const hotel =
    offers.find((h) => clean(h.hotelId) === hotelId || clean(h.hotel_id) === hotelId) ||
    offers.find((h) => clean(h.rate_source_id) === rateSourceId) ||
    offers[0] ||
    {};

  const rooms = Array.isArray(hotel.rooms) ? hotel.rooms : [];
  const room =
    rooms.find((r) => clean(r.rate_source_id) === rateSourceId) ||
    rooms.find((r) => clean(r.roomCode) === roomCode) ||
    rooms[0] ||
    {};

  return { hotel, room };
}

function mshSupplierTrackingFromPayload(payload) {
  const found = mshFindPublicOffer(payload);
  const hotel = found.hotel || {};
  const room = found.room || {};

  const rateSourceId = clean(
    payload.rate_source_id ||
    payload.rateSourceId ||
    room.rate_source_id ||
    hotel.rate_source_id ||
    makeRef("RATE")
  );

  const rateTimestamp = clean(
    payload.rate_source_timestamp ||
    payload.rateSourceTimestamp ||
    room.rate_source_timestamp ||
    hotel.rate_source_timestamp ||
    nowISO()
  );

  const supplierName = clean(
    payload.supplier_name ||
    payload.supplier ||
    payload.source ||
    process.env.DEFAULT_SUPPLIER_NAME ||
    "HOTELBEDS"
  ).toUpperCase();

  const supplierCode = clean(
    payload.supplier_code ||
    payload.source_code ||
    mshSupplierCode(supplierName)
  ).toUpperCase();

  return {
    supplier_name: supplierName,
    supplier_code: supplierCode,
    supplier_hotel_id: clean(payload.supplier_hotel_id || payload.supplierHotelId || payload.hotelId || payload.hotel_id || hotel.hotelId || hotel.hotel_id),
    supplier_rate_id: rateSourceId,
    supplier_rate_key: clean(payload.supplier_rate_key || payload.rate_key || payload.roomCode || payload.room_code || room.roomCode),
    supplier_booking_reference: clean(payload.supplier_booking_reference || ""),
    rate_source_id: rateSourceId,
    rate_source_timestamp: rateTimestamp,
    source_health: clean(payload.source_health || room.source_health || hotel.source_health || "verified"),
    selected_room_code: clean(payload.roomCode || payload.room_code || room.roomCode || "STANDARD"),
    selected_room_name: clean(payload.roomName || payload.room_name || room.roomName || "Available room")
  };
}

function mshSearchAuditMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function patchedJson(body) {
    try {
      const hotels = Array.isArray(body && body.hotels) ? body.hotels : [];
      hotels.slice(0, 120).forEach((hotel) => {
        const rooms = Array.isArray(hotel.rooms) ? hotel.rooms : [];
        const room = rooms[0] || {};
        const tracking = mshSupplierTrackingFromPayload({
          ...req.query,
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          roomCode: room.roomCode,
          rate_source_id: room.rate_source_id || hotel.rate_source_id,
          rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
          source_health: room.source_health || hotel.source_health
        });

        mshAppendSupplierAudit("rate_returned_to_search", {
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          country: hotel.country,
          city: hotel.city,
          price: hotel.price,
          currency: hotel.currency,
          supplier_name: tracking.supplier_name,
          supplier_code: tracking.supplier_code,
          supplier_hotel_id: tracking.supplier_hotel_id,
          supplier_rate_id: tracking.supplier_rate_id,
          rate_source_id: tracking.rate_source_id,
          rate_source_timestamp: tracking.rate_source_timestamp,
          source_health: tracking.source_health
        });
      });
    } catch (err) {
      recordActivity("supplier_search_audit_error", { url: req.originalUrl }, { error: err.message });
    }

    return originalJson(body);
  };

  next();
}

app.use("/search", mshSearchAuditMiddleware);
app.use("/api/hotels/search", mshSearchAuditMiddleware);

app.post("/api/book", async (req, res) => {
  const bookingRef = makeRef("MSH");
  const confirmationRef = makeRef("CONF");
  const tracking = mshSupplierTrackingFromPayload(req.body);
  const found = mshFindPublicOffer(req.body);
  const foundHotel = found.hotel || {};
  const foundRoom = found.room || {};

  const booking = {
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    createdAt: nowISO(),

    hotelId: clean(req.body.hotelId || req.body.hotel_id || foundHotel.hotelId || foundHotel.hotel_id),
    hotelName: clean(req.body.hotelName || req.body.hotel || foundHotel.name || foundHotel.hotel_name),
    roomCode: tracking.selected_room_code,
    roomName: tracking.selected_room_name,

    country: clean(req.body.country || foundHotel.country),
    city: clean(req.body.city || foundHotel.city),
    checkIn: clean(req.body.checkIn || req.body.checkin),
    checkOut: clean(req.body.checkOut || req.body.checkout),
    guests: number(req.body.guests),
    rooms: number(req.body.rooms),
    amount: money(req.body.amount || req.body.total || foundRoom.convertedPrice || foundRoom.price || foundHotel.price),
    currency: clean(req.body.currency || foundRoom.displayCurrency || foundHotel.currency || "GBP").toUpperCase(),

    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    customerPhone: clean(req.body.customerPhone),
    specialRequests: clean(req.body.specialRequests),

    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health,

    internalSupplierTracking: {
      supplier_name: tracking.supplier_name,
      supplier_code: tracking.supplier_code,
      supplier_hotel_id: tracking.supplier_hotel_id,
      supplier_rate_id: tracking.supplier_rate_id,
      supplier_rate_key: tracking.supplier_rate_key,
      supplier_booking_reference: tracking.supplier_booking_reference,
      rate_source_id: tracking.rate_source_id,
      rate_source_timestamp: tracking.rate_source_timestamp
    },

    selected_supplier_offer: {
      supplier_code: tracking.supplier_code,
      supplier_hotel_id: tracking.supplier_hotel_id,
      supplier_rate_id: tracking.supplier_rate_id,
      rate_source_id: tracking.rate_source_id,
      rate_source_timestamp: tracking.rate_source_timestamp
    }
  };

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  mshAppendSupplierAudit("booking_prepared_supplier_source", {
    bookingRef,
    confirmationReference: confirmationRef,
    hotelId: booking.hotelId,
    hotelName: booking.hotelName,
    roomCode: booking.roomCode,
    roomName: booking.roomName,
    country: booking.country,
    city: booking.city,
    amount: booking.amount,
    currency: booking.currency,
    customerEmail: booking.customerEmail,
    supplier_name: tracking.supplier_name,
    supplier_code: tracking.supplier_code,
    supplier_hotel_id: tracking.supplier_hotel_id,
    supplier_rate_id: tracking.supplier_rate_id,
    supplier_rate_key: tracking.supplier_rate_key,
    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health
  });

  const emailResult = await sendEmailNotification("New booking prepared - MySpace Hotel", [
    ["Booking reference", booking.bookingRef],
    ["Hotel", booking.hotelName],
    ["Destination", `${booking.city}, ${booking.country}`],
    ["Check-in", booking.checkIn],
    ["Check-out", booking.checkOut],
    ["Guests", String(booking.guests)],
    ["Rooms", String(booking.rooms)],
    ["Amount", `${booking.currency} ${booking.amount}`],
    ["Customer name", booking.customerName],
    ["Customer email", booking.customerEmail],
    ["Customer phone", booking.customerPhone],
    ["Special requests", booking.specialRequests],
    ["Internal supplier", tracking.supplier_name],
    ["Supplier code", tracking.supplier_code],
    ["Supplier hotel ID", tracking.supplier_hotel_id],
    ["Supplier rate ID", tracking.supplier_rate_id],
    ["Rate source ID", tracking.rate_source_id],
    ["Rate timestamp", tracking.rate_source_timestamp],
    ["Created", booking.createdAt]
  ]);

  const affiliateConversion = recordAffiliateConversionIfPresent({ ...booking, affiliateCode: req.body.affiliateCode || req.body.affiliate_code || req.body.ref });

  const response = {
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health,
    emailSent: Boolean(emailResult.ok),
    affiliateTracked: Boolean(affiliateConversion),
    affiliateCode: affiliateConversion?.affiliateCode || "",
    message: "Your reservation has been prepared for secure payment."
  };

  recordActivity("booking_prepared", req.body, response);
  res.json(response);
});
// MSH SUPPLIER TRACKING OVERRIDE END

app.post("/api/book", async (req, res) => {
  const bookingRef = makeRef("MSH");
  const confirmationRef = makeRef("CONF");
  const { hotel, room } = findInternalOffer(req.body);

  const supplierSnapshot = {
    supplier_name: room._supplier_name || hotel._supplier_name,
    supplier_code: room._supplier_code || hotel._supplier_code,
    supplier_hotel_id: room._supplier_hotel_id || hotel._supplier_hotel_id,
    supplier_rate_id: room._supplier_rate_id || hotel._supplier_rate_id,
    supplier_rate_key: room._supplier_rate_key || hotel._supplier_rate_key,
    supplier_currency: room._supplier_currency || hotel._supplier_currency,
    supplier_price: room._supplier_price || hotel._supplier_price,
    rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
    supplier_booking_reference: clean(req.body.supplier_booking_reference || "")
  };

  const booking = {
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    createdAt: nowISO(),
    hotelId: clean(req.body.hotelId || hotel.hotelId),
    hotelName: clean(req.body.hotelName || hotel.name),
    roomCode: clean(req.body.roomCode || room.roomCode),
    roomName: clean(req.body.roomName || room.roomName),
    country: clean(req.body.country || hotel.country),
    city: clean(req.body.city || hotel.city),
    checkIn: clean(req.body.checkIn || req.body.checkin),
    checkOut: clean(req.body.checkOut || req.body.checkout),
    guests: number(req.body.guests),
    rooms: number(req.body.rooms),
    amount: money(req.body.amount),
    currency: clean(req.body.currency || room.displayCurrency || hotel.currency || "GBP").toUpperCase(),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    customerPhone: clean(req.body.customerPhone),
    specialRequests: clean(req.body.specialRequests),

    internalSupplierTracking: supplierSnapshot,
    selected_supplier_offer: {
      supplier_code: supplierSnapshot.supplier_code,
      supplier_hotel_id: supplierSnapshot.supplier_hotel_id,
      supplier_rate_id: supplierSnapshot.supplier_rate_id,
      rate_source_timestamp: supplierSnapshot.rate_source_timestamp
    }
  };

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  recordSupplierAudit("booking_prepared_supplier_source", {
    bookingRef,
    confirmationReference: confirmationRef,
    hotelId: booking.hotelId,
    hotelName: booking.hotelName,
    roomCode: booking.roomCode,
    supplier_name: supplierSnapshot.supplier_name,
    supplier_code: supplierSnapshot.supplier_code,
    supplier_hotel_id: supplierSnapshot.supplier_hotel_id,
    supplier_rate_id: supplierSnapshot.supplier_rate_id,
    supplier_rate_key: supplierSnapshot.supplier_rate_key,
    supplier_booking_reference: supplierSnapshot.supplier_booking_reference,
    amount: booking.amount,
    currency: booking.currency,
    customerEmail: booking.customerEmail,
    rate_source_timestamp: supplierSnapshot.rate_source_timestamp
  });

  const emailResult = await sendEmailNotification("New booking prepared - MySpace Hotel", [
    ["Booking reference", booking.bookingRef],
    ["Hotel", booking.hotelName],
    ["Destination", `${booking.city}, ${booking.country}`],
    ["Check-in", booking.checkIn],
    ["Check-out", booking.checkOut],
    ["Guests", String(booking.guests)],
    ["Rooms", String(booking.rooms)],
    ["Amount", `${booking.currency} ${booking.amount}`],
    ["Customer name", booking.customerName],
    ["Customer email", booking.customerEmail],
    ["Customer phone", booking.customerPhone],
    ["Special requests", booking.specialRequests],
    ["Internal supplier", supplierSnapshot.supplier_name],
    ["Supplier code", supplierSnapshot.supplier_code],
    ["Supplier hotel ID", supplierSnapshot.supplier_hotel_id],
    ["Supplier rate ID", supplierSnapshot.supplier_rate_id],
    ["Rate timestamp", supplierSnapshot.rate_source_timestamp],
    ["Created", booking.createdAt]
  ]);

  const affiliateConversion = recordAffiliateConversionIfPresent({ ...booking, affiliateCode: req.body.affiliateCode || req.body.affiliate_code || req.body.ref });

  const response = {
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    rate_source_id: supplierSnapshot.supplier_rate_id,
    rate_source_timestamp: supplierSnapshot.rate_source_timestamp,
    emailSent: Boolean(emailResult.ok),
    affiliateTracked: Boolean(affiliateConversion),
    affiliateCode: affiliateConversion?.affiliateCode || "",
    message: "Your reservation has been prepared for secure payment."
  };

  recordActivity("booking_prepared", req.body, response);
  res.json(response);
});


// MSH STRIPE WEBHOOK AFFILIATE PAID START
function markBookingPaidFromStripe(bookingRef, stripePayload) {
  const ref = clean(bookingRef);
  if (!ref) return { ok: false, reason: "Missing booking reference" };

  const bookings = readJSON(BOOKINGS_FILE, []);
  const index = bookings.findIndex((b) => clean(b.bookingRef) === ref);

  if (index >= 0) {
    bookings[index] = {
      ...bookings[index],
      status: "PAID",
      paidAt: nowISO(),
      stripeSessionId: clean(stripePayload.stripeSessionId),
      stripePaymentIntent: clean(stripePayload.stripePaymentIntent),
      stripePaymentStatus: clean(stripePayload.stripePaymentStatus || "paid"),
      paymentReference: clean(stripePayload.paymentReference || stripePayload.stripePaymentIntent || stripePayload.stripeSessionId)
    };

    writeJSON(BOOKINGS_FILE, bookings);
  }

  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const conversionIndex = conversions.findIndex((x) => clean(x.bookingRef) === ref);

  if (conversionIndex >= 0) {
    conversions[conversionIndex] = {
      ...conversions[conversionIndex],
      status: "PAID",
      paidAt: nowISO(),
      paymentReference: clean(stripePayload.paymentReference || stripePayload.stripePaymentIntent || stripePayload.stripeSessionId),
      stripeSessionId: clean(stripePayload.stripeSessionId),
      stripePaymentIntent: clean(stripePayload.stripePaymentIntent)
    };

    writeJSON(AFFILIATE_CONVERSIONS_FILE, conversions);
  }

  recordActivity("stripe_payment_confirmed", { bookingRef: ref }, {
    bookingUpdated: index >= 0,
    affiliateConversionUpdated: conversionIndex >= 0,
    stripeSessionId: clean(stripePayload.stripeSessionId),
    stripePaymentIntent: clean(stripePayload.stripePaymentIntent)
  });

  return {
    ok: true,
    bookingUpdated: index >= 0,
    affiliateConversionUpdated: conversionIndex >= 0
  };
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
    const signature = req.headers["stripe-signature"];

    let event;

    if (webhookSecret && stripeSecretKey && signature) {
      const verifyRes = await fetch("https://api.stripe.com/v1/webhook_endpoints", {
        headers: { Authorization: `Bearer ${stripeSecretKey}` }
      }).catch(() => null);

      try {
        const Stripe = require("stripe");
        const stripe = Stripe(stripeSecretKey);
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
      } catch (err) {
        recordActivity("stripe_webhook_signature_failed", {}, { error: err.message });
        return res.status(400).json({ ok: false, message: "Invalid Stripe webhook signature." });
      }
    } else {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
      event = JSON.parse(raw || "{}");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data && event.data.object ? event.data.object : {};
      const bookingRef =
        clean(session.metadata?.booking_reference) ||
        clean(session.client_reference_id) ||
        clean(session.metadata?.bookingRef);

      const result = markBookingPaidFromStripe(bookingRef, {
        stripeSessionId: session.id,
        stripePaymentIntent: session.payment_intent,
        stripePaymentStatus: session.payment_status,
        paymentReference: session.payment_intent || session.id
      });

      return res.json({ ok: true, handled: true, event: event.type, result });
    }

    return res.json({ ok: true, handled: false, event: event.type || "unknown" });
  } catch (err) {
    recordActivity("stripe_webhook_error", {}, { error: err.message });
    return res.status(500).json({ ok: false, message: "Stripe webhook could not be processed." });
  }
});

app.post("/api/internal/stripe-webhook-test-paid", (req, res) => {
  const bookingRef = clean(req.body.bookingRef || req.body.booking_reference);

  if (!bookingRef) {
    return res.status(400).json({ ok: false, message: "bookingRef is required." });
  }

  const result = markBookingPaidFromStripe(bookingRef, {
    stripeSessionId: clean(req.body.stripeSessionId || "LOCAL-TEST-SESSION"),
    stripePaymentIntent: clean(req.body.stripePaymentIntent || "LOCAL-TEST-PI"),
    stripePaymentStatus: "paid",
    paymentReference: clean(req.body.paymentReference || "LOCAL-TEST-PAYMENT")
  });

  res.json({ ok: true, result });
});
// MSH STRIPE WEBHOOK AFFILIATE PAID END


// MSH AFFILIATE TEST BOOKING MODE START
app.post("/api/internal/affiliate-test-booking-checkout", async (req, res) => {
  try {
    const affiliateCode = clean(req.body.affiliateCode || req.body.ref || "LUKAKA-91F16B").toUpperCase();
    const customerEmail = clean(req.body.customerEmail || "reservations@myspace-hotel.com");
    const customerName = clean(req.body.customerName || "Affiliate Test Guest");

    const affiliates = readAffiliates();
    const affiliate = affiliates.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

    if (!affiliate || clean(affiliate.status).toUpperCase() !== "APPROVED") {
      return res.status(400).json({
        ok: false,
        message: "Approved affiliate code was not found."
      });
    }

    const bookingRef = `AFF-TEST-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const amount = 0.5;
    const currency = "GBP";
    const commissionRate = 3;
    const commissionAmount = money(amount * commissionRate / 100);

    const booking = {
      id: crypto.randomUUID(),
      bookingRef,
      confirmationReference: `TEST-${Date.now()}`,
      status: "PENDING_PAYMENT",
      createdAt: nowISO(),
      hotelId: "AFFILIATE-TEST-HOTEL",
      hotelName: "Affiliate Test Booking",
      country: "United Kingdom",
      city: "London",
      customerName,
      customerEmail,
      amount,
      currency,
      affiliateCode,
      testMode: true,
      note: "Internal low-value affiliate test booking."
    };

    const bookings = readJSON(BOOKINGS_FILE, []);
    bookings.unshift(booking);
    writeJSON(BOOKINGS_FILE, bookings);

    const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
    conversions.unshift({
      id: crypto.randomUUID(),
      createdAt: nowISO(),
      affiliateCode,
      affiliateFound: true,
      affiliateStatus: "APPROVED",
      bookingRef,
      hotelName: booking.hotelName,
      customerEmail,
      amount,
      currency,
      commissionRate,
      commissionAmount,
      status: "PENDING_PAYMENT",
      testMode: true
    });
    writeJSON(AFFILIATE_CONVERSIONS_FILE, conversions);

    req.body = {
      bookingRef,
      hotelName: booking.hotelName,
      customerEmail,
      amount,
      currency,
      affiliateCode,
      testMode: true
    };

    return createStripeCheckout(req, res);
  } catch (err) {
    console.error("Affiliate test checkout error:", err);
    return res.status(500).json({
      ok: false,
      message: "Affiliate test checkout could not be created."
    });
  }
});
// MSH AFFILIATE TEST BOOKING MODE END

app.post("/api/create-checkout-session", createStripeCheckout);
app.post("/api/stripe/checkout", createStripeCheckout);
app.post("/create-checkout-session", createStripeCheckout);

app.get("/api/bookings", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  res.json({ ok: true, total: bookings.length, bookings });
});

app.get("/api/bookings/:reference", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.bookingRef === req.params.reference);

  if (!booking) return res.status(404).json({ ok: false, message: "We could not find a booking with that reference." });

  res.json({ ok: true, booking });
});

app.get("/api/internal/supplier-audit", (req, res) => {
  const rows = readJSON(SUPPLIER_AUDIT_FILE, []);
  res.json({ ok: true, total: rows.length, audit: rows });
});

app.post("/api/cancel-booking", async (req, res) => {
  const bookingRef = clean(req.body.bookingRef || req.body.booking_reference);
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.bookingRef === bookingRef);

  if (!booking) return res.status(404).json({ ok: false, message: "We could not find a booking with that reference." });

  booking.status = "CANCELLED";
  booking.cancelledAt = nowISO();
  booking.cancellationReason = clean(req.body.reason || "Customer request");

  writeJSON(BOOKINGS_FILE, bookings);

  recordSupplierAudit("booking_cancelled_supplier_source", {
    bookingRef,
    hotelName: booking.hotelName,
    supplier_name: booking.internalSupplierTracking?.supplier_name || "",
    supplier_code: booking.internalSupplierTracking?.supplier_code || "",
    supplier_hotel_id: booking.internalSupplierTracking?.supplier_hotel_id || "",
    supplier_rate_id: booking.internalSupplierTracking?.supplier_rate_id || "",
    supplier_booking_reference: booking.internalSupplierTracking?.supplier_booking_reference || "",
    cancelledAt: booking.cancelledAt,
    reason: booking.cancellationReason
  });

  await sendEmailNotification("Booking cancelled - MySpace Hotel", [
    ["Booking reference", booking.bookingRef],
    ["Hotel", booking.hotelName],
    ["Customer", booking.customerName],
    ["Customer email", booking.customerEmail],
    ["Reason", booking.cancellationReason],
    ["Cancelled at", booking.cancelledAt],
    ["Internal supplier", booking.internalSupplierTracking?.supplier_name || ""],
    ["Supplier hotel ID", booking.internalSupplierTracking?.supplier_hotel_id || ""],
    ["Supplier rate ID", booking.internalSupplierTracking?.supplier_rate_id || ""]
  ]);

  res.json({ ok: true, bookingRef, status: "CANCELLED", message: "Your booking has been cancelled." });
});

app.post("/api/partner-applications", async (req, res) => {
  const rows = readJSON(PARTNERS_FILE, []);
  const row = {
    id: crypto.randomUUID(),
    created_at: nowISO(),
    partner_type: clean(req.body.partner_type),
    business_name: clean(req.body.business_name),
    contact_name: clean(req.body.contact_name),
    contact_email: clean(req.body.contact_email),
    phone: clean(req.body.phone),
    country: clean(req.body.country),
    city: clean(req.body.city),
    website: clean(req.body.website),
    message: clean(req.body.message)
  };

  rows.unshift(row);
  writeJSON(PARTNERS_FILE, rows.slice(0, 3000));

  const reference = `PARTNER-${row.id.slice(0, 8).toUpperCase()}`;

  const emailResult = await sendEmailNotification("New partnership enquiry - MySpace Hotel", [
    ["Reference", reference],
    ["Partner type", row.partner_type],
    ["Business name", row.business_name],
    ["Contact name", row.contact_name],
    ["Contact email", row.contact_email],
    ["Phone", row.phone],
    ["Country", row.country],
    ["City", row.city],
    ["Website", row.website],
    ["Message", row.message],
    ["Received", row.created_at]
  ]);

  res.json({
    ok: true,
    emailSent: Boolean(emailResult.ok),
    message: "Thank you. Your partnership enquiry has been received by MySpace Hotel.",
    reference
  });
});

app.post("/api/feedback", async (req, res) => {
  const rows = readJSON(FEEDBACK_FILE, []);
  const row = {
    id: crypto.randomUUID(),
    created_at: nowISO(),
    name: clean(req.body.name),
    email: clean(req.body.email),
    message: clean(req.body.message)
  };

  rows.unshift(row);
  writeJSON(FEEDBACK_FILE, rows.slice(0, 3000));

  const emailResult = await sendEmailNotification("New guest review - MySpace Hotel", [
    ["Name", row.name],
    ["Email", row.email],
    ["Message", row.message],
    ["Received", row.created_at]
  ]);

  res.json({
    ok: true,
    emailSent: Boolean(emailResult.ok),
    message: "Thank you. Your message has been received by MySpace Hotel."
  });
});


// MSH SUPPLIER REGISTRY START
const SUPPLIER_REGISTRY_FILE = path.join(DATA_DIR, "supplier_registry.json");

ensureFile(SUPPLIER_REGISTRY_FILE, [
  {
    supplier_code: "HOTELBEDS",
    supplier_name: "Hotelbeds",
    supplier_type: "bedbank",
    status: "active",
    priority: 1,
    customer_visible: false,
    notes: "Primary hotel inventory and rate source."
  },
  {
    supplier_code: "WEBBEDS",
    supplier_name: "WebBeds",
    supplier_type: "bedbank",
    status: "contracted_pending_integration",
    priority: 2,
    customer_visible: false,
    notes: "Contract signed. Integration pending."
  },
  {
    supplier_code: "HYPERGUEST",
    supplier_name: "HyperGuest",
    supplier_type: "direct_connectivity",
    status: "contracted_pending_integration",
    priority: 3,
    customer_visible: false,
    notes: "Direct hotel connectivity partner."
  },
  {
    supplier_code: "HOTELRUNNER",
    supplier_name: "HotelRunner",
    supplier_type: "channel_connectivity",
    status: "onboarding",
    priority: 4,
    customer_visible: false,
    notes: "Partner onboarding requested."
  },
  {
    supplier_code: "SITEMINDER",
    supplier_name: "SiteMinder",
    supplier_type: "channel_manager",
    status: "onboarding",
    priority: 5,
    customer_visible: false,
    notes: "Channel manager partnership in progress."
  },
  {
    supplier_code: "DIRECT_CONTRACT",
    supplier_name: "Direct Hotel Contract",
    supplier_type: "direct_contract",
    status: "planned",
    priority: 6,
    customer_visible: false,
    notes: "For direct hotel agreements."
  },
  {
    supplier_code: "MYSPACE_INTERNAL",
    supplier_name: "MySpace Internal",
    supplier_type: "internal",
    status: "active",
    priority: 99,
    customer_visible: false,
    notes: "Internal fallback or manually controlled inventory."
  }
]);

function readSupplierRegistry() {
  const rows = readJSON(SUPPLIER_REGISTRY_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function supplierRegistryMap() {
  const map = new Map();
  for (const supplier of readSupplierRegistry()) {
    const code = clean(supplier.supplier_code).toUpperCase();
    if (code) map.set(code, supplier);
  }
  return map;
}

function resolveSupplierForAdmin(tracking) {
  const registry = supplierRegistryMap();
  const code = clean(
    tracking?.supplier_code ||
    tracking?.supplier_name ||
    "HOTELBEDS"
  ).toUpperCase();

  const supplier = registry.get(code) || registry.get("HOTELBEDS") || {
    supplier_code: code || "HOTELBEDS",
    supplier_name: code || "Hotelbeds",
    supplier_type: "unknown",
    status: "unknown",
    priority: 99,
    customer_visible: false
  };

  return {
    supplier_code: clean(supplier.supplier_code || code).toUpperCase(),
    supplier_name: clean(supplier.supplier_name || supplier.supplier_code || code),
    supplier_type: clean(supplier.supplier_type || "unknown"),
    status: clean(supplier.status || "unknown"),
    priority: number(supplier.priority || 99),
    customer_visible: Boolean(supplier.customer_visible),
    notes: clean(supplier.notes)
  };
}

app.get("/api/internal/supplier-registry", (req, res) => {
  const suppliers = readSupplierRegistry().sort((a, b) => number(a.priority) - number(b.priority));
  res.json({
    ok: true,
    total: suppliers.length,
    suppliers
  });
});

app.post("/api/internal/supplier-registry", (req, res) => {
  const rows = readSupplierRegistry();
  const supplierCode = clean(req.body.supplier_code || req.body.supplierCode).toUpperCase();

  if (!supplierCode) {
    return res.status(400).json({
      ok: false,
      message: "supplier_code is required."
    });
  }

  const incoming = {
    supplier_code: supplierCode,
    supplier_name: clean(req.body.supplier_name || req.body.supplierName || supplierCode),
    supplier_type: clean(req.body.supplier_type || req.body.supplierType || "unknown"),
    status: clean(req.body.status || "active"),
    priority: number(req.body.priority || 99),
    customer_visible: Boolean(req.body.customer_visible),
    notes: clean(req.body.notes)
  };

  const index = rows.findIndex((x) => clean(x.supplier_code).toUpperCase() === supplierCode);

  if (index >= 0) rows[index] = { ...rows[index], ...incoming, updated_at: nowISO() };
  else rows.unshift({ ...incoming, created_at: nowISO() });

  writeJSON(SUPPLIER_REGISTRY_FILE, rows);

  res.json({
    ok: true,
    supplier: index >= 0 ? rows[index] : rows[0],
    message: "Supplier registry updated."
  });
});


// MSH MULTI SUPPLIER COMPARE START
function mshComparableHotelName(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function mshBuildSupplierCompareOffers(query) {
  const country = clean(query.country);
  const city = clean(query.city);
  const currency = clean(query.currency || "GBP").toUpperCase();
  const requestedHotelId = clean(query.hotelId || query.hotel_id);
  const requestedHotelName = mshComparableHotelName(query.hotelName || query.hotel_name);

  const hotels = searchHotels({ country, city, currency });

  const selected =
    hotels.find((h) => clean(h.hotelId) === requestedHotelId || clean(h.hotel_id) === requestedHotelId) ||
    hotels.find((h) => mshComparableHotelName(h.name || h.hotel_name) === requestedHotelName) ||
    hotels[0];

  if (!selected) {
    return {
      selected_hotel: null,
      winning_offer: null,
      competing_offers: [],
      customer_offer: null
    };
  }

  const selectedName = mshComparableHotelName(selected.name || selected.hotel_name);

  const sameHotelOffers = hotels
    .filter((hotel) => {
      const nameMatch = mshComparableHotelName(hotel.name || hotel.hotel_name) === selectedName;
      const idMatch = clean(hotel.hotelId) === clean(selected.hotelId) || clean(hotel.hotel_id) === clean(selected.hotel_id);
      return nameMatch || idMatch;
    })
    .flatMap((hotel) => {
      const rooms = Array.isArray(hotel.rooms) && hotel.rooms.length ? hotel.rooms : [{}];

      return rooms.map((room, index) => {
        const price = money(room.convertedPrice || room.price || hotel.price);
        const rateSourceId = clean(room.rate_source_id || hotel.rate_source_id || makeRef("RATE"));
        const timestamp = clean(room.rate_source_timestamp || hotel.rate_source_timestamp || nowISO());

        const tracking = mshSupplierTrackingFromPayload({
          ...query,
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          roomCode: room.roomCode || `ROOM-${index + 1}`,
          roomName: room.roomName || "Available room",
          rate_source_id: rateSourceId,
          rate_source_timestamp: timestamp,
          source_health: room.source_health || hotel.source_health || "verified"
        });

        const supplier = resolveSupplierForAdmin(tracking);

        return {
          compare_offer_id: makeRef("OFFER"),
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          country: hotel.country,
          city: hotel.city,
          roomCode: room.roomCode || `ROOM-${index + 1}`,
          roomName: room.roomName || "Available room",
          board: room.board || "Room only",
          amount: price,
          currency: clean(room.displayCurrency || hotel.currency || currency).toUpperCase(),
          cancellation: room.cancellation || "",
          taxes: room.taxes || "",
          rate_source_id: rateSourceId,
          rate_source_timestamp: timestamp,
          source_health: room.source_health || hotel.source_health || "verified",
          supplier,
          internal_supplier_tracking: {
            supplier_code: supplier.supplier_code,
            supplier_name: supplier.supplier_name,
            supplier_hotel_id: tracking.supplier_hotel_id,
            supplier_rate_id: tracking.supplier_rate_id,
            rate_source_id: tracking.rate_source_id,
            rate_source_timestamp: tracking.rate_source_timestamp
          }
        };
      });
    })
    .filter((offer) => offer.amount > 0)
    .sort((a, b) => a.amount - b.amount);

  const winning = sameHotelOffers[0] || null;

  const customerOffer = winning
    ? {
        hotelId: winning.hotelId,
        hotelName: winning.hotelName,
        country: winning.country,
        city: winning.city,
        roomCode: winning.roomCode,
        roomName: winning.roomName,
        board: winning.board,
        amount: winning.amount,
        currency: winning.currency,
        rate_source_id: winning.rate_source_id,
        rate_source_timestamp: winning.rate_source_timestamp,
        source_health: winning.source_health,
        message: "Best available stay option selected for review."
      }
    : null;

  return {
    selected_hotel: {
      hotelId: selected.hotelId || selected.hotel_id,
      hotelName: selected.name || selected.hotel_name,
      country: selected.country,
      city: selected.city
    },
    winning_offer: winning,
    competing_offers: sameHotelOffers,
    customer_offer: customerOffer
  };
}

app.get("/api/internal/compare-supplier-rates", (req, res) => {
  const result = mshBuildSupplierCompareOffers(req.query);

  if (!result.selected_hotel) {
    return res.status(404).json({
      ok: false,
      message: "No comparable hotel offers were found."
    });
  }

  mshAppendSupplierAudit("supplier_rate_comparison_requested", {
    country: clean(req.query.country),
    city: clean(req.query.city),
    hotelId: result.selected_hotel.hotelId,
    hotelName: result.selected_hotel.hotelName,
    winning_supplier_code: result.winning_offer?.supplier?.supplier_code || "",
    winning_supplier_name: result.winning_offer?.supplier?.supplier_name || "",
    winning_amount: result.winning_offer?.amount || 0,
    winning_currency: result.winning_offer?.currency || "",
    competing_offer_count: result.competing_offers.length,
    rate_source_id: result.winning_offer?.rate_source_id || "",
    rate_source_timestamp: result.winning_offer?.rate_source_timestamp || ""
  });

  res.json({
    ok: true,
    generated_at: nowISO(),
    selected_hotel: result.selected_hotel,
    winning_offer: result.winning_offer,
    competing_offers: result.competing_offers,
    customer_offer: result.customer_offer
  });
});

app.get("/api/compare-prices", (req, res) => {
  const result = mshBuildSupplierCompareOffers(req.query);

  if (!result.selected_hotel) {
    return res.status(404).json({
      ok: false,
      message: "No comparable hotel offers were found."
    });
  }

  res.json({
    ok: true,
    selected_hotel: result.selected_hotel,
    customer_offer: result.customer_offer,
    comparison_summary: {
      compared_options: result.competing_offers.length,
      best_amount: result.customer_offer?.amount || 0,
      currency: result.customer_offer?.currency || clean(req.query.currency || "GBP").toUpperCase(),
      message: "Best available stay option selected for review."
    }
  });
});
// MSH MULTI SUPPLIER COMPARE END

app.get("/api/internal/supplier-dashboard", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const audit = readJSON(SUPPLIER_AUDIT_FILE, []);
  const suppliers = readSupplierRegistry();
  const supplierStats = new Map();

  for (const supplier of suppliers) {
    const code = clean(supplier.supplier_code).toUpperCase();
    if (!code) continue;

    supplierStats.set(code, {
      ...supplier,
      supplier_code: code,
      searches: 0,
      bookings: 0,
      pending_payment: 0,
      cancelled: 0,
      total_amount: 0,
      currencies: {}
    });
  }

  function ensureSupplierStat(code, tracking) {
    const resolved = resolveSupplierForAdmin({
      supplier_code: code,
      supplier_name: tracking?.supplier_name
    });

    const finalCode = resolved.supplier_code || "UNKNOWN";

    if (!supplierStats.has(finalCode)) {
      supplierStats.set(finalCode, {
        ...resolved,
        searches: 0,
        bookings: 0,
        pending_payment: 0,
        cancelled: 0,
        total_amount: 0,
        currencies: {}
      });
    }

    return supplierStats.get(finalCode);
  }

  for (const item of audit) {
    const code = clean(item.supplier_code || item.supplier_name || "HOTELBEDS").toUpperCase();
    const stat = ensureSupplierStat(code, item);
    if (String(item.action || "").includes("rate_returned")) stat.searches += 1;
  }

  for (const booking of bookings) {
    const tracking = booking.internalSupplierTracking || {};
    const code = clean(tracking.supplier_code || tracking.supplier_name || "HOTELBEDS").toUpperCase();
    const stat = ensureSupplierStat(code, tracking);

    stat.bookings += 1;
    if (booking.status === "PENDING_PAYMENT") stat.pending_payment += 1;
    if (booking.status === "CANCELLED") stat.cancelled += 1;

    const amount = money(booking.amount);
    const currency = clean(booking.currency || "GBP").toUpperCase();

    stat.total_amount += amount;
    stat.currencies[currency] = money((stat.currencies[currency] || 0) + amount);
  }

  const newestBookings = bookings.slice(0, 50).map((booking) => {
    const tracking = booking.internalSupplierTracking || {};
    const supplier = resolveSupplierForAdmin(tracking);

    return {
      bookingRef: booking.bookingRef,
      confirmationReference: booking.confirmationReference,
      status: booking.status,
      createdAt: booking.createdAt,
      hotelId: booking.hotelId,
      hotelName: booking.hotelName,
      roomCode: booking.roomCode,
      roomName: booking.roomName,
      country: booking.country,
      city: booking.city,
      amount: booking.amount,
      currency: booking.currency,
      customerEmail: booking.customerEmail,
      rate_source_id: booking.rate_source_id || tracking.rate_source_id,
      rate_source_timestamp: booking.rate_source_timestamp || tracking.rate_source_timestamp,
      supplier
    };
  });

  res.json({
    ok: true,
    generated_at: nowISO(),
    totals: {
      suppliers: suppliers.length,
      bookings: bookings.length,
      audit_records: audit.length
    },
    supplier_stats: Array.from(supplierStats.values()).sort((a, b) => number(a.priority) - number(b.priority)),
    newest_bookings: newestBookings
  });
});
// MSH SUPPLIER REGISTRY END


// MSH AFFILIATE NETWORK START
const AFFILIATES_FILE = path.join(DATA_DIR, "affiliates.json");
const AFFILIATE_CLICKS_FILE = path.join(DATA_DIR, "affiliate_clicks.json");
const AFFILIATE_CONVERSIONS_FILE = path.join(DATA_DIR, "affiliate_conversions.json");

ensureFile(AFFILIATES_FILE, []);
ensureFile(AFFILIATE_CLICKS_FILE, []);
ensureFile(AFFILIATE_CONVERSIONS_FILE, []);

function makeAffiliateCode(name) {
  const base = clean(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10) || "AFFILIATE";

  return `${base}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function readAffiliates() {
  const rows = readJSON(AFFILIATES_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function publicAffiliate(row) {
  return {
    affiliateCode: row.affiliateCode,
    status: row.status,
    businessName: row.businessName,
    contactName: row.contactName,
    website: row.website,
    referralLink: row.referralLink,
    commissionRate: row.commissionRate,
    createdAt: row.createdAt
  };
}

app.post("/api/affiliates/apply", async (req, res) => {
  const businessName = clean(req.body.businessName || req.body.business_name);
  const contactName = clean(req.body.contactName || req.body.contact_name);
  const email = clean(req.body.email || req.body.contactEmail || req.body.contact_email);
  const phone = clean(req.body.phone);
  const website = clean(req.body.website);
  const audience = clean(req.body.audience);
  const promotionPlan = clean(req.body.promotionPlan || req.body.promotion_plan);

  if (!businessName || !contactName || !email) {
    return res.status(400).json({
      ok: false,
      message: "Please provide business name, contact name and email address."
    });
  }

  const rows = readAffiliates();
  const affiliateCode = makeAffiliateCode(businessName);
  const frontendBase = clean(process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || "http://localhost:5173").replace(/\/$/, "");

  const row = {
    id: crypto.randomUUID(),
    affiliateCode,
    status: "PENDING_REVIEW",
    businessName,
    contactName,
    email,
    phone,
    website,
    audience,
    promotionPlan,
    commissionRate: 5,
    referralLink: `${frontendBase}/?ref=${encodeURIComponent(affiliateCode)}`,
    createdAt: nowISO(),
    approvedAt: "",
    notes: ""
  };

  rows.unshift(row);
  writeJSON(AFFILIATES_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New affiliate application - MySpace Hotel", [
    ["Affiliate code", affiliateCode],
    ["Business name", businessName],
    ["Contact name", contactName],
    ["Email", email],
    ["Phone", phone],
    ["Website", website],
    ["Audience", audience],
    ["Promotion plan", promotionPlan],
    ["Status", row.status],
    ["Referral link", row.referralLink],
    ["Received", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Thank you. Your affiliate application has been received by MySpace Hotel.",
    affiliate: publicAffiliate(row)
  });
});

app.get("/api/affiliates/validate/:code", (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate code was not found." });
  }

  res.json({
    ok: true,
    affiliate: publicAffiliate(affiliate)
  });
});

app.get("/r/:code", (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const rows = readAffiliates();
  const affiliate = rows.find((x) => clean(x.affiliateCode).toUpperCase() === code);

  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  clicks.unshift({
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode: code,
    foundAffiliate: Boolean(affiliate),
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
    referrer: req.headers.referer || ""
  });
  writeJSON(AFFILIATE_CLICKS_FILE, clicks.slice(0, 20000));

  const frontendBase = clean(process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || "http://localhost:5173").replace(/\/$/, "");
  res.redirect(`${frontendBase}/?ref=${encodeURIComponent(code)}`);
});

function recordAffiliateConversionIfPresent(booking) {
  const affiliateCode = clean(booking.affiliateCode || booking.affiliate_code || booking.ref || "").toUpperCase();
  if (!affiliateCode) return null;

  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);
  const commissionRate = number(affiliate?.commissionRate || 5);
  const amount = money(booking.amount);
  const commissionAmount = money((amount * commissionRate) / 100);

  const conversion = {
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode,
    affiliateFound: Boolean(affiliate),
    affiliateStatus: affiliate?.status || "UNKNOWN",
    bookingRef: booking.bookingRef,
    hotelName: booking.hotelName,
    customerEmail: booking.customerEmail,
    amount,
    currency: booking.currency,
    commissionRate,
    commissionAmount,
    status: "PENDING_PAYMENT"
  };

  const rows = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  rows.unshift(conversion);
  writeJSON(AFFILIATE_CONVERSIONS_FILE, rows.slice(0, 20000));

  return conversion;
}


// MSH AFFILIATE APPROVAL EMAIL START
app.post("/api/internal/affiliates/:code/approve", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliates = readAffiliates();
  const index = affiliates.findIndex((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  affiliates[index] = {
    ...affiliates[index],
    status: "APPROVED",
    approvedAt: nowISO(),
    notes: clean(req.body.notes || affiliates[index].notes || "")
  };

  writeJSON(AFFILIATES_FILE, affiliates);

  const affiliate = affiliates[index];

  await sendEmailNotification(
    "Affiliate approved - MySpace Hotel",
    [
      ["Business name", affiliate.businessName],
      ["Contact name", affiliate.contactName],
      ["Email", affiliate.email],
      ["Affiliate code", affiliate.affiliateCode],
      ["Referral link", affiliate.referralLink],
      ["Status", affiliate.status],
      ["Approved", affiliate.approvedAt]
    ],
    affiliate.email
  );

  res.json({
    ok: true,
    message: "Affiliate approved and approval email sent.",
    affiliate: publicAffiliate(affiliate)
  });
});

app.post("/api/internal/affiliates/:code/reject", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliates = readAffiliates();
  const index = affiliates.findIndex((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  affiliates[index] = {
    ...affiliates[index],
    status: "REJECTED",
    rejectedAt: nowISO(),
    notes: clean(req.body.notes || affiliates[index].notes || "")
  };

  writeJSON(AFFILIATES_FILE, affiliates);

  res.json({
    ok: true,
    message: "Affiliate application rejected.",
    affiliate: publicAffiliate(affiliates[index])
  });
});

app.post("/api/internal/affiliates/:code/resend-welcome", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  await sendEmailNotification(
    "Welcome to the MySpace Hotel Affiliate Network",
    [
      ["Hello", affiliate.contactName],
      ["Status", affiliate.status],
      ["Affiliate code", affiliate.affiliateCode],
      ["Your referral link", affiliate.referralLink],
      ["How to use it", "Share your referral link with customers, followers, travel groups, businesses, communities and social media audiences."],
      ["Commission", `${affiliate.commissionRate || 5}% on qualifying completed stays, subject to approval and programme terms.`],
      ["Support", "reservations@myspace-hotel.com"],
      ["Website", "myspace-hotel.com"]
    ],
    affiliate.email
  );

  res.json({
    ok: true,
    message: "Affiliate welcome email sent.",
    affiliate: publicAffiliate(affiliate)
  });
});
// MSH AFFILIATE APPROVAL EMAIL END


// MSH AFFILIATE DIRECT CONVERSION START
app.post("/api/internal/affiliate-conversion-test", (req, res) => {
  const affiliateCode = clean(req.body.affiliateCode || req.body.affiliate_code || req.body.ref).toUpperCase();

  if (!affiliateCode) {
    return res.status(400).json({
      ok: false,
      message: "affiliateCode is required."
    });
  }

  const conversion = recordAffiliateConversionIfPresent({
    affiliateCode,
    bookingRef: clean(req.body.bookingRef || makeRef("AFFTEST")),
    hotelName: clean(req.body.hotelName || "Affiliate Test Booking"),
    customerEmail: clean(req.body.customerEmail || "test@example.com"),
    amount: money(req.body.amount || 100),
    currency: clean(req.body.currency || "GBP").toUpperCase()
  });

  res.json({
    ok: true,
    conversion
  });
});
// MSH AFFILIATE DIRECT CONVERSION END


// MSH PAID AFFILIATE COMMISSION OVERRIDE START
app.post("/api/internal/affiliate-conversions/:bookingRef/confirm-paid", (req, res) => {
  const bookingRef = clean(req.params.bookingRef);
  const paymentReference = clean(req.body.paymentReference || req.body.stripePaymentIntent || req.body.stripeSessionId || "");

  const rows = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const index = rows.findIndex((x) => clean(x.bookingRef) === bookingRef);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate conversion was not found." });
  }

  rows[index] = {
    ...rows[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference
  };

  writeJSON(AFFILIATE_CONVERSIONS_FILE, rows);

  res.json({
    ok: true,
    message: "Affiliate conversion marked as paid.",
    conversion: rows[index]
  });
});

app.get("/api/internal/affiliate-dashboard-paid", (req, res) => {
  const affiliates = readAffiliates();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const stats = affiliates.map((affiliate) => {
    const code = clean(affiliate.affiliateCode).toUpperCase();
    const affiliateClicks = clicks.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const affiliateConversions = conversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const paidConversions = affiliateConversions.filter((x) => clean(x.status).toUpperCase() === "PAID");
    const pendingConversions = affiliateConversions.filter((x) => clean(x.status).toUpperCase() !== "PAID");

    return {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      clicks: affiliateClicks.length,

      conversions: paidConversions.length,
      pendingConversions: pendingConversions.length,

      paidBookingValue: money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      payableCommission: money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),

      pendingBookingValue: money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      pendingCommission: money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),

      currency: affiliateConversions[0]?.currency || "GBP",
      createdAt: affiliate.createdAt
    };
  });

  res.json({
    ok: true,
    generatedAt: nowISO(),
    rule: "Only PAID affiliate conversions count as payable commission.",
    totals: {
      affiliates: affiliates.length,
      clicks: clicks.length,
      paidConversions: conversions.filter((x) => clean(x.status).toUpperCase() === "PAID").length,
      pendingConversions: conversions.filter((x) => clean(x.status).toUpperCase() !== "PAID").length,
      pendingApplications: affiliates.filter((x) => x.status === "PENDING_REVIEW").length
    },
    stats,
    recentPaidConversions: conversions.filter((x) => clean(x.status).toUpperCase() === "PAID").slice(0, 50),
    recentPendingConversions: conversions.filter((x) => clean(x.status).toUpperCase() !== "PAID").slice(0, 50)
  });
});
// MSH PAID AFFILIATE COMMISSION OVERRIDE END




// MSH AFFILIATE PORTAL API START
function affiliatePublicCommissionRate(affiliate) {
  const custom = number(affiliate.commissionRate);
  if (custom > 0 && custom < 3) return custom;
  if (custom > 3 && clean(affiliate.tier).toUpperCase() === "STRATEGIC") return custom;
  return 3;
}

app.post("/api/affiliate-portal/login", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();

  const affiliates = readAffiliates();
  const affiliate = affiliates.find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({
      ok: false,
      message: "We could not find an approved affiliate account with those details."
    });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({
      ok: false,
      message: "Your affiliate account is not approved yet."
    });
  }

  res.json({
    ok: true,
    message: "Affiliate login successful.",
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: affiliatePublicCommissionRate(affiliate),
      minimumPayout: 50,
      payoutSchedule: "Monthly"
    }
  });
});

app.get("/api/affiliate-portal/dashboard", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliates = readAffiliates();
  const affiliate = affiliates.find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({
      ok: false,
      message: "Affiliate account not found."
    });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({
      ok: false,
      message: "Affiliate account is not approved yet."
    });
  }

  const code = clean(affiliate.affiliateCode).toUpperCase();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);

  const allConversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const conversions = allConversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);

  const paidConversions = conversions.filter((x) => clean(x.status).toUpperCase() === "PAID");
  const pendingConversions = conversions.filter((x) => {
    const status = clean(x.status).toUpperCase();
    return status !== "PAID" && status !== "CANCELLED" && status !== "REFUNDED";
  });

  const payableCommission = money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const pendingCommission = money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const paidBookingValue = money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const pendingBookingValue = money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const conversionRate = clicks.length > 0 ? money((paidConversions.length / clicks.length) * 100) : 0;
  const minimumPayout = 50;

  res.json({
    ok: true,
    generatedAt: nowISO(),
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: affiliatePublicCommissionRate(affiliate),
      minimumPayout,
      payoutSchedule: "Monthly",
      createdAt: affiliate.createdAt
    },
    summary: {
      clicks: clicks.length,
      paidBookings: paidConversions.length,
      pendingBookings: pendingConversions.length,
      conversionRatePercent: conversionRate,
      paidBookingValue,
      pendingBookingValue,
      payableCommission,
      pendingCommission,
      lifetimeCommission: money(payableCommission + pendingCommission),
      nextPayoutThreshold: minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - payableCommission))
    },
    recentClicks: clicks.slice(0, 25),
    bookings: conversions.slice(0, 100).map((x) => ({
      createdAt: x.createdAt,
      bookingRef: x.bookingRef,
      hotelName: x.hotelName,
      customerEmail: x.customerEmail,
      amount: money(x.amount),
      currency: x.currency || "GBP",
      commissionRate: number(x.commissionRate || affiliatePublicCommissionRate(affiliate)),
      commissionAmount: money(x.commissionAmount),
      status: x.status,
      paidAt: x.paidAt || ""
    }))
  });
});
// MSH AFFILIATE PORTAL API END


// MSH AFFILIATE PORTAL BOOKING FALLBACK START
function buildAffiliatePortalDashboard(affiliate) {
  const code = clean(affiliate.affiliateCode).toUpperCase();
  const rate = 3;
  const minimumPayout = 50;

  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const conversionRows = readJSON(AFFILIATE_CONVERSIONS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const bookingRows = readJSON(BOOKINGS_FILE, []).filter((booking) => {
    const bookingAffiliate =
      clean(booking.affiliateCode) ||
      clean(booking.affiliate_code) ||
      clean(booking.ref) ||
      clean(booking.referralCode) ||
      clean(booking.referral_code);

    return bookingAffiliate.toUpperCase() === code;
  });

  const merged = [];

  for (const x of conversionRows) {
    merged.push({
      source: "conversion",
      createdAt: x.createdAt || "",
      bookingRef: clean(x.bookingRef),
      hotelName: clean(x.hotelName),
      customerEmail: clean(x.customerEmail),
      amount: money(x.amount),
      currency: clean(x.currency || "GBP").toUpperCase(),
      commissionRate: number(x.commissionRate || rate),
      commissionAmount: money(x.commissionAmount || (number(x.amount) * rate / 100)),
      status: clean(x.status || "PENDING_PAYMENT").toUpperCase(),
      paidAt: x.paidAt || ""
    });
  }

  for (const booking of bookingRows) {
    const existing = merged.find((x) => clean(x.bookingRef) === clean(booking.bookingRef));
    if (existing) continue;

    const status = clean(booking.status || "PENDING_PAYMENT").toUpperCase();
    const amount = money(booking.amount);
    merged.push({
      source: "booking",
      createdAt: booking.createdAt || "",
      bookingRef: clean(booking.bookingRef),
      hotelName: clean(booking.hotelName),
      customerEmail: clean(booking.customerEmail),
      amount,
      currency: clean(booking.currency || "GBP").toUpperCase(),
      commissionRate: rate,
      commissionAmount: money(amount * rate / 100),
      status,
      paidAt: booking.paidAt || ""
    });
  }

  const paidConversions = merged.filter((x) => clean(x.status).toUpperCase() === "PAID");
  const pendingConversions = merged.filter((x) => {
    const status = clean(x.status).toUpperCase();
    return status !== "PAID" && status !== "CANCELLED" && status !== "REFUNDED";
  });

  const payableCommission = money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const pendingCommission = money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const paidBookingValue = money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const pendingBookingValue = money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const conversionRate = clicks.length > 0 ? money((paidConversions.length / clicks.length) * 100) : 0;

  return {
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: rate,
      minimumPayout,
      payoutSchedule: "Monthly",
      createdAt: affiliate.createdAt
    },
    summary: {
      clicks: clicks.length,
      paidBookings: paidConversions.length,
      pendingBookings: pendingConversions.length,
      conversionRatePercent: conversionRate,
      paidBookingValue,
      pendingBookingValue,
      payableCommission,
      pendingCommission,
      lifetimeCommission: money(payableCommission + pendingCommission),
      nextPayoutThreshold: minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - payableCommission))
    },
    recentClicks: clicks.slice(0, 25),
    bookings: merged.slice(0, 100)
  };
}

app.get("/api/affiliate-portal/dashboard-v2", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Affiliate account not found." });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({ ok: false, message: "Affiliate account is not approved yet." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);

  res.json({
    ok: true,
    generatedAt: nowISO(),
    ...dashboard
  });
});
// MSH AFFILIATE PORTAL BOOKING FALLBACK END


// MSH AFFILIATE PAYOUT CENTRE START
const AFFILIATE_PAYOUTS_FILE = path.join(DATA_DIR, "affiliate_payouts.json");
ensureFile(AFFILIATE_PAYOUTS_FILE, []);

function affiliatePayoutSummary(affiliateCode) {
  const code = clean(affiliateCode).toUpperCase();
  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const paidTotal = money(payouts.filter((x) => clean(x.status).toUpperCase() === "PAID").reduce((sum, x) => sum + number(x.amount), 0));
  const pendingPayoutTotal = money(payouts.filter((x) => clean(x.status).toUpperCase() !== "PAID").reduce((sum, x) => sum + number(x.amount), 0));

  return {
    paidTotal,
    pendingPayoutTotal,
    payouts: payouts.slice(0, 100)
  };
}

app.get("/api/affiliate-portal/payout-centre", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Affiliate account not found." });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({ ok: false, message: "Affiliate account is not approved yet." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);
  const payout = affiliatePayoutSummary(affiliateCode);
  const available = money(dashboard.summary.payableCommission - payout.pendingPayoutTotal - payout.paidTotal);
  const minimumPayout = 50;

  res.json({
    ok: true,
    generatedAt: nowISO(),
    affiliate: dashboard.affiliate,
    payoutCentre: {
      availableCommission: available,
      minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - available)),
      eligibleForPayout: available >= minimumPayout,
      nextScheduledPayout: "Monthly payout review",
      paymentMethod: "Bank transfer after approval",
      paidTotal: payout.paidTotal,
      pendingPayoutTotal: payout.pendingPayoutTotal,
      payoutHistory: payout.payouts
    }
  });
});

app.post("/api/internal/affiliate-payouts/create", (req, res) => {
  const affiliateCode = clean(req.body.affiliateCode).toUpperCase();
  const amount = money(req.body.amount);
  const currency = clean(req.body.currency || "GBP").toUpperCase();
  const note = clean(req.body.note || "Affiliate payout review");

  if (!affiliateCode || amount <= 0) {
    return res.status(400).json({ ok: false, message: "affiliateCode and amount are required." });
  }

  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate not found." });
  }

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  const payout = {
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    amount,
    currency,
    status: "PENDING_REVIEW",
    note
  };

  payouts.unshift(payout);
  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts);

  res.json({ ok: true, payout });
});

app.post("/api/internal/affiliate-payouts/mark-paid", (req, res) => {
  const payoutId = clean(req.body.payoutId);
  const paymentReference = clean(req.body.paymentReference || "MANUAL-PAYOUT");

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  const index = payouts.findIndex((x) => clean(x.id) === payoutId);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout not found." });
  }

  payouts[index] = {
    ...payouts[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference
  };

  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts);

  res.json({ ok: true, payout: payouts[index] });
});
// MSH AFFILIATE PAYOUT CENTRE END


// MSH AFFILIATE PHASE 2 START
const AFFILIATE_PAYMENT_DETAILS_FILE = path.join(DATA_DIR, "affiliate_payment_details.json");
const AFFILIATE_PAYOUT_REQUESTS_FILE = path.join(DATA_DIR, "affiliate_payout_requests.json");

ensureFile(AFFILIATE_PAYMENT_DETAILS_FILE, []);
ensureFile(AFFILIATE_PAYOUT_REQUESTS_FILE, []);

function findApprovedAffiliateByLogin(email, affiliateCode) {
  const mail = clean(email).toLowerCase();
  const code = clean(affiliateCode).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === mail &&
    clean(x.affiliateCode).toUpperCase() === code
  );

  if (!affiliate) return null;
  if (clean(affiliate.status).toUpperCase() !== "APPROVED") return null;

  return affiliate;
}

app.get("/api/affiliate-portal/payment-details", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const rows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const details = rows.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode) || null;

  res.json({
    ok: true,
    affiliateCode,
    paymentDetails: details
      ? {
          paymentMethod: details.paymentMethod,
          accountName: details.accountName,
          bankName: details.bankName,
          sortCodeLast2: clean(details.sortCode).slice(-2),
          accountNumberLast4: clean(details.accountNumber).slice(-4),
          paypalEmail: details.paypalEmail,
          updatedAt: details.updatedAt || details.createdAt
        }
      : null
  });
});

app.post("/api/affiliate-portal/payment-details", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const paymentMethod = clean(req.body.paymentMethod || "BANK_TRANSFER").toUpperCase();
  const accountName = clean(req.body.accountName);
  const bankName = clean(req.body.bankName);
  const sortCode = clean(req.body.sortCode);
  const accountNumber = clean(req.body.accountNumber);
  const paypalEmail = clean(req.body.paypalEmail);

  if (paymentMethod === "BANK_TRANSFER" && (!accountName || !bankName || !sortCode || !accountNumber)) {
    return res.status(400).json({
      ok: false,
      message: "Please provide account name, bank name, sort code and account number."
    });
  }

  if (paymentMethod === "PAYPAL" && !paypalEmail) {
    return res.status(400).json({
      ok: false,
      message: "Please provide PayPal email address."
    });
  }

  const rows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const index = rows.findIndex((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  const row = {
    id: index >= 0 ? rows[index].id : crypto.randomUUID(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    paymentMethod,
    accountName,
    bankName,
    sortCode,
    accountNumber,
    paypalEmail,
    updatedAt: nowISO(),
    createdAt: index >= 0 ? rows[index].createdAt : nowISO()
  };

  if (index >= 0) rows[index] = row;
  else rows.unshift(row);

  writeJSON(AFFILIATE_PAYMENT_DETAILS_FILE, rows.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payment details saved.",
    paymentDetails: {
      paymentMethod: row.paymentMethod,
      accountName: row.accountName,
      bankName: row.bankName,
      sortCodeLast2: row.sortCode.slice(-2),
      accountNumberLast4: row.accountNumber.slice(-4),
      paypalEmail: row.paypalEmail,
      updatedAt: row.updatedAt
    }
  });
});

app.post("/api/affiliate-portal/request-payout", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);
  const payout = affiliatePayoutSummary(affiliateCode);
  const availableCommission = money(dashboard.summary.payableCommission - payout.pendingPayoutTotal - payout.paidTotal);
  const minimumPayout = 50;

  if (availableCommission < minimumPayout) {
    return res.status(400).json({
      ok: false,
      message: `Payout can be requested once available commission reaches GBP ${minimumPayout}.`,
      availableCommission,
      minimumPayout
    });
  }

  const paymentRows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const paymentDetails = paymentRows.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  if (!paymentDetails) {
    return res.status(400).json({
      ok: false,
      message: "Please save payment details before requesting payout."
    });
  }

  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const openRequest = requests.find((x) =>
    clean(x.affiliateCode).toUpperCase() === affiliateCode &&
    ["PENDING_REVIEW", "APPROVED"].includes(clean(x.status).toUpperCase())
  );

  if (openRequest) {
    return res.status(400).json({
      ok: false,
      message: "You already have an open payout request.",
      payoutRequest: openRequest
    });
  }

  const payoutRequest = {
    id: crypto.randomUUID(),
    requestReference: makeRef("PAYOUT"),
    createdAt: nowISO(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    amount: availableCommission,
    currency: "GBP",
    status: "PENDING_REVIEW",
    paymentMethod: paymentDetails.paymentMethod,
    note: clean(req.body.note || "Affiliate payout requested from portal.")
  };

  requests.unshift(payoutRequest);
  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payout request submitted for review.",
    payoutRequest
  });
});

app.get("/api/affiliate-portal/payout-requests", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, [])
    .filter((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode)
    .slice(0, 100);

  res.json({
    ok: true,
    affiliateCode,
    payoutRequests: requests
  });
});

app.get("/api/internal/affiliate-payout-requests", (req, res) => {
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  res.json({
    ok: true,
    generatedAt: nowISO(),
    total: requests.length,
    pending: requests.filter((x) => clean(x.status).toUpperCase() === "PENDING_REVIEW").length,
    approved: requests.filter((x) => clean(x.status).toUpperCase() === "APPROVED").length,
    paid: requests.filter((x) => clean(x.status).toUpperCase() === "PAID").length,
    rejected: requests.filter((x) => clean(x.status).toUpperCase() === "REJECTED").length,
    payoutRequests: requests.slice(0, 300)
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/approve", (req, res) => {
  const id = clean(req.params.id);
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "APPROVED",
    approvedAt: nowISO(),
    adminNote: clean(req.body.note || "")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  res.json({
    ok: true,
    message: "Payout request approved.",
    payoutRequest: requests[index]
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/mark-paid", (req, res) => {
  const id = clean(req.params.id);
  const paymentReference = clean(req.body.paymentReference || "MANUAL-PAYOUT");
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference,
    adminNote: clean(req.body.note || requests[index].adminNote || "")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  payouts.unshift({
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode: requests[index].affiliateCode,
    businessName: requests[index].businessName,
    contactName: requests[index].contactName,
    email: requests[index].email,
    amount: money(requests[index].amount),
    currency: requests[index].currency || "GBP",
    status: "PAID",
    paidAt: nowISO(),
    paymentReference,
    sourceRequestId: requests[index].id,
    sourceRequestReference: requests[index].requestReference,
    note: "Paid from affiliate payout request."
  });
  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payout request marked as paid.",
    payoutRequest: requests[index]
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/reject", (req, res) => {
  const id = clean(req.params.id);
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "REJECTED",
    rejectedAt: nowISO(),
    adminNote: clean(req.body.note || "Rejected after review.")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  res.json({
    ok: true,
    message: "Payout request rejected.",
    payoutRequest: requests[index]
  });
});
// MSH AFFILIATE PHASE 2 END

app.get("/api/internal/affiliate-dashboard", (req, res) => {
  const affiliates = readAffiliates();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const stats = affiliates.map((affiliate) => {
    const code = clean(affiliate.affiliateCode).toUpperCase();
    const affiliateClicks = clicks.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const affiliateConversions = conversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);

    return {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      clicks: affiliateClicks.length,
      conversions: affiliateConversions.length,
      totalBookingValue: money(affiliateConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      totalCommission: money(affiliateConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),
      currency: affiliateConversions[0]?.currency || "GBP",
      createdAt: affiliate.createdAt
    };
  });

  res.json({
    ok: true,
    generatedAt: nowISO(),
    totals: {
      affiliates: affiliates.length,
      clicks: clicks.length,
      conversions: conversions.length,
      pendingApplications: affiliates.filter((x) => x.status === "PENDING_REVIEW").length
    },
    stats,
    recentClicks: clicks.slice(0, 50),
    recentConversions: conversions.slice(0, 50)
  });
});
// MSH AFFILIATE NETWORK END


// MSH BOOKING FINANCE DASHBOARD START
function estimateStripeFee(amount, currency) {
  const value = money(amount);
  const ccy = clean(currency || "GBP").toUpperCase();

  // Conservative UK card estimate. Replace with exact Stripe balance transaction later.
  const percent = ccy === "GBP" ? 0.015 : 0.025;
  const fixed = ccy === "GBP" ? 0.20 : 0.25;

  return money((value * percent) + fixed);
}

function estimateSupplierCost(booking) {
  const customerAmount = money(booking.amount);

  // Temporary conservative estimate until supplier net-rate settlement is added.
  // Assumes MySpace gross markup around 15%.
  const supplierCost = money(customerAmount * 0.85);

  return supplierCost;
}

function affiliateCommissionForBooking(booking, conversions) {
  const ref = clean(booking.bookingRef);
  const conversion = conversions.find((x) => clean(x.bookingRef) === ref);

  if (!conversion) {
    return {
      affiliateCode: "",
      status: "NONE",
      commissionRate: 0,
      commissionAmount: 0,
      payableCommission: 0,
      pendingCommission: 0
    };
  }

  const status = clean(conversion.status).toUpperCase();
  const amount = money(conversion.commissionAmount);

  return {
    affiliateCode: clean(conversion.affiliateCode),
    status,
    commissionRate: number(conversion.commissionRate),
    commissionAmount: amount,
    payableCommission: status === "PAID" ? amount : 0,
    pendingCommission: status === "PAID" ? 0 : amount
  };
}

function supplierForBooking(booking) {
  const tracking = booking.internalSupplierTracking || {};
  const supplier = typeof resolveSupplierForAdmin === "function"
    ? resolveSupplierForAdmin(tracking)
    : {
        supplier_code: clean(tracking.supplier_code || tracking.supplier_name || "UNKNOWN"),
        supplier_name: clean(tracking.supplier_name || tracking.supplier_code || "Unknown"),
        supplier_type: "unknown",
        status: "unknown"
      };

  return supplier;
}

app.get("/api/internal/booking-finance-dashboard", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const rows = bookings.map((booking) => {
    const customerPaid = money(booking.amount);
    const currency = clean(booking.currency || "GBP").toUpperCase();
    const supplierCost = estimateSupplierCost(booking);
    const stripeFee = estimateStripeFee(customerPaid, currency);
    const affiliate = affiliateCommissionForBooking(booking, conversions);
    const payableAffiliate = money(affiliate.payableCommission);
    const estimatedMargin = money(customerPaid - supplierCost - stripeFee - payableAffiliate);
    const supplier = supplierForBooking(booking);

    return {
      bookingRef: booking.bookingRef,
      confirmationReference: booking.confirmationReference,
      status: booking.status,
      createdAt: booking.createdAt,
      paidAt: booking.paidAt || "",
      hotelId: booking.hotelId,
      hotelName: booking.hotelName,
      country: booking.country,
      city: booking.city,
      customerEmail: booking.customerEmail,

      currency,
      customerPaid,
      supplierCostEstimate: supplierCost,
      stripeFeeEstimate: stripeFee,

      affiliateCode: affiliate.affiliateCode,
      affiliateStatus: affiliate.status,
      affiliateCommissionRate: affiliate.commissionRate,
      affiliateCommissionTotal: affiliate.commissionAmount,
      affiliateCommissionPayable: affiliate.payableCommission,
      affiliateCommissionPending: affiliate.pendingCommission,

      myspaceEstimatedMargin: estimatedMargin,
      myspaceEstimatedMarginPercent: customerPaid > 0 ? money((estimatedMargin / customerPaid) * 100) : 0,

      supplier,
      rate_source_id: booking.rate_source_id || booking.internalSupplierTracking?.rate_source_id || "",
      rate_source_timestamp: booking.rate_source_timestamp || booking.internalSupplierTracking?.rate_source_timestamp || ""
    };
  });

  const totals = rows.reduce((acc, row) => {
    acc.bookings += 1;
    acc.customerPaid += row.customerPaid;
    acc.supplierCostEstimate += row.supplierCostEstimate;
    acc.stripeFeeEstimate += row.stripeFeeEstimate;
    acc.affiliateCommissionPayable += row.affiliateCommissionPayable;
    acc.affiliateCommissionPending += row.affiliateCommissionPending;
    acc.myspaceEstimatedMargin += row.myspaceEstimatedMargin;
    if (row.status === "PAID") acc.paidBookings += 1;
    if (row.status === "PENDING_PAYMENT") acc.pendingBookings += 1;
    if (row.status === "CANCELLED") acc.cancelledBookings += 1;
    return acc;
  }, {
    bookings: 0,
    paidBookings: 0,
    pendingBookings: 0,
    cancelledBookings: 0,
    customerPaid: 0,
    supplierCostEstimate: 0,
    stripeFeeEstimate: 0,
    affiliateCommissionPayable: 0,
    affiliateCommissionPending: 0,
    myspaceEstimatedMargin: 0
  });

  for (const key of Object.keys(totals)) {
    if (typeof totals[key] === "number") totals[key] = money(totals[key]);
  }

  res.json({
    ok: true,
    generatedAt: nowISO(),
    rule: "Finance dashboard estimates margin. Replace supplier cost and Stripe fee with exact settlement values when available.",
    totals,
    bookings: rows.slice(0, 200)
  });
});
// MSH BOOKING FINANCE DASHBOARD END

app.get("/api/certification/logs", (req, res) => {
  res.json({
    ok: true,
    message: "Service activity records are available.",
    logs: readJSON(SERVICE_ACTIVITY_FILE, [])
  });
});


// MSH ANCILLARY REVENUE STREAMS START
const INSURANCE_BOOKINGS_FILE = path.join(DATA_DIR, "travel_insurance_bookings.json");
const TRANSFER_BOOKINGS_FILE = path.join(DATA_DIR, "airport_transfer_bookings.json");
const ATTRACTION_BOOKINGS_FILE = path.join(DATA_DIR, "attraction_bookings.json");
const FEATURED_HOTELS_FILE = path.join(DATA_DIR, "featured_hotel_advertising.json");

ensureFile(INSURANCE_BOOKINGS_FILE, []);
ensureFile(TRANSFER_BOOKINGS_FILE, []);
ensureFile(ATTRACTION_BOOKINGS_FILE, []);
ensureFile(FEATURED_HOTELS_FILE, []);

function ancillaryRef(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function ancillaryCommission(amount, rate) {
  return money(number(amount) * number(rate) / 100);
}

app.get("/api/insurance/options", (req, res) => {
  const destination = clean(req.query.destination || req.query.city || "your trip");
  const tripTotal = money(req.query.tripTotal || req.query.total || 0);
  const base = tripTotal > 0 ? Math.max(12, tripTotal * 0.06) : 24;

  res.json({
    ok: true,
    destination,
    options: [
      {
        id: "single-trip-standard",
        name: "Single Trip Standard",
        description: "Trip cancellation, travel disruption and emergency support cover.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: true
      },
      {
        id: "family-trip-cover",
        name: "Family Trip Cover",
        description: "Flexible travel protection for families travelling together.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: false
      },
      {
        id: "business-travel-cover",
        name: "Business Travel Cover",
        description: "Travel protection designed for business and corporate trips.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: false
      }
    ]
  });
});

app.post("/api/insurance/book", async (req, res) => {
  const rows = readJSON(INSURANCE_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 25);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("INS"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    destination: clean(req.body.destination || req.body.city),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    productId: clean(req.body.productId),
    productName: clean(req.body.productName || "Travel Insurance"),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(INSURANCE_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New travel insurance request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", row.destination],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Product", row.productName],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Travel insurance request received.",
    insurance: row
  });
});

app.get("/api/transfers/search", (req, res) => {
  const city = clean(req.query.city || "Destination");
  const currency = clean(req.query.currency || "GBP").toUpperCase();

  res.json({
    ok: true,
    city,
    currency,
    options: [
      {
        id: "airport-standard",
        name: "Standard Airport Transfer",
        description: `Private transfer between the airport and your hotel in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "1-3"
      },
      {
        id: "airport-family",
        name: "Family / Group Transfer",
        description: `Larger vehicle for families, groups and luggage in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "4-7"
      },
      {
        id: "airport-executive",
        name: "Executive Transfer",
        description: `Premium transfer option for business and comfort travel in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "1-3"
      }
    ]
  });
});

app.post("/api/transfers/book", async (req, res) => {
  const rows = readJSON(TRANSFER_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 18);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("TRF"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    city: clean(req.body.city),
    country: clean(req.body.country),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    transferType: clean(req.body.transferType || req.body.productName || "Airport Transfer"),
    pickup: clean(req.body.pickup || "Airport"),
    dropoff: clean(req.body.dropoff || req.body.hotelName || "Hotel"),
    travelDate: clean(req.body.travelDate),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(TRANSFER_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New airport transfer request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Transfer", row.transferType],
    ["Route", `${row.pickup} to ${row.dropoff}`],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Airport transfer request received.",
    transfer: row
  });
});

app.get("/api/attractions", (req, res) => {
  const city = clean(req.query.city || "Destination");
  const currency = clean(req.query.currency || "GBP").toUpperCase();

  res.json({
    ok: true,
    city,
    currency,
    attractions: [
      {
        id: "city-tour",
        name: `${city} City Tour`,
        category: "Sightseeing",
        description: "A customer-friendly city tour option for discovering the destination.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "museum-culture-pass",
        name: "Museums and Culture Pass",
        category: "Culture",
        description: "A useful option for museums, galleries and cultural attractions.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "family-attractions",
        name: "Family Attractions",
        category: "Family",
        description: "Family-friendly attractions such as parks, zoos and visitor experiences.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "evening-experience",
        name: "Evening Experience",
        category: "Experience",
        description: "Evening activity suggestions for customers who want more from their trip.",
        price: 0,
        currency,
        commissionRate: 15
      }
    ]
  });
});

app.post("/api/attractions/book", async (req, res) => {
  const rows = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 15);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("ACT"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    city: clean(req.body.city),
    country: clean(req.body.country),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    attractionId: clean(req.body.attractionId),
    attractionName: clean(req.body.attractionName || "Tours and Attractions"),
    category: clean(req.body.category),
    travelDate: clean(req.body.travelDate),
    guests: number(req.body.guests || 1),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(ATTRACTION_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New tours and attractions request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Attraction", row.attractionName],
    ["Guests", String(row.guests)],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Tours and attractions request received.",
    attractionBooking: row
  });
});

app.post("/api/hotels/feature", async (req, res) => {
  const rows = readJSON(FEATURED_HOTELS_FILE, []);
  const packageName = clean(req.body.packageName || "Bronze").toUpperCase();
  const amountMap = { BRONZE: 49, SILVER: 99, GOLD: 199, PLATINUM: 499 };
  const amount = money(req.body.amount || amountMap[packageName] || 49);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("AD"),
    createdAt: nowISO(),
    hotelName: clean(req.body.hotelName),
    country: clean(req.body.country),
    city: clean(req.body.city),
    contactName: clean(req.body.contactName),
    contactEmail: clean(req.body.contactEmail),
    phone: clean(req.body.phone),
    website: clean(req.body.website),
    packageName,
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    status: "PENDING_REVIEW",
    notes: clean(req.body.notes)
  };

  rows.unshift(row);
  writeJSON(FEATURED_HOTELS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New featured hotel advertising request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Contact", row.contactName],
    ["Email", row.contactEmail],
    ["Package", row.packageName],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Featured hotel advertising request received.",
    featuredHotel: row
  });
});

app.get("/api/internal/ancillary-dashboard", (req, res) => {
  const insurance = readJSON(INSURANCE_BOOKINGS_FILE, []);
  const transfers = readJSON(TRANSFER_BOOKINGS_FILE, []);
  const attractions = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  const featured = readJSON(FEATURED_HOTELS_FILE, []);

  function totals(rows) {
    return rows.reduce((acc, x) => {
      acc.count += 1;
      acc.revenue += money(x.amount);
      acc.commission += money(x.commissionAmount || x.amount);
      return acc;
    }, { count: 0, revenue: 0, commission: 0 });
  }

  const data = {
    insurance: totals(insurance),
    transfers: totals(transfers),
    attractions: totals(attractions),
    featuredHotels: totals(featured)
  };

  const totalRevenue = money(data.insurance.revenue + data.transfers.revenue + data.attractions.revenue + data.featuredHotels.revenue);
  const totalCommission = money(data.insurance.commission + data.transfers.commission + data.attractions.commission + data.featuredHotels.commission);

  res.json({
    ok: true,
    generatedAt: nowISO(),
    totals: {
      totalRevenue,
      totalCommission,
      requests: data.insurance.count + data.transfers.count + data.attractions.count + data.featuredHotels.count
    },
    streams: data,
    latest: {
      insurance: insurance.slice(0, 25),
      transfers: transfers.slice(0, 25),
      attractions: attractions.slice(0, 25),
      featuredHotels: featured.slice(0, 25)
    }
  });
});

app.get("/api/internal/insurance-dashboard", (req, res) => {
  const rows = readJSON(INSURANCE_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, insuranceBookings: rows });
});

app.get("/api/internal/transfer-dashboard", (req, res) => {
  const rows = readJSON(TRANSFER_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, transferBookings: rows });
});

app.get("/api/internal/attraction-dashboard", (req, res) => {
  const rows = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, attractionBookings: rows });
});

app.get("/api/internal/advertising-dashboard", (req, res) => {
  const rows = readJSON(FEATURED_HOTELS_FILE, []);
  res.json({ ok: true, total: rows.length, featuredHotels: rows });
});
// MSH ANCILLARY REVENUE STREAMS END


// MSH REAL ANCILLARY EMAIL ROUTES START
const MSH_ANCILLARY_DIR = path.join(__dirname, "data");
const MSH_ANCILLARY_INSURANCE_FILE = path.join(MSH_ANCILLARY_DIR, "travel_insurance_leads.json");
const MSH_ANCILLARY_TRANSFER_FILE = path.join(MSH_ANCILLARY_DIR, "airport_transfer_leads.json");
const MSH_ANCILLARY_ATTRACTION_FILE = path.join(MSH_ANCILLARY_DIR, "attraction_leads.json");
const MSH_ANCILLARY_FEATURED_FILE = path.join(MSH_ANCILLARY_DIR, "hotel_partner_visibility_leads.json");

function mshEnsureJson(file, fallback) {
  try {
    if (!fs.existsSync(MSH_ANCILLARY_DIR)) fs.mkdirSync(MSH_ANCILLARY_DIR, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
  } catch (err) {
    console.error("MSH ensure json failed:", err.message);
  }
}

function mshReadJson(file, fallback) {
  try {
    mshEnsureJson(file, fallback);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function mshWriteJson(file, data) {
  mshEnsureJson(file, []);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function mshClean(v) {
  return String(v || "").trim();
}

function mshLeadRef(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

async function mshSendAncillaryEmail(subject, lead) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    process.env.RESERVATIONS_EMAIL ||
    "reservations@myspace-hotel.com";

  const to =
    process.env.RESERVATIONS_EMAIL ||
    process.env.EMAIL_TO ||
    process.env.SMTP_FROM ||
    "reservations@myspace-hotel.com";

  const rows = Object.entries(lead)
    .map(([key, value]) => `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">${key}</td><td style="padding:8px;border:1px solid #ddd;">${String(value || "")}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0b1d51;">
      <h2>${subject}</h2>
      <p>A new MySpace Hotel customer or partner request has been received.</p>
      <table style="border-collapse:collapse;width:100%;max-width:800px;">${rows}</table>
    </div>
  `;

  if (!apiKey) {
    console.error("MSH ancillary email not sent: RESEND_API_KEY missing.");
    return { sent: false, reason: "RESEND_API_KEY missing" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html
    })
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("MSH ancillary email failed:", response.status, text);
    return { sent: false, reason: text };
  }

  return { sent: true, provider: "resend" };
}

app.post("/api/ancillary/insurance/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_INSURANCE_FILE, []);
  const lead = {
    reference: mshLeadRef("INS"),
    createdAt: new Date().toISOString(),
    type: "Trip Protection Quote Request",
    hotelName: mshClean(req.body.hotelName),
    destination: mshClean(req.body.destination),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    productName: mshClean(req.body.productName),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_INSURANCE_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Trip Protection Quote Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Trip protection request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/transfers/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_TRANSFER_FILE, []);
  const lead = {
    reference: mshLeadRef("TRF"),
    createdAt: new Date().toISOString(),
    type: "Airport Transfer Quote Request",
    hotelName: mshClean(req.body.hotelName),
    city: mshClean(req.body.city),
    country: mshClean(req.body.country),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    transferType: mshClean(req.body.transferType),
    pickup: mshClean(req.body.pickup),
    dropoff: mshClean(req.body.dropoff),
    travelDate: mshClean(req.body.travelDate),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_TRANSFER_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Airport Transfer Quote Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Airport transfer request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/attractions/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_ATTRACTION_FILE, []);
  const lead = {
    reference: mshLeadRef("ACT"),
    createdAt: new Date().toISOString(),
    type: "Things To Do Availability Request",
    hotelName: mshClean(req.body.hotelName),
    city: mshClean(req.body.city),
    country: mshClean(req.body.country),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    attractionName: mshClean(req.body.attractionName),
    category: mshClean(req.body.category),
    travelDate: mshClean(req.body.travelDate),
    guests: mshClean(req.body.guests),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_ATTRACTION_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Things To Do Availability Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Things to do request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/hotels/feature", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_FEATURED_FILE, []);
  const lead = {
    reference: mshLeadRef("HOTEL"),
    createdAt: new Date().toISOString(),
    type: "Hotel Partner Visibility Request",
    hotelName: mshClean(req.body.hotelName),
    country: mshClean(req.body.country),
    city: mshClean(req.body.city),
    contactName: mshClean(req.body.contactName),
    contactEmail: mshClean(req.body.contactEmail),
    phone: mshClean(req.body.phone),
    website: mshClean(req.body.website),
    packageName: mshClean(req.body.packageName),
    status: "REQUEST_RECEIVED_COMMERCIAL_TERMS_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_FEATURED_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Hotel Partner Visibility Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Hotel partner request received.", lead, emailSent: email.sent });
});
// MSH REAL ANCILLARY EMAIL ROUTES END
// MSH RATEHAWK SANDBOX CONNECTOR START
function ratehawkConfig() {
  const enabled = String(process.env.RATEHAWK_ENABLED || "").toLowerCase() === "true";
  const baseUrl = clean(process.env.RATEHAWK_BASE_URL || "https://api-sandbox.worldota.net").replace(/\/$/, "");
  const keyId = clean(process.env.RATEHAWK_KEY_ID);
  const keyToken = clean(process.env.RATEHAWK_KEY_TOKEN);
  const userAgent = clean(process.env.RATEHAWK_USER_AGENT || "MySpaceHotel/1.0");
  const env = clean(process.env.RATEHAWK_ENV || "sandbox");

  return {
    enabled,
    env,
    baseUrl,
    keyId,
    keyToken,
    userAgent,
    ready: Boolean(enabled && baseUrl && keyId && keyToken)
  };
}

function ratehawkAuthHeader() {
  const cfg = ratehawkConfig();
  return `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keyToken}`).toString("base64")}`;
}

async function ratehawkPost(pathname, body) {
  const cfg = ratehawkConfig();

  if (!cfg.ready) {
    return {
      ok: false,
      status: 400,
      data: {
        message: "RateHawk is not configured. Check RATEHAWK_ENABLED, RATEHAWK_BASE_URL, RATEHAWK_KEY_ID and RATEHAWK_KEY_TOKEN."
      }
    };
  }

  const url = `${cfg.baseUrl}${pathname}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ratehawkAuthHeader(),
      "Content-Type": "application/json",
      "User-Agent": cfg.userAgent
    },
    body: JSON.stringify(body || {})
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 1000) };
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

app.get("/api/ratehawk/status", (req, res) => {
  const cfg = ratehawkConfig();

  res.json({
    ok: true,
    enabled: cfg.enabled,
    env: cfg.env,
    baseUrl: cfg.baseUrl,
    hasKeyId: Boolean(cfg.keyId),
    hasKeyToken: Boolean(cfg.keyToken),
    userAgent: cfg.userAgent,
    ready: cfg.ready,
    message: cfg.ready ? "RateHawk connector is configured." : "RateHawk connector is not ready."
  });
});

app.get("/api/ratehawk/test", async (req, res) => {
  try {
    const checkin = clean(req.query.checkin || req.query.checkIn || tomorrowISOForRatehawk(14));
    const checkout = clean(req.query.checkout || req.query.checkOut || tomorrowISOForRatehawk(15));
    const residency = clean(req.query.residency || "gb").toLowerCase();
    const language = clean(req.query.language || "en");
    const regionId = Number(req.query.region_id || req.query.regionId || 2011);

    const payload = {
      checkin,
      checkout,
      residency,
      language,
      guests: [
        {
          adults: 2,
          children: []
        }
      ],
      region_id: regionId,
      currency: "USD"
    };

    const result = await ratehawkPost("/api/b2b/v3/search/serp/region/", payload);

    recordActivity("ratehawk_test", {
      region_id: regionId,
      checkin,
      checkout,
      residency,
      language
    }, {
      ok: result.ok,
      status: result.status
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      status: result.status,
      request: {
        region_id: regionId,
        checkin,
        checkout,
        residency,
        language,
        currency: "USD"
      },
      result: result.data
    });
  } catch (err) {
    recordActivity("ratehawk_test_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "RateHawk test failed.",
      error: err.message
    });
  }
});

function tomorrowISOForRatehawk(daysAhead) {
  const d = new Date(Date.now() + Number(daysAhead || 1) * 86400000);
  return d.toISOString().slice(0, 10);
}
// MSH RATEHAWK SANDBOX CONNECTOR END
// MSH WEBBEDS DOTW XML CONNECTOR START
function webbedsConfig() {
  const enabled = String(process.env.WEBBEDS_ENABLED || "").toLowerCase() === "true";
  const baseUrl = clean(process.env.WEBBEDS_BASE_URL || "https://xmldev.dotwconnect.com/gatewayV4.dotw");
  const username = clean(process.env.WEBBEDS_USERNAME);
  const password = clean(process.env.WEBBEDS_PASSWORD);
  const companyId = clean(process.env.WEBBEDS_COMPANY_ID || process.env.WEBBEDS_COMPANY_CODE);
  const source = clean(process.env.WEBBEDS_SOURCE || "1");

  return {
    enabled,
    env: clean(process.env.WEBBEDS_ENV || "sandbox"),
    baseUrl,
    username,
    password,
    companyId,
    source,
    userAgent: clean(process.env.WEBBEDS_USER_AGENT || "MySpaceHotel/1.0"),
    ready: Boolean(enabled && baseUrl && username && password && companyId)
  };
}

function webbedsMd5Password() {
  return crypto.createHash("md5").update(webbedsConfig().password).digest("hex");
}

function xmlEscapeValue(v) {
  return clean(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function webbedsDateISO(daysAhead) {
  const d = new Date(Date.now() + Number(daysAhead || 1) * 86400000);
  return d.toISOString().slice(0, 10);
}

function webbedsCustomerXml(innerXml) {
  const cfg = webbedsConfig();

  return `<customer>
  <username>${xmlEscapeValue(cfg.username)}</username>
  <password>${webbedsMd5Password()}</password>
  <id>${xmlEscapeValue(cfg.companyId)}</id>
  <source>${xmlEscapeValue(cfg.source)}</source>
  <product>hotel</product>
  ${innerXml}
</customer>`;
}

async function webbedsPostXml(xml) {
  const cfg = webbedsConfig();

  if (!cfg.ready) {
    return {
      ok: false,
      status: 400,
      text: "WebBeds is not configured. Check WEBBEDS_ENABLED, WEBBEDS_BASE_URL, WEBBEDS_USERNAME, WEBBEDS_PASSWORD and WEBBEDS_COMPANY_ID."
    };
  }

  const response = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "Accept-Encoding": "gzip",
      "Connection": "close",
      "User-Agent": cfg.userAgent
    },
    body: xml
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    text
  };
}

function buildWebbedsInternalCodeXml(command) {
  return webbedsCustomerXml(`<request command="${xmlEscapeValue(command)}"></request>`);
}

function positiveIntegerOrBlank(v) {
  const value = clean(v);
  return /^[1-9][0-9]*$/.test(value) ? value : "";
}

function buildWebbedsSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const cityId = positiveIntegerOrBlank(query.cityId || query.city_id || query.city);
  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id || query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id || query.passengerNationality);
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id || query.passengerCountryOfResidence);
  const adults = positiveIntegerOrBlank(query.adults || 2) || "2";

  if (!cityId || !currencyId || !nationalityId || !residenceId) {
    return {
      ok: false,
      message: "DOTW/WebBeds search requires numeric internal IDs, not names. Use /api/webbeds/internal-code/getallcities, /api/webbeds/internal-code/getcurrenciesids and /api/webbeds/internal-code/getallcountries first.",
      required: {
        cityId: "numeric DOTW city ID",
        currencyId: "numeric DOTW currency ID",
        nationalityId: "numeric DOTW country/nationality ID",
        residenceId: "numeric DOTW country/residence ID"
      },
      received: {
        city: clean(query.city || query.cityId || ""),
        currency: clean(query.currency || query.currencyId || ""),
        nationality: clean(query.nationality || query.nationalityId || query.passengerNationality || ""),
        residence: clean(query.residence || query.residenceId || query.passengerCountryOfResidence || "")
      }
    };
  }

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>${adults}</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:c="http://us.dotwconnect.com/xsd/complexCondition" xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition">
        <city>${cityId}</city>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/status", (req, res) => {
  const cfg = webbedsConfig();

  res.json({
    ok: true,
    enabled: cfg.enabled,
    env: cfg.env,
    baseUrl: cfg.baseUrl,
    hasUsername: Boolean(cfg.username),
    hasPassword: Boolean(cfg.password),
    hasCompanyId: Boolean(cfg.companyId),
    source: cfg.source,
    ready: cfg.ready,
    message: cfg.ready ? "WebBeds connector is configured." : "WebBeds connector is not ready."
  });
});

app.get("/api/webbeds/internal-code/:command", async (req, res) => {
  try {
    const allowed = new Set([
      "getallcities",
      "getallcountries",
      "getservingcities",
      "getservingcountries",
      "getcurrenciesids",
      "getlanguageids",
      "getleisureids",
      "getbusinessids",
      "getamenitieids",
      "getroomamenitieids",
      "getsalutationsids",
      "getspecialrequestsids",
      "gethotelchainsids",
      "gethotelclassificationids",
      "getratebasisids",
      "getlocationids"
    ]);

    const command = clean(req.params.command).toLowerCase();

    if (!allowed.has(command)) {
      return res.status(400).json({
        ok: false,
        message: "Unsupported WebBeds internal-code command.",
        allowed: Array.from(allowed).sort()
      });
    }

    const xml = buildWebbedsInternalCodeXml(command);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_internal_code", { command }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      command,
      status: result.status,
      responsePreview: result.text
    });
  } catch (err) {
    recordActivity("webbeds_internal_code_error", { command: req.params.command }, { error: err.message });
    res.status(500).json({ ok: false, message: "WebBeds internal-code request failed.", error: err.message });
  }
});

app.get("/api/webbeds/test-search", async (req, res) => {
  try {
    const built = buildWebbedsSearchXml(req.query);

    if (!built.ok) {
      return res.status(400).json(built);
    }

    const result = await webbedsPostXml(built.xml);

    recordActivity("webbeds_test_search", {
      cityId: clean(req.query.cityId || req.query.city || ""),
      currencyId: clean(req.query.currencyId || req.query.currency || ""),
      nationalityId: clean(req.query.nationalityId || req.query.passengerNationality || ""),
      residenceId: clean(req.query.residenceId || req.query.passengerCountryOfResidence || "")
    }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      status: result.status,
      responsePreview: result.text
    });
  } catch (err) {
    recordActivity("webbeds_test_search_error", {}, { error: err.message });
    res.status(500).json({ ok: false, message: "WebBeds test search failed.", error: err.message });
  }
});

// MSH WEBBEDS JSON SEARCH NORMALIZER START
function extractXmlTag(block, tag) {
  const match = String(block || "").match(new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return match ? clean(match[1]) : "";
}

function extractXmlAttr(block, attr) {
  const match = String(block || "").match(new RegExp(attr + "=\"([^\"]*)\"", "i"));
  return match ? clean(match[1]) : "";
}

function parseWebbedsHotels(xml, currencyCode) {
  const hotels = [];
  const hotelBlocks = String(xml || "").match(/<hotel[\s\S]*?<\/hotel>/gi) || [];

  for (const hotelBlock of hotelBlocks.slice(0, 80)) {
    const hotelId = extractXmlAttr(hotelBlock, "hotelid");
    const roomBlocks = hotelBlock.match(/<roomType[\s\S]*?<\/roomType>/gi) || [];

    const rooms = [];

    for (const roomBlock of roomBlocks.slice(0, 10)) {
      const roomTypeCode = extractXmlAttr(roomBlock, "roomtypecode");
      const roomName = extractXmlTag(roomBlock, "name") || "Available room";
      const rateBlocks = roomBlock.match(/<rateBasis[\s\S]*?<\/rateBasis>/gi) || [];

      for (const rateBlock of rateBlocks.slice(0, 4)) {
        const rateBasisId = extractXmlAttr(rateBlock, "id");
        const total = money(extractXmlTag(rateBlock, "total"));

        if (total <= 0) continue;

        rooms.push({
          roomCode: roomTypeCode,
          roomName,
          board: `Rate basis ${rateBasisId || "standard"}`,
          price: total,
          convertedPrice: total,
          displayCurrency: currencyCode || "USD",
          cancellation: "Cancellation details are confirmed before booking.",
          taxes: "Taxes and fees are confirmed before booking.",
          rate_source_id: `WEBBEDS-${hotelId}-${roomTypeCode}-${rateBasisId}`,
          rate_source_timestamp: nowISO(),
          source_health: "verified",
          supplier_private: {
            supplier_code: "WEBBEDS",
            supplier_hotel_id: hotelId,
            room_type_code: roomTypeCode,
            rate_basis_id: rateBasisId
          }
        });
      }
    }

    rooms.sort((a, b) => number(a.price) - number(b.price));

    if (hotelId && rooms.length) {
      hotels.push({
        hotelId: `WEBBEDS-${hotelId}`,
        hotel_id: `WEBBEDS-${hotelId}`,
        name: `Hotel ${hotelId}`,
        hotel_name: `Hotel ${hotelId}`,
        country: "United Arab Emirates",
        city: "Abu Dhabi",
        area: "",
        address: "",
        stars: "",
        image: "",
        facilities: [],
        availableToBook: true,
        price: rooms[0].price,
        currency: rooms[0].displayCurrency,
        rooms: rooms.slice(0, 8),
        rate_source_id: rooms[0].rate_source_id,
        rate_source_timestamp: rooms[0].rate_source_timestamp,
        source_health: "verified"
      });
    }
  }

  hotels.sort((a, b) => number(a.price) - number(b.price));
  return hotels;
}

function webbedsCurrencyIdFromCode(code) {
  const c = clean(code || "USD").toUpperCase();
  if (c === "GBP") return "416";
  if (c === "EUR") return "413";
  return "520";
}

function webbedsCountryIdFromCode(code) {
  const c = clean(code || "GB").toUpperCase();
  if (c === "AE" || c === "UAE" || c === "UNITED ARAB EMIRATES") return "6";
  if (c === "US" || c === "USA" || c === "UNITED STATES") return "102";
  return "88";
}

function webbedsCityIdFromName(city) {
  const c = clean(city).toUpperCase();
  if (c === "ABU DHABI") return "334";
  return "";
}

app.get("/api/webbeds/search", async (req, res) => {
  try {
    const cityId = positiveIntegerOrBlank(req.query.cityId || req.query.city_id) || findWebbedsCityCodeFromCache(req.query.city) || webbedsCityIdFromName(req.query.city);
    const currencyId = positiveIntegerOrBlank(req.query.currencyId || req.query.currency_id) || webbedsCurrencyIdFromCode(req.query.currency);
    const nationalityId = positiveIntegerOrBlank(req.query.nationalityId || req.query.nationality_id) || webbedsCountryIdFromCode(req.query.nationality || "GB");
    const residenceId = positiveIntegerOrBlank(req.query.residenceId || req.query.residence_id) || webbedsCountryIdFromCode(req.query.residence || "GB");

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        message: "This WebBeds city is not mapped yet. Use cityId directly or add the city to the WebBeds city map.",
        example: "/api/webbeds/search?cityId=334&currency=USD&nationality=GB&residence=GB"
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId,
      nationalityId,
      residenceId
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    recordActivity("webbeds_json_search", {
      cityId,
      currencyId,
      nationalityId,
      residenceId,
      count: hotels.length
    }, {
      ok: result.ok,
      status: result.status
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live",
      count: hotels.length,
      hotels
    });
  } catch (err) {
    recordActivity("webbeds_json_search_error", {}, { error: err.message });
    res.status(500).json({
      ok: false,
      message: "WebBeds JSON search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS CITY MAP CACHE START
function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const name = extractXmlTag(block, "name");
    const code = extractXmlTag(block, "code");

    if (!name || !code) continue;

    const key = clean(name).toUpperCase();
    map[key] = code;

    cities.push({
      name,
      key,
      code
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
}

function findWebbedsCityCodeFromCache(city) {
  const cityMap = loadWebbedsCityMap();
  if (!cityMap || !cityMap.map) return "";

  const key = clean(city).toUpperCase();
  if (cityMap.map[key]) return cityMap.map[key];

  const partial = (cityMap.cities || []).find((item) => {
    const itemKey = clean(item.key || item.name).toUpperCase();
    return itemKey === key || itemKey.startsWith(key + " -") || itemKey.includes(key);
  });

  return partial ? clean(partial.code) : "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const xml = buildWebbedsInternalCodeXml("getservingcities");
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: "Could not download WebBeds serving cities.",
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    saveWebbedsCityMap(parsed);

    recordActivity("webbeds_build_city_map", {}, {
      ok: true,
      cities: parsed.count
    });

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 20)
    });
  } catch (err) {
    recordActivity("webbeds_build_city_map_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS START
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
        ? "United Arab Emirates"
        : hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      hotels
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS TEST START
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH START
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message
    });
  }
});
// MSH WEBBEDS HOTEL ID BATCH SEARCH END

// MSH WEBBEDS HOTEL DETAILS TEST END

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS END

// MSH WEBBEDS CITY MAP CACHE END


// MSH WEBBEDS CITY MAP CACHE START
function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const name = extractXmlTag(block, "name");
    const code = extractXmlTag(block, "code");

    if (!name || !code) continue;

    const key = clean(name).toUpperCase();
    map[key] = code;

    cities.push({
      name,
      key,
      code
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
}

function findWebbedsCityCodeFromCache(city) {
  const cityMap = loadWebbedsCityMap();
  if (!cityMap || !cityMap.map) return "";

  const key = clean(city).toUpperCase();
  if (cityMap.map[key]) return cityMap.map[key];

  const partial = (cityMap.cities || []).find((item) => {
    const itemKey = clean(item.key || item.name).toUpperCase();
    return itemKey === key || itemKey.startsWith(key + " -") || itemKey.includes(key);
  });

  return partial ? clean(partial.code) : "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const xml = buildWebbedsInternalCodeXml("getservingcities");
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: "Could not download WebBeds serving cities.",
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    saveWebbedsCityMap(parsed);

    recordActivity("webbeds_build_city_map", {}, {
      ok: true,
      cities: parsed.count
    });

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 20)
    });
  } catch (err) {
    recordActivity("webbeds_build_city_map_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS START
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
        ? "United Arab Emirates"
        : hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      hotels
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS TEST START
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH START
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message
    });
  }
});
// MSH WEBBEDS HOTEL ID BATCH SEARCH END

// MSH WEBBEDS HOTEL DETAILS TEST END

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS END

// MSH WEBBEDS CITY MAP CACHE END

// MSH WEBBEDS JSON SEARCH NORMALIZER END


// MSH WEBBEDS JSON SEARCH NORMALIZER START
function extractXmlTag(block, tag) {
  const match = String(block || "").match(new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return match ? clean(match[1]) : "";
}

function extractXmlAttr(block, attr) {
  const match = String(block || "").match(new RegExp(attr + "=\"([^\"]*)\"", "i"));
  return match ? clean(match[1]) : "";
}

function parseWebbedsHotels(xml, currencyCode) {
  const hotels = [];
  const hotelBlocks = String(xml || "").match(/<hotel[\s\S]*?<\/hotel>/gi) || [];

  for (const hotelBlock of hotelBlocks.slice(0, 80)) {
    const hotelId = extractXmlAttr(hotelBlock, "hotelid");
    const roomBlocks = hotelBlock.match(/<roomType[\s\S]*?<\/roomType>/gi) || [];

    const rooms = [];

    for (const roomBlock of roomBlocks.slice(0, 10)) {
      const roomTypeCode = extractXmlAttr(roomBlock, "roomtypecode");
      const roomName = extractXmlTag(roomBlock, "name") || "Available room";
      const rateBlocks = roomBlock.match(/<rateBasis[\s\S]*?<\/rateBasis>/gi) || [];

      for (const rateBlock of rateBlocks.slice(0, 4)) {
        const rateBasisId = extractXmlAttr(rateBlock, "id");
        const total = money(extractXmlTag(rateBlock, "total"));

        if (total <= 0) continue;

        rooms.push({
          roomCode: roomTypeCode,
          roomName,
          board: `Rate basis ${rateBasisId || "standard"}`,
          price: total,
          convertedPrice: total,
          displayCurrency: currencyCode || "USD",
          cancellation: "Cancellation details are confirmed before booking.",
          taxes: "Taxes and fees are confirmed before booking.",
          rate_source_id: `WEBBEDS-${hotelId}-${roomTypeCode}-${rateBasisId}`,
          rate_source_timestamp: nowISO(),
          source_health: "verified",
          supplier_private: {
            supplier_code: "WEBBEDS",
            supplier_hotel_id: hotelId,
            room_type_code: roomTypeCode,
            rate_basis_id: rateBasisId
          }
        });
      }
    }

    rooms.sort((a, b) => number(a.price) - number(b.price));

    if (hotelId && rooms.length) {
      hotels.push({
        hotelId: `WEBBEDS-${hotelId}`,
        hotel_id: `WEBBEDS-${hotelId}`,
        name: `Hotel ${hotelId}`,
        hotel_name: `Hotel ${hotelId}`,
        country: "United Arab Emirates",
        city: "Abu Dhabi",
        area: "",
        address: "",
        stars: "",
        image: "",
        facilities: [],
        availableToBook: true,
        price: rooms[0].price,
        currency: rooms[0].displayCurrency,
        rooms: rooms.slice(0, 8),
        rate_source_id: rooms[0].rate_source_id,
        rate_source_timestamp: rooms[0].rate_source_timestamp,
        source_health: "verified"
      });
    }
  }

  hotels.sort((a, b) => number(a.price) - number(b.price));
  return hotels;
}

function webbedsCurrencyIdFromCode(code) {
  const c = clean(code || "USD").toUpperCase();
  if (c === "GBP") return "416";
  if (c === "EUR") return "413";
  return "520";
}

function webbedsCountryIdFromCode(code) {
  const c = clean(code || "GB").toUpperCase();
  if (c === "AE" || c === "UAE" || c === "UNITED ARAB EMIRATES") return "6";
  if (c === "US" || c === "USA" || c === "UNITED STATES") return "102";
  return "88";
}

function webbedsCityIdFromName(city) {
  const c = clean(city).toUpperCase();
  if (c === "ABU DHABI") return "334";
  return "";
}

app.get("/api/webbeds/search", async (req, res) => {
  try {
    const cityId = positiveIntegerOrBlank(req.query.cityId || req.query.city_id) || findWebbedsCityCodeFromCache(req.query.city) || webbedsCityIdFromName(req.query.city);
    const currencyId = positiveIntegerOrBlank(req.query.currencyId || req.query.currency_id) || webbedsCurrencyIdFromCode(req.query.currency);
    const nationalityId = positiveIntegerOrBlank(req.query.nationalityId || req.query.nationality_id) || webbedsCountryIdFromCode(req.query.nationality || "GB");
    const residenceId = positiveIntegerOrBlank(req.query.residenceId || req.query.residence_id) || webbedsCountryIdFromCode(req.query.residence || "GB");

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        message: "This WebBeds city is not mapped yet. Use cityId directly or add the city to the WebBeds city map.",
        example: "/api/webbeds/search?cityId=334&currency=USD&nationality=GB&residence=GB"
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId,
      nationalityId,
      residenceId
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    recordActivity("webbeds_json_search", {
      cityId,
      currencyId,
      nationalityId,
      residenceId,
      count: hotels.length
    }, {
      ok: result.ok,
      status: result.status
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live",
      count: hotels.length,
      hotels
    });
  } catch (err) {
    recordActivity("webbeds_json_search_error", {}, { error: err.message });
    res.status(500).json({
      ok: false,
      message: "WebBeds JSON search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS CITY MAP CACHE START
function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const name = extractXmlTag(block, "name");
    const code = extractXmlTag(block, "code");

    if (!name || !code) continue;

    const key = clean(name).toUpperCase();
    map[key] = code;

    cities.push({
      name,
      key,
      code
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
}

function findWebbedsCityCodeFromCache(city) {
  const cityMap = loadWebbedsCityMap();
  if (!cityMap || !cityMap.map) return "";

  const key = clean(city).toUpperCase();
  if (cityMap.map[key]) return cityMap.map[key];

  const partial = (cityMap.cities || []).find((item) => {
    const itemKey = clean(item.key || item.name).toUpperCase();
    return itemKey === key || itemKey.startsWith(key + " -") || itemKey.includes(key);
  });

  return partial ? clean(partial.code) : "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const xml = buildWebbedsInternalCodeXml("getservingcities");
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: "Could not download WebBeds serving cities.",
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    saveWebbedsCityMap(parsed);

    recordActivity("webbeds_build_city_map", {}, {
      ok: true,
      cities: parsed.count
    });

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 20)
    });
  } catch (err) {
    recordActivity("webbeds_build_city_map_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS START
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
        ? "United Arab Emirates"
        : hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      hotels
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS TEST START
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH START
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message
    });
  }
});
// MSH WEBBEDS HOTEL ID BATCH SEARCH END

// MSH WEBBEDS HOTEL DETAILS TEST END

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS END

// MSH WEBBEDS CITY MAP CACHE END


// MSH WEBBEDS CITY MAP CACHE START
function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const name = extractXmlTag(block, "name");
    const code = extractXmlTag(block, "code");

    if (!name || !code) continue;

    const key = clean(name).toUpperCase();
    map[key] = code;

    cities.push({
      name,
      key,
      code
    });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
}

function findWebbedsCityCodeFromCache(city) {
  const cityMap = loadWebbedsCityMap();
  if (!cityMap || !cityMap.map) return "";

  const key = clean(city).toUpperCase();
  if (cityMap.map[key]) return cityMap.map[key];

  const partial = (cityMap.cities || []).find((item) => {
    const itemKey = clean(item.key || item.name).toUpperCase();
    return itemKey === key || itemKey.startsWith(key + " -") || itemKey.includes(key);
  });

  return partial ? clean(partial.code) : "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const xml = buildWebbedsInternalCodeXml("getservingcities");
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: "Could not download WebBeds serving cities.",
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    saveWebbedsCityMap(parsed);

    recordActivity("webbeds_build_city_map", {}, {
      ok: true,
      cities: parsed.count
    });

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 20)
    });
  } catch (err) {
    recordActivity("webbeds_build_city_map_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS START
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
        ? "United Arab Emirates"
        : hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      hotels
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS TEST START
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH START
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message
    });
  }
});
// MSH WEBBEDS HOTEL ID BATCH SEARCH END

// MSH WEBBEDS HOTEL DETAILS TEST END

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS END

// MSH WEBBEDS CITY MAP CACHE END

// MSH WEBBEDS JSON SEARCH NORMALIZER END

// MSH WEBBEDS DOTW XML CONNECTOR END

// MSH REAL MULTI SUPPLIER ORCHESTRATOR START
function mergeUniqueHotelsByKey(hotels) {
  const seen = new Set();
  const merged = [];

  for (const hotel of hotels || []) {
    const name = clean(hotel.hotel_name || hotel.name || "");
    const city = clean(hotel.city || "");
    const country = clean(hotel.country || "");
    const supplierKey = clean(hotel.rate_source_id || hotel.hotel_id || hotel.hotelId || name);

    const key = `${name.toLowerCase()}|${city.toLowerCase()}|${country.toLowerCase()}|${supplierKey.toLowerCase()}`;

    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(hotel);
  }

  return merged;
}

app.get("/api/multi-supplier-hotels", async (req, res) => {
  try {
    const query = new URLSearchParams(req.query).toString();

    const localUrl = `http://127.0.0.1:${PORT}/search?${query}`;
    const localResult = await fetch(localUrl, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({ hotels: [] }));

    const localHotels = Array.isArray(localResult.hotels) ? localResult.hotels : [];

    let webbedsHotels = [];
    try {
      const city = clean(req.query.city || "");
      const currency = clean(req.query.currency || "GBP").toUpperCase();

      const cityId =
        findWebbedsCityCodeFromCache(city) ||
        webbedsCityIdFromName(city);

      if (cityId && typeof buildWebbedsSearchXml === "function") {
        const built = buildWebbedsSearchXml({
          ...req.query,
          cityId,
          currencyId: webbedsCurrencyIdFromCode(currency),
          nationalityId: webbedsCountryIdFromCode(req.query.nationality || "GB"),
          residenceId: webbedsCountryIdFromCode(req.query.residence || "GB")
        });

        if (built.ok) {
          const result = await webbedsPostXml(built.xml);
          webbedsHotels = parseWebbedsHotels(result.text, currency).map((hotel) => {
            const rawId = String(hotel.hotel_id || hotel.hotelId || "").replace("WEBBEDS-", "");
            const hasRealName =
              hotel.name &&
              !/^Hotel\s+\d+$/i.test(String(hotel.name)) &&
              !/^\d+$/.test(String(hotel.name));

            const safeName = hasRealName ? hotel.name : `Live supplier property ${rawId}`;

            return {
              ...hotel,
              name: safeName,
              hotel_name: safeName,
              city,
              country:
                city.toUpperCase() === "DUBAI" || city.toUpperCase() === "ABU DHABI"
                  ? "United Arab Emirates"
                  : clean(req.query.country || hotel.country || ""),
              source: "webbeds_live_supplier",
              supplierLabel: "WebBeds live rate",
              supplier_private: {
                ...(hotel.supplier_private || {}),
                supplier_code: "WEBBEDS"
              }
            };
          });
        }
      }
    } catch (err) {
      webbedsHotels = [];
    }

    let merged = mergeUniqueHotelsByKey([
      ...localHotels.map((hotel) => ({
        ...hotel,
        source: hotel.source || "existing_supplier_inventory",
        supplierLabel: hotel.supplierLabel || "Existing supplier inventory"
      })),
      ...webbedsHotels
    ]);

    merged = merged.filter((hotel) => {
      const livePrice = number(hotel.price || hotel.total || hotel.convertedPrice || 0);
      const displayName = clean(hotel.name || hotel.hotel_name || "");
      const hasRealName =
        displayName &&
        !/^Live supplier property/i.test(displayName) &&
        !/^Hotel\s+\d+$/i.test(displayName);

      const hasRealImage = Boolean(clean(hotel.image));

      return livePrice > 0 && hotel.availableToBook !== false && hasRealName && hasRealImage;
    });

    merged.sort((a, b) => {
      const aPrice = number(a.price || a.total || 0);
      const bPrice = number(b.price || b.total || 0);

      const aHasRealName =
        clean(a.name || a.hotel_name) &&
        !/^Live supplier property/i.test(clean(a.name || a.hotel_name)) &&
        !/^Hotel\s+\d+$/i.test(clean(a.name || a.hotel_name));

      const bHasRealName =
        clean(b.name || b.hotel_name) &&
        !/^Live supplier property/i.test(clean(b.name || b.hotel_name)) &&
        !/^Hotel\s+\d+$/i.test(clean(b.name || b.hotel_name));

      const aHasImage = Boolean(clean(a.image));
      const bHasImage = Boolean(clean(b.image));

      const aPriced = aPrice > 0;
      const bPriced = bPrice > 0;

      const aScore = (aHasRealName ? 100 : 0) + (aHasImage ? 50 : 0) + (aPriced ? 25 : 0);
      const bScore = (bHasRealName ? 100 : 0) + (bHasImage ? 50 : 0) + (bPriced ? 25 : 0);

      if (aScore !== bScore) return bScore - aScore;

      if (aPriced && bPriced) return aPrice - bPrice;
      return 0;
    });

    res.json({
      ok: true,
      source: "multi_supplier",
      suppliers: {
        existing: localHotels.length,
        webbeds: webbedsHotels.length
      },
      count: merged.length,
      hotels: merged
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Multi-supplier hotel search failed.",
      error: err.message
    });
  }
});
// MSH REAL MULTI SUPPLIER ORCHESTRATOR END

function MSH_PUBLIC_CLEAN_TEXT(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function MSH_PUBLIC_NORM(value) {
  return MSH_PUBLIC_CLEAN_TEXT(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function MSH_PUBLIC_READ_LIVE_HOTELS() {
  try {
    const file = path.join(__dirname, "data", "live_hotels.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.hotels)) return raw.hotels;
    return [];
  } catch {
    return [];
  }
}

function MSH_PUBLIC_PRICE(hotel) {
  const room = Array.isArray(hotel?.rooms) && hotel.rooms.length ? hotel.rooms[0] : {};
  const values = [
    hotel?.price,
    hotel?.convertedPrice,
    hotel?.displayPrice,
    hotel?.amount,
    hotel?.total,
    hotel?.totalPrice,
    hotel?.net,
    hotel?.sellingRate,
    hotel?.rate,
    room?.price,
    room?.convertedPrice,
    room?.displayPrice,
    room?.amount,
    room?.total,
    room?.net,
    room?.sellingRate,
    room?.rate
  ];
  for (const v of values) {
    const n = Number(v || 0);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function MSH_PUBLIC_IMAGES(hotel) {
  const raw = [
    hotel?.image,
    hotel?.image_url,
    hotel?.main_image,
    hotel?.thumbnail,
    hotel?.photo,
    ...(Array.isArray(hotel?.images) ? hotel.images : []),
    ...(Array.isArray(hotel?.photos) ? hotel.photos : [])
  ];

  return Array.from(new Set(raw.map((x) => {
    if (!x) return "";
    if (typeof x === "string") return x.trim();
    return String(x.url || x.image || x.image_url || x.path || "").trim();
  }).filter((x) => /^https?:\/\//i.test(x))));
}

function MSH_PUBLIC_ID(hotel) {
  return MSH_PUBLIC_CLEAN_TEXT(
    hotel?.hotelId ||
    hotel?.hotel_id ||
    hotel?.id ||
    hotel?.code ||
    hotel?.supplier_hotel_id ||
    hotel?.name ||
    hotel?.hotel_name ||
    ""
  );
}

function MSH_PUBLIC_SUPPLIER(hotel) {
  const raw = MSH_PUBLIC_NORM([
    hotel?.supplierLabel,
    hotel?.supplier,
    hotel?.source,
    hotel?.provider,
    hotel?.supplierCode,
    hotel?.supplier_code,
    hotel?.supplier_private?.supplier_code
  ].join(" "));
  if (raw.includes("webbeds")) return "WebBeds";
  if (raw.includes("hotelbeds")) return "Hotelbeds";
  return "Inventory";
}

function MSH_PUBLIC_CITY_PARENT(country, city) {
  const c = MSH_PUBLIC_NORM(country);
  const q = MSH_PUBLIC_NORM(city);

  const rules = [
    ["united kingdom", "london", ["lon", "central london", "canary wharf", "westminster", "paddington", "kensington", "chelsea", "mayfair", "soho", "shoreditch", "docklands", "heathrow"]],
    ["united arab emirates", "abu dhabi", ["yas island", "saadiyat island", "corniche", "au h", "auh"]],
    ["united arab emirates", "dubai", ["dubai marina", "jbr", "palm jumeirah", "downtown dubai", "deira"]],
    ["bahrain", "manama", ["juffair", "al juffair"]],
    ["nigeria", "lagos", ["lekki", "victoria island", "ikoyi"]],
    ["nigeria", "abuja", ["wuse", "maitama", "asokoro"]],
    ["united states", "new york", ["nyc", "manhattan", "brooklyn", "queens"]]
  ];

  for (const [countryKey, parent, aliases] of rules) {
    if (c && c !== countryKey) continue;
    if (q === parent || aliases.some((x) => q.includes(x))) {
      const area = q === parent ? "" : MSH_PUBLIC_CLEAN_TEXT(city);
      return { supplierCity: parent.replace(/\b\w/g, (m) => m.toUpperCase()), area };
    }
  }

  if (String(city || "").includes(",")) {
    const parts = String(city).split(",").map((x) => x.trim()).filter(Boolean);
    return {
      supplierCity: parts[parts.length - 1],
      area: parts.slice(0, -1).join(", ")
    };
  }

  return { supplierCity: MSH_PUBLIC_CLEAN_TEXT(city), area: "" };
}

function MSH_PUBLIC_NORMALISE_HOTEL(hotel, query, sourceType) {
  const images = MSH_PUBLIC_IMAGES(hotel);
  const price = MSH_PUBLIC_PRICE(hotel);
  const supplier = MSH_PUBLIC_SUPPLIER(hotel);

  const name = MSH_PUBLIC_CLEAN_TEXT(hotel?.name || hotel?.hotel_name || hotel?.hotelName || "Available property");
  const city = MSH_PUBLIC_CLEAN_TEXT(hotel?.city || hotel?.destination || hotel?.location?.city || query.city || "");
  const country = MSH_PUBLIC_CLEAN_TEXT(hotel?.country || hotel?.location?.country || query.country || "");

  return {
    ...hotel,
    hotelId: MSH_PUBLIC_ID(hotel),
    hotel_id: MSH_PUBLIC_ID(hotel),
    name,
    hotel_name: name,
    country,
    city,
    area: MSH_PUBLIC_CLEAN_TEXT(hotel?.area || hotel?.zone || hotel?.district || ""),
    address: MSH_PUBLIC_CLEAN_TEXT(hotel?.address || hotel?.location?.address || ""),
    image: images[0] || "",
    images,
    price,
    convertedPrice: price,
    displayPrice: price,
    currency: MSH_PUBLIC_CLEAN_TEXT(hotel?.currency || hotel?.displayCurrency || query.currency || "GBP"),
    displayCurrency: MSH_PUBLIC_CLEAN_TEXT(hotel?.displayCurrency || hotel?.currency || query.currency || "GBP"),
    availableToBook: price > 0,
    customerBadge: price > 0 ? "Live hotel rate" : "Check availability",
    availabilityMode: price > 0 ? "live_rate" : "request_availability",
    sourceType,
    internalSupplierSettlement: {
      supplier,
      supplierCode: hotel?.supplierCode || hotel?.supplier_code || hotel?.supplier_private?.supplier_code || "",
      rateSourceId: hotel?.rate_source_id || hotel?.rooms?.[0]?.rate_source_id || "",
      rateSourceTimestamp: hotel?.rate_source_timestamp || hotel?.rooms?.[0]?.rate_source_timestamp || ""
    }
  };
}

async function MSH_PUBLIC_TRY_SUPPLIER_SEARCH(req, query) {
  try {
    const params = new URLSearchParams({
      country: query.country,
      city: query.city,
      checkIn: query.checkIn || "",
      checkOut: query.checkOut || "",
      guests: query.guests || "2",
      rooms: query.rooms || "1",
      currency: query.currency || "GBP",
      limit: String(query.limit || 1000)
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(`http://127.0.0.1:${PORT}/api/multi-supplier-hotels?${params.toString()}`, {
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) return { hotels: [], suppliers: {}, supplierStatus: { multiSupplier: `http_${response.status}` } };

    const payload = await response.json();
    return {
      hotels: Array.isArray(payload.hotels) ? payload.hotels : [],
      suppliers: payload.suppliers || {},
      supplierStatus: payload.supplierStatus || {}
    };
  } catch {
    return { hotels: [], suppliers: {}, supplierStatus: { multiSupplier: "unavailable" } };
  }
}

function MSH_PUBLIC_CATALOGUE_SEARCH(query) {
  const wantedCountry = MSH_PUBLIC_NORM(query.country);
  const wantedCity = MSH_PUBLIC_NORM(query.city);
  const wantedArea = MSH_PUBLIC_NORM(query.area);
  const limit = Math.max(1, Math.min(Number(query.limit || 1000), 1000));

  const rows = MSH_PUBLIC_READ_LIVE_HOTELS()
    .filter((hotel) => {
      const country = MSH_PUBLIC_NORM(hotel?.country || hotel?.location?.country || "");
      if (wantedCountry && country && country !== wantedCountry) return false;
      return true;
    })
    .map((hotel) => {
      const text = MSH_PUBLIC_NORM([
        hotel?.name,
        hotel?.hotel_name,
        hotel?.hotelName,
        hotel?.country,
        hotel?.city,
        hotel?.destination,
        hotel?.area,
        hotel?.zone,
        hotel?.district,
        hotel?.address,
        hotel?.description
      ].join(" "));

      let score = 0;
      if (wantedCity && text.includes(wantedCity)) score += 1000;
      if (wantedArea && text.includes(wantedArea)) score += 600;

      return { hotel, score };
    })
    .filter((x) => !wantedCity || x.score > 0)
    .sort((a, b) => b.score - a.score || MSH_PUBLIC_PRICE(b.hotel) - MSH_PUBLIC_PRICE(a.hotel))
    .slice(0, limit)
    .map((x) => x.hotel);

  return rows;
}

function MSH_PUBLIC_MERGE_HOTELS(items) {
  const map = new Map();

  for (const hotel of items) {
    const key = MSH_PUBLIC_NORM([
      MSH_PUBLIC_ID(hotel),
      hotel?.name,
      hotel?.hotel_name,
      hotel?.city,
      hotel?.country
    ].join("|"));

    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, hotel);
      continue;
    }

    const existingPrice = MSH_PUBLIC_PRICE(existing);
    const newPrice = MSH_PUBLIC_PRICE(hotel);

    if ((newPrice > 0 && existingPrice <= 0) || MSH_PUBLIC_IMAGES(hotel).length > MSH_PUBLIC_IMAGES(existing).length) {
      map.set(key, { ...existing, ...hotel });
    }
  }

  return Array.from(map.values());
}

app.get("/api/customer-global-hotels", async (req, res) => {
  try {
    const country = MSH_PUBLIC_CLEAN_TEXT(req.query.country || "United Kingdom");
    const requestedCity = MSH_PUBLIC_CLEAN_TEXT(req.query.city || "London");
    const currency = MSH_PUBLIC_CLEAN_TEXT(req.query.currency || "GBP").toUpperCase();
    const checkIn = MSH_PUBLIC_CLEAN_TEXT(req.query.checkIn || req.query.checkin || "");
    const checkOut = MSH_PUBLIC_CLEAN_TEXT(req.query.checkOut || req.query.checkout || "");
    const guests = MSH_PUBLIC_CLEAN_TEXT(req.query.guests || "2");
    const rooms = MSH_PUBLIC_CLEAN_TEXT(req.query.rooms || "1");
    const limit = Math.max(1, Math.min(Number(req.query.limit || 1000), 1000));

    const fixed = MSH_PUBLIC_CITY_PARENT(country, requestedCity);
    const supplierCity = fixed.supplierCity || requestedCity;
    const area = fixed.area || "";

    const supplierResult = await MSH_PUBLIC_TRY_SUPPLIER_SEARCH(req, {
      country,
      city: supplierCity,
      currency,
      checkIn,
      checkOut,
      guests,
      rooms,
      limit
    });

    const supplierHotels = supplierResult.hotels.map((hotel) =>
      MSH_PUBLIC_NORMALISE_HOTEL(hotel, { country, city: supplierCity, area, currency }, "supplier_live")
    );

    const catalogueHotels = MSH_PUBLIC_CATALOGUE_SEARCH({
      country,
      city: supplierCity,
      area,
      currency,
      limit
    }).map((hotel) =>
      MSH_PUBLIC_NORMALISE_HOTEL(hotel, { country, city: supplierCity, area, currency }, "catalogue")
    );

    const merged = MSH_PUBLIC_MERGE_HOTELS([...supplierHotels, ...catalogueHotels])
      .sort((a, b) => {
        const aLive = MSH_PUBLIC_PRICE(a) > 0 ? 1 : 0;
        const bLive = MSH_PUBLIC_PRICE(b) > 0 ? 1 : 0;
        if (bLive !== aLive) return bLive - aLive;
        return MSH_PUBLIC_PRICE(a) - MSH_PUBLIC_PRICE(b);
      })
      .slice(0, limit);

    const customerHotels = merged.map((hotel) => {
      const cleanHotel = { ...hotel };
      delete cleanHotel.supplierName;
      delete cleanHotel.supplierDisplay;
      delete cleanHotel.supplierLabel;
      return cleanHotel;
    });

    const liveCount = customerHotels.filter((h) => MSH_PUBLIC_PRICE(h) > 0).length;
    const requestCount = customerHotels.length - liveCount;

    return res.json({
      ok: true,
      source: "global_live_plus_catalogue",
      searched: {
        country,
        requestedCity,
        supplierCity,
        area
      },
      suppliers: supplierResult.suppliers || {},
      supplierStatus: supplierResult.supplierStatus || {},
      livePricedHotels: liveCount,
      requestAvailabilityHotels: requestCount,
      count: customerHotels.length,
      customerMessage: `${liveCount} live-priced hotels and ${requestCount} additional real properties loaded.`,
      hotels: customerHotels
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Hotel search failed."
    });
  }
});


const KLOOK_AFFILIATE_ID = "123338";
const KLOOK_AFFILIATE_AD_ID = "1303191";

function mshCleanKlookText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function mshKlookAffiliateLink(klookUrl, tag = "") {
  const safeUrl = mshCleanKlookText(klookUrl);
  const safeTag = mshCleanKlookText(tag);

  const params = new URLSearchParams({
    aid: KLOOK_AFFILIATE_ID,
    aff_adid: KLOOK_AFFILIATE_AD_ID,
    k_site: safeUrl
  });

  if (safeTag) params.set("aff_label", safeTag);

  return `https://affiliate.klook.com/redirect?${params.toString()}`;
}

function mshKlookDestinationItems(city, country) {
  const c = mshCleanKlookText(city || "London");
  const countryText = mshCleanKlookText(country || "");
  const key = c.toLowerCase();

  const map = {
    london: [
      ["Tower of London and Crown Jewels", "Tower of London", "From US$51", "https://www.klook.com/en-US/activity/3491-tower-of-london-entry-ticket-london/"],
      ["London attractions and sightseeing", "London", "View live options", "https://www.klook.com/en-US/search/result/?query=London"],
      ["London airport transfers", "London", "View live options", "https://www.klook.com/en-US/search/result/?query=London%20airport%20transfer"]
    ],
    paris: [
      ["Paris attractions and sightseeing", "Paris", "View live options", "https://www.klook.com/en-US/search/result/?query=Paris"],
      ["Eiffel Tower experiences", "Paris", "View live options", "https://www.klook.com/en-US/search/result/?query=Eiffel%20Tower"],
      ["Disneyland Paris", "Paris", "View live options", "https://www.klook.com/en-US/search/result/?query=Disneyland%20Paris"]
    ],
    dubai: [
      ["Dubai attractions and experiences", "Dubai", "View live options", "https://www.klook.com/en-US/search/result/?query=Dubai"],
      ["Burj Khalifa tickets and experiences", "Dubai", "View live options", "https://www.klook.com/en-US/search/result/?query=Burj%20Khalifa"],
      ["Dubai desert safari", "Dubai", "View live options", "https://www.klook.com/en-US/search/result/?query=Dubai%20desert%20safari"]
    ],
    singapore: [
      ["Singapore attractions and experiences", "Singapore", "View live options", "https://www.klook.com/en-US/search/result/?query=Singapore"],
      ["Gardens by the Bay", "Singapore", "View live options", "https://www.klook.com/en-US/search/result/?query=Gardens%20by%20the%20Bay"],
      ["Singapore airport transfers", "Singapore", "View live options", "https://www.klook.com/en-US/search/result/?query=Singapore%20airport%20transfer"]
    ],
    tokyo: [
      ["Tokyo attractions and experiences", "Tokyo", "View live options", "https://www.klook.com/en-US/search/result/?query=Tokyo"],
      ["Tokyo theme parks", "Tokyo", "View live options", "https://www.klook.com/en-US/search/result/?query=Tokyo%20theme%20park"],
      ["Tokyo rail passes and transport", "Tokyo", "View live options", "https://www.klook.com/en-US/search/result/?query=Tokyo%20rail%20pass"]
    ]
  };

  const pickedKey =
    key.includes("london") ? "london" :
    key.includes("paris") ? "paris" :
    key.includes("dubai") ? "dubai" :
    key.includes("singapore") ? "singapore" :
    key.includes("tokyo") ? "tokyo" :
    "global";

  const rows = map[pickedKey] || [
    [`Experiences in ${c}`, c, "View live options", `https://www.klook.com/en-US/search/result/?query=${encodeURIComponent(c)}`],
    [`Airport transfers in ${c}`, c, "View live options", `https://www.klook.com/en-US/search/result/?query=${encodeURIComponent(c + " airport transfer")}`],
    [`Tours and activities in ${c}`, c, "View live options", `https://www.klook.com/en-US/search/result/?query=${encodeURIComponent(c + " tours activities")}`]
  ];

  return rows.map(([title, area, price, url], index) => ({
    id: `klook-${pickedKey}-${index + 1}`,
    provider: "Klook",
    partnerType: "Affiliate experience partner",
    title,
    city: c,
    country: countryText,
    area,
    priceText: price,
    affiliateUrl: mshKlookAffiliateLink(url, `myspace-${pickedKey}-${index + 1}`),
    directUrl: url,
    customerNote: "Final availability, price and booking terms are confirmed before purchase."
  }));
}

app.get("/api/klook/status", (req, res) => {
  res.json({
    ok: true,
    provider: "Klook",
    affiliateReady: true,
    affiliateId: KLOOK_AFFILIATE_ID,
    website: "MySpace Hotel",
    message: "Klook affiliate tracking is configured for MySpace Hotel."
  });
});

app.get("/api/klook/experiences", (req, res) => {
  const city = mshCleanKlookText(req.query.city || "London");
  const country = mshCleanKlookText(req.query.country || "United Kingdom");

  res.json({
    ok: true,
    source: "klook_affiliate_destination_experiences",
    provider: "Klook",
    city,
    country,
    count: mshKlookDestinationItems(city, country).length,
    experiences: mshKlookDestinationItems(city, country)
  });
});

app.get("/api/klook/redirect", (req, res) => {
  const target = mshCleanKlookText(req.query.url || "");
  const tag = mshCleanKlookText(req.query.tag || "myspace-hotel");

  if (!target || !/^https:\/\/www\.klook\.com\//i.test(target)) {
    return res.status(400).json({
      ok: false,
      message: "A valid Klook URL is required."
    });
  }

  return res.redirect(mshKlookAffiliateLink(target, tag));
});


app.get("/api/selected-hotel-live-rate", async (req, res) => {
  try {
    const country = clean(req.query.country || "");
    const city = clean(req.query.city || "");
    const currency = clean(req.query.currency || "GBP").toUpperCase();
    const hotelId = clean(req.query.hotelId || req.query.hotel_id || "");
    const hotelName = clean(req.query.hotelName || req.query.hotel_name || "");
    const limit = Math.max(1, Math.min(Number(req.query.limit || 1000), 1000));

    function norm(v) {
      return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    }

    function getPrice(h) {
      const room = Array.isArray(h.rooms) && h.rooms.length ? h.rooms[0] : {};
      const values = [
        h.price, h.convertedPrice, h.displayPrice, h.amount, h.total, h.totalPrice,
        room.price, room.convertedPrice, room.displayPrice, room.amount, room.total
      ];
      for (const v of values) {
        const n = number(v);
        if (n > 0) return money(n);
      }
      return 0;
    }

    function bestRoom(h) {
      const rooms = Array.isArray(h.rooms) ? h.rooms : [];
      return rooms
        .map((r) => ({ ...r, _p: money(r.convertedPrice || r.price || r.displayPrice || r.amount || 0) }))
        .filter((r) => r._p > 0)
        .sort((a, b) => a._p - b._p)[0] || null;
    }

    function idMatch(h) {
      const wanted = norm(hotelId).replace(/^webbeds /, "").replace(/^hotelbeds /, "");
      if (!wanted) return false;
      const ids = [
        h.hotelId, h.hotel_id, h.id, h.code, h.supplier_hotel_id,
        h.internalSupplierSettlement?.rateSourceId,
        h.rate_source_id
      ].map((x) => norm(x).replace(/^webbeds /, "").replace(/^hotelbeds /, ""));
      return ids.some((x) => x && (x === wanted || x.includes(wanted) || wanted.includes(x)));
    }

    function nameMatch(h) {
      const wanted = norm(hotelName);
      const got = norm(h.name || h.hotel_name || h.hotelName);
      if (!wanted || !got) return false;
      return got === wanted || got.includes(wanted) || wanted.includes(got);
    }

    function score(h) {
      let s = 0;
      if (idMatch(h)) s += 200;
      if (nameMatch(h)) s += 150;
      if (norm(h.country) === norm(country)) s += 25;
      if (norm(h.city) === norm(city)) s += 25;
      if (getPrice(h) > 0 || bestRoom(h)) s += 300;
      if (h.sourceType === "supplier_live" || String(h.source || "").includes("live")) s += 50;
      return s;
    }

    const fixed = typeof MSH_PUBLIC_CITY_PARENT === "function"
      ? MSH_PUBLIC_CITY_PARENT(country, city)
      : { supplierCity: city, area: "" };

    const supplierCity = fixed.supplierCity || city;
    const area = fixed.area || "";

    const supplierResult = typeof MSH_PUBLIC_TRY_SUPPLIER_SEARCH === "function"
      ? await MSH_PUBLIC_TRY_SUPPLIER_SEARCH(req, {
          country,
          city: supplierCity,
          currency,
          checkIn: clean(req.query.checkIn || req.query.checkin || ""),
          checkOut: clean(req.query.checkOut || req.query.checkout || ""),
          guests: clean(req.query.guests || "2"),
          rooms: clean(req.query.rooms || "1"),
          limit
        })
      : { hotels: [], suppliers: {}, supplierStatus: {} };

    const supplierHotels = Array.isArray(supplierResult.hotels)
      ? supplierResult.hotels.map((h) => MSH_PUBLIC_NORMALISE_HOTEL(h, { country, city: supplierCity, area, currency }, "supplier_live"))
      : [];

    const catalogueHotels = typeof MSH_PUBLIC_CATALOGUE_SEARCH === "function"
      ? MSH_PUBLIC_CATALOGUE_SEARCH({ country, city: supplierCity, area, currency, limit })
          .map((h) => MSH_PUBLIC_NORMALISE_HOTEL(h, { country, city: supplierCity, area, currency }, "catalogue"))
      : [];

    const merged = typeof MSH_PUBLIC_MERGE_HOTELS === "function"
      ? MSH_PUBLIC_MERGE_HOTELS([...supplierHotels, ...catalogueHotels])
      : [...supplierHotels, ...catalogueHotels];

    const matched = merged
      .filter((h) => idMatch(h) || nameMatch(h))
      .sort((a, b) => {
        const sa = score(a);
        const sb = score(b);
        if (sb !== sa) return sb - sa;
        return getPrice(a) - getPrice(b);
      });

    const selected = matched.find((h) => getPrice(h) > 0 || bestRoom(h)) || null;

    if (!selected) {
      return res.status(404).json({
        ok: false,
        message: "No current live rate was found for the selected hotel. The hotel remains available for request/availability check only.",
        selected_hotel: {
          hotelId,
          hotelName,
          country,
          city
        },
        searched: {
          supplierCity,
          area,
          supplierCandidates: supplierHotels.length,
          catalogueCandidates: catalogueHotels.length,
          matchedCandidates: matched.length
        }
      });
    }

    const room = bestRoom(selected);
    const amount = room ? room._p : getPrice(selected);
    const cleanHotel = {
      ...selected,
      price: amount,
      convertedPrice: amount,
      displayPrice: amount,
      currency,
      displayCurrency: currency,
      availableToBook: true,
      customerBadge: "Live hotel rate",
      availabilityMode: "live_rate",
      selectedRoom: room ? {
        roomCode: room.roomCode || room.room_code || "STANDARD",
        roomName: room.roomName || room.room_name || "Available room",
        board: room.board || "Available room",
        price: amount,
        convertedPrice: amount,
        displayCurrency: room.displayCurrency || currency,
        rate_source_id: room.rate_source_id || selected.rate_source_id || "",
        rate_source_timestamp: room.rate_source_timestamp || selected.rate_source_timestamp || nowISO()
      } : selected.selectedRoom
    };

    return res.json({
      ok: true,
      source: "selected_hotel_live_rate",
      hotel: cleanHotel,
      hotels: [cleanHotel],
      customer_offer: {
        hotelId: cleanHotel.hotelId || cleanHotel.hotel_id,
        hotelName: cleanHotel.name || cleanHotel.hotel_name,
        country: cleanHotel.country,
        city: cleanHotel.city,
        roomCode: cleanHotel.selectedRoom?.roomCode || "STANDARD",
        roomName: cleanHotel.selectedRoom?.roomName || "Available room",
        amount,
        price: amount,
        currency,
        rate_source_id: cleanHotel.selectedRoom?.rate_source_id || cleanHotel.rate_source_id || "",
        rate_source_timestamp: cleanHotel.selectedRoom?.rate_source_timestamp || cleanHotel.rate_source_timestamp || nowISO(),
        source_health: "verified"
      },
      message: "Current live rate found for the selected hotel."
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: "Selected hotel live-rate search failed.",
      error: err.message
    });
  }
});


app.get("/api/live-rate-cascade", async (req, res) => {
  const startedAt = Date.now();

  try {
    const country = clean(req.query.country || "");
    const city = clean(req.query.city || "");
    const currency = clean(req.query.currency || "GBP").toUpperCase();
    const hotelId = clean(req.query.hotelId || req.query.hotel_id || "");
    const hotelName = clean(req.query.hotelName || req.query.hotel_name || "");
    const checkIn = clean(req.query.checkIn || req.query.checkin || "");
    const checkOut = clean(req.query.checkOut || req.query.checkout || "");
    const guests = clean(req.query.guests || "2");
    const rooms = clean(req.query.rooms || "1");
    const limit = Math.max(1, Math.min(Number(req.query.limit || 1000), 1000));

    function norm(v) {
      return clean(v).toLowerCase().replace(/^webbeds[-\s]*/i, "").replace(/^hotelbeds[-\s]*/i, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    }

    function priceOf(h) {
      const room = Array.isArray(h?.rooms) && h.rooms.length ? h.rooms[0] : {};
      const selectedRoom = h?.selectedRoom || {};
      const values = [
        h?.price, h?.convertedPrice, h?.displayPrice, h?.amount, h?.total, h?.totalPrice,
        room?.price, room?.convertedPrice, room?.displayPrice, room?.amount, room?.total,
        selectedRoom?.price, selectedRoom?.convertedPrice, selectedRoom?.displayPrice, selectedRoom?.amount, selectedRoom?.total
      ];

      for (const value of values) {
        const n = number(value);
        if (n > 0) return money(n);
      }

      return 0;
    }

    function bestRoomOf(h) {
      const rows = [
        ...(Array.isArray(h?.rooms) ? h.rooms : []),
        ...(h?.selectedRoom ? [h.selectedRoom] : [])
      ];

      return rows
        .map((room) => ({
          ...room,
          _mshPrice: money(room.convertedPrice || room.price || room.displayPrice || room.amount || room.total || 0)
        }))
        .filter((room) => room._mshPrice > 0)
        .sort((a, b) => a._mshPrice - b._mshPrice)[0] || null;
    }

    function idMatches(h) {
      const wanted = norm(hotelId);
      if (!wanted) return false;

      const ids = [
        h?.hotelId,
        h?.hotel_id,
        h?.id,
        h?.code,
        h?.hotel_code,
        h?.supplier_hotel_id,
        h?.supplierHotelId,
        h?.rate_source_id,
        h?.internalSupplierSettlement?.rateSourceId,
        h?.rooms?.[0]?.rate_source_id
      ].map(norm).filter(Boolean);

      return ids.some((id) => id === wanted || id.includes(wanted) || wanted.includes(id));
    }

    function nameMatches(h) {
      const wanted = norm(hotelName);
      if (!wanted) return false;

      const names = [
        h?.name,
        h?.hotel_name,
        h?.hotelName
      ].map(norm).filter(Boolean);

      return names.some((name) => name === wanted || name.includes(wanted) || wanted.includes(name));
    }

    function locationMatches(h) {
      const wantedCountry = norm(country);
      const wantedCity = norm(city);
      const gotCountry = norm(h?.country || h?.location?.country);
      const gotCity = norm(h?.city || h?.destination || h?.location?.city);

      const countryOk = !wantedCountry || !gotCountry || gotCountry === wantedCountry;
      const cityOk = !wantedCity || !gotCity || gotCity === wantedCity || gotCity.includes(wantedCity) || wantedCity.includes(gotCity);

      return countryOk && cityOk;
    }

    function scoreHotel(h, sourceName) {
      let score = 0;

      if (idMatches(h)) score += 600;
      if (nameMatches(h)) score += 450;
      if (locationMatches(h)) score += 120;

      const p = priceOf(h);
      if (p > 0) score += 1000;

      const sourceText = norm([sourceName, h?.source, h?.sourceType, h?.supplier, h?.supplierLabel, h?.internalSupplierSettlement?.supplier].join(" "));
      if (sourceText.includes("live")) score += 100;
      if (sourceText.includes("webbeds")) score += 90;
      if (sourceText.includes("hotelbeds")) score += 90;
      if (sourceText.includes("catalogue")) score += 40;

      return score;
    }

    function normaliseFoundHotel(h, sourceName) {
      const room = bestRoomOf(h);
      const amount = room ? room._mshPrice : priceOf(h);
      const displayCurrency = clean(room?.displayCurrency || room?.currency || h?.displayCurrency || h?.currency || currency).toUpperCase();

      return {
        ...h,
        hotelId: h?.hotelId || h?.hotel_id || h?.id || hotelId,
        hotel_id: h?.hotel_id || h?.hotelId || h?.id || hotelId,
        name: clean(h?.name || h?.hotel_name || h?.hotelName || hotelName),
        hotel_name: clean(h?.hotel_name || h?.name || h?.hotelName || hotelName),
        country: clean(h?.country || country),
        city: clean(h?.city || city),
        price: amount,
        convertedPrice: amount,
        displayPrice: amount,
        currency: displayCurrency,
        displayCurrency,
        availableToBook: amount > 0,
        customerBadge: "Live hotel rate",
        availabilityMode: "live_rate",
        sourceType: sourceName,
        selectedRoom: {
          roomCode: clean(room?.roomCode || room?.room_code || h?.roomCode || "STANDARD"),
          roomName: clean(room?.roomName || room?.room_name || h?.roomName || "Available room"),
          board: clean(room?.board || h?.board || "Available room"),
          price: amount,
          convertedPrice: amount,
          displayCurrency,
          rate_source_id: clean(room?.rate_source_id || h?.rate_source_id || ""),
          rate_source_timestamp: clean(room?.rate_source_timestamp || h?.rate_source_timestamp || nowISO()),
          source_health: "verified"
        },
        rate_source_id: clean(room?.rate_source_id || h?.rate_source_id || ""),
        rate_source_timestamp: clean(room?.rate_source_timestamp || h?.rate_source_timestamp || nowISO()),
        source_health: "verified"
      };
    }

    async function fetchJsonSource(sourceName, url, timeoutMs = 9000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        clearTimeout(timer);

        return {
          sourceName,
          ok: response.ok && Boolean(payload),
          status: response.status,
          payload,
          hotels: Array.isArray(payload.hotels) ? payload.hotels : [],
          offer: payload.customer_offer || payload.best_offer || payload.offer || null
        };
      } catch (err) {
        clearTimeout(timer);
        return {
          sourceName,
          ok: false,
          status: 0,
          payload: {},
          hotels: [],
          offer: null,
          error: err.message
        };
      }
    }

    async function directSupplierSource(sourceName, queryCity, area = "") {
      try {
        if (typeof MSH_PUBLIC_TRY_SUPPLIER_SEARCH !== "function") {
          return { sourceName, ok: false, hotels: [], supplierStatus: { direct: "not_available" } };
        }

        const supplierResult = await MSH_PUBLIC_TRY_SUPPLIER_SEARCH(req, {
          country,
          city: queryCity,
          currency,
          checkIn,
          checkOut,
          guests,
          rooms,
          limit
        });

        const hotels = Array.isArray(supplierResult.hotels)
          ? supplierResult.hotels.map((hotel) => {
              if (typeof MSH_PUBLIC_NORMALISE_HOTEL === "function") {
                return MSH_PUBLIC_NORMALISE_HOTEL(hotel, { country, city: queryCity, area, currency }, sourceName);
              }
              return hotel;
            })
          : [];

        return {
          sourceName,
          ok: hotels.length > 0,
          hotels,
          supplierStatus: supplierResult.supplierStatus || {},
          suppliers: supplierResult.suppliers || {}
        };
      } catch (err) {
        return { sourceName, ok: false, hotels: [], error: err.message };
      }
    }

    async function catalogueSource(sourceName, queryCity, area = "") {
      try {
        if (typeof MSH_PUBLIC_CATALOGUE_SEARCH !== "function") {
          return { sourceName, ok: false, hotels: [] };
        }

        const hotels = MSH_PUBLIC_CATALOGUE_SEARCH({
          country,
          city: queryCity,
          area,
          currency,
          limit
        }).map((hotel) => {
          if (typeof MSH_PUBLIC_NORMALISE_HOTEL === "function") {
            return MSH_PUBLIC_NORMALISE_HOTEL(hotel, { country, city: queryCity, area, currency }, sourceName);
          }
          return hotel;
        });

        return { sourceName, ok: hotels.length > 0, hotels };
      } catch (err) {
        return { sourceName, ok: false, hotels: [], error: err.message };
      }
    }

    function chooseBestCandidate(sourceName, hotels, offer = null) {
      var liveSourceName = norm(sourceName);
      var allowedLiveSource =
        liveSourceName.includes("supplier") ||
        liveSourceName.includes("webbeds") ||
        liveSourceName.includes("hotelbeds") ||
        liveSourceName.includes("selected hotel live") ||
        liveSourceName.includes("multi supplier") ||
        liveSourceName.includes("customer global");

      if (!allowedLiveSource || liveSourceName.includes("catalogue") || liveSourceName.includes("plain search") || liveSourceName.includes("existing inventory")) {
        return null;
      }
<<<<<<< HEAD
      var liveSourceName = norm(sourceName);
      var allowedLiveSource =
        liveSourceName.includes("supplier") ||
        liveSourceName.includes("webbeds") ||
        liveSourceName.includes("hotelbeds") ||
        liveSourceName.includes("selected hotel live") ||
        liveSourceName.includes("multi supplier") ||
        liveSourceName.includes("customer global");

      if (!allowedLiveSource || liveSourceName.includes("catalogue") || liveSourceName.includes("plain search") || liveSourceName.includes("existing inventory")) {
        return null;
      }
=======
>>>>>>> parent of b060500 (Prevent placeholder catalogue from winning live rate cascade)
      const candidates = [];

      if (offer && number(offer.amount || offer.price) > 0) {
        candidates.push({
          hotelId: offer.hotelId || hotelId,
          hotel_id: offer.hotelId || hotelId,
          name: offer.hotelName || hotelName,
          hotel_name: offer.hotelName || hotelName,
          country,
          city,
          price: money(offer.amount || offer.price),
          currency: clean(offer.currency || currency).toUpperCase(),
          rooms: [{
            roomCode: offer.roomCode || "STANDARD",
            roomName: offer.roomName || "Available room",
            board: offer.board || "Available room",
            price: money(offer.amount || offer.price),
            convertedPrice: money(offer.amount || offer.price),
            displayCurrency: clean(offer.currency || currency).toUpperCase(),
            rate_source_id: offer.rate_source_id || "",
            rate_source_timestamp: offer.rate_source_timestamp || nowISO()
          }],
          sourceType: sourceName,
          rate_source_id: offer.rate_source_id || "",
          rate_source_timestamp: offer.rate_source_timestamp || nowISO()
        });
      }

      for (const h of hotels || []) {
        candidates.push(h);
      }

      const matched = candidates
        .filter((h) => priceOf(h) > 0)
        .map((h) => ({ hotel: h, score: scoreHotel(h, sourceName), price: priceOf(h) }))
        .filter((x) => {
          if (hotelId || hotelName) return x.score >= 1000 || idMatches(x.hotel) || nameMatches(x.hotel);
          return locationMatches(x.hotel);
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.price - b.price;
        });

      return matched[0]?.hotel || null;
    }

    const fixed = typeof MSH_PUBLIC_CITY_PARENT === "function"
      ? MSH_PUBLIC_CITY_PARENT(country, city)
      : { supplierCity: city, area: "" };

    const supplierCity = fixed.supplierCity || city;
    const area = fixed.area || "";

    const params = new URLSearchParams({
      country,
      city,
      checkIn,
      checkOut,
      checkin: checkIn,
      checkout: checkOut,
      guests,
      rooms,
      currency,
      hotelId,
      hotel_id: hotelId,
      hotelName,
      hotel_name: hotelName,
      limit: String(limit)
    });

    const supplierParams = new URLSearchParams({
      country,
      city: supplierCity,
      checkIn,
      checkOut,
      checkin: checkIn,
      checkout: checkOut,
      guests,
      rooms,
      currency,
      hotelId,
      hotel_id: hotelId,
      hotelName,
      hotel_name: hotelName,
      limit: String(limit)
    });

    const base = `http://127.0.0.1:${PORT}`;
    const attempts = [];

    async function tryAndReturn(sourcePromise) {
      const result = await sourcePromise;
      const best = chooseBestCandidate(result.sourceName, result.hotels || [], result.offer || null);

      attempts.push({
        source: result.sourceName,
        ok: Boolean(result.ok),
        status: result.status || "",
        candidates: Array.isArray(result.hotels) ? result.hotels.length : 0,
        foundPositiveMatch: Boolean(best),
        error: result.error || "",
        supplierStatus: result.supplierStatus || {}
      });

      if (!best) return null;

      return {
        result,
        hotel: normaliseFoundHotel(best, result.sourceName)
      };
    }

    const chain = [
      () => directSupplierSource("direct_supplier_live_area", supplierCity, area),
      () => fetchJsonSource("selected_hotel_live_rate", `${base}/api/selected-hotel-live-rate?${params.toString()}`),
      () => fetchJsonSource("customer_global_live_plus_catalogue", `${base}/api/customer-global-hotels?${params.toString()}`),
      () => fetchJsonSource("multi_supplier_live", `${base}/api/multi-supplier-hotels?${params.toString()}`),
      () => fetchJsonSource("multi_supplier_parent_city_live", `${base}/api/multi-supplier-hotels?${supplierParams.toString()}`),
      () => fetchJsonSource("webbeds_live_city", `${base}/api/live-webbeds-hotels?${supplierParams.toString()}`),
      () => fetchJsonSource("webbeds_search_city", `${base}/api/webbeds/search?${supplierParams.toString()}`),
      () => {
        const rawId = hotelId.replace(/^WEBBEDS-/i, "").replace(/[^0-9,]/g, "");
        if (!rawId) return Promise.resolve({ sourceName: "webbeds_hotel_id_batch", ok: false, hotels: [], error: "no numeric WebBeds hotel id" });
        const idParams = new URLSearchParams(supplierParams);
        idParams.set("hotelIds", rawId);
        return fetchJsonSource("webbeds_hotel_id_batch", `${base}/api/webbeds/search-by-hotel-ids?${idParams.toString()}`);
      },
      
      
    ];

    for (const step of chain) {
      const found = await tryAndReturn(step());
      if (!found) continue;

      return res.json({
        ok: true,
        source: "live_rate_cascade",
        winning_source: found.result.sourceName,
        hotel: found.hotel,
        hotels: [found.hotel],
        customer_offer: {
          hotelId: found.hotel.hotelId || found.hotel.hotel_id,
          hotelName: found.hotel.name || found.hotel.hotel_name,
          country: found.hotel.country,
          city: found.hotel.city,
          roomCode: found.hotel.selectedRoom?.roomCode || "STANDARD",
          roomName: found.hotel.selectedRoom?.roomName || "Available room",
          board: found.hotel.selectedRoom?.board || "Available room",
          amount: found.hotel.price,
          price: found.hotel.price,
          currency: found.hotel.displayCurrency || found.hotel.currency || currency,
          rate_source_id: found.hotel.selectedRoom?.rate_source_id || found.hotel.rate_source_id || "",
          rate_source_timestamp: found.hotel.selectedRoom?.rate_source_timestamp || found.hotel.rate_source_timestamp || nowISO(),
          source_health: "verified"
        },
        attempts,
        elapsedMs: Date.now() - startedAt,
        message: "Current live rate found."
      });
    }

    return res.status(404).json({
      ok: false,
      source: "live_rate_cascade",
      message: "No current positive live rate was found from the available sources. The hotel remains available for request/availability check only.",
      selected_hotel: {
        hotelId,
        hotelName,
        country,
        city
      },
      attempts,
      elapsedMs: Date.now() - startedAt
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      source: "live_rate_cascade",
      message: "Live-rate cascade failed.",
      error: err.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  const destinations = buildDestinations();

  console.log("====================================");
  console.log("MYSPACE HOTEL SERVICE READY");
  console.log("PORT:", PORT);
  console.log("HOTELS:", readHotels().length);
  console.log("COUNTRIES:", destinations.length);
  console.log("CITIES:", destinations.reduce((sum, x) => sum + x.cities.length, 0));
  console.log("SUPPLIER TRACKING: READY");
  console.log("SUPPLIER AUDIT FILE:", SUPPLIER_AUDIT_FILE);
  console.log("STRIPE:", process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK ? "READY" : "NOT CONFIGURED");
  console.log("MAIL:", process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ? "READY" : "NOT CONFIGURED");
  console.log("MAIL TO:", mailTo());
  console.log("BOOKING SERVICE: READY");
  console.log("PARTNERSHIP ENQUIRIES: READY");
  console.log("CUSTOMER SUPPORT: READY");
  console.log("====================================");
});

















































<<<<<<< HEAD


=======
>>>>>>> parent of b060500 (Prevent placeholder catalogue from winning live rate cascade)
