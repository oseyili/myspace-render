const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");

const app = express();
const PORT = process.env.PORT || 5050;
const JWT_SECRET = process.env.JWT_SECRET || "MSH_ENTERPRISE_JWT_SECRET";

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));

app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 2000 }));

const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const HOTELS_FILE = path.join(DATA_DIR, "live_hotels.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const WEBHOOK_FILE = path.join(DATA_DIR, "webhook_events.json");
const AUDIT_FILE = path.join(DATA_DIR, "partner_audit_log.json");
const PARTNERS_FILE = path.join(DATA_DIR, "partners.json");
const MAPPINGS_FILE = path.join(DATA_DIR, "pms_mappings.json");
const RETRY_FILE = path.join(DATA_DIR, "webhook_retry_queue.json");
const FAILOVER_FILE = path.join(DATA_DIR, "supplier_failover.json");
const RECOVERY_FILE = path.join(DATA_DIR, "booking_recovery.json");

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
}

ensureFile(BOOKINGS_FILE, []);
ensureFile(WEBHOOK_FILE, []);
ensureFile(AUDIT_FILE, []);
ensureFile(MAPPINGS_FILE, []);
ensureFile(RETRY_FILE, []);
ensureFile(FAILOVER_FILE, []);
ensureFile(RECOVERY_FILE, []);
ensureFile(PARTNERS_FILE, [{ partner_id: "oracle-ohip", token: "MSH_ENTERPRISE_TOKEN_001", webhook_secret: "MSH_WEBHOOK_SECRET_001", enabled: true }]);

function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJSON(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function nowISO() {
  return new Date().toISOString();
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

function getHotels() {
  return readJSON(HOTELS_FILE, []);
}

function bookingCode() {
  return "MSH-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Date.now().toString().slice(-5);
}

function audit(event, payload = {}) {
  const rows = readJSON(AUDIT_FILE, []);
  rows.unshift({ id: crypto.randomUUID(), event, created_at: nowISO(), payload });
  writeJSON(AUDIT_FILE, rows.slice(0, 15000));
}

function webhookEvent(event, payload = {}) {
  const rows = readJSON(WEBHOOK_FILE, []);
  rows.unshift({ id: crypto.randomUUID(), event, created_at: nowISO(), payload });
  writeJSON(WEBHOOK_FILE, rows.slice(0, 15000));
}

function createJWT(partner) {
  return jwt.sign({ partner_id: partner.partner_id }, JWT_SECRET, { expiresIn: "7d" });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");
  try {
    req.partner = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}

function verifyWebhookSignature(req, secret) {
  const signature = req.headers["x-webhook-signature"];
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
  return signature === expected;
}

function hotelToCustomerShape(h) {
  const rate = Array.isArray(h.rates) ? h.rates.find((r) => number(r.nightly_rate) > 0) : null;

  return {
    hotel_id: clean(h.hotel_id),
    hotel_code: clean(h.hotel_id),
    hotel_name: clean(h.name || h.hotel_name),
    name: clean(h.name || h.hotel_name),
    country: clean(h.country),
    city: clean(h.city),
    area: clean(h.area),
    address: clean(h.address),
    rating: clean(h.rating),
    latitude: clean(h.latitude),
    longitude: clean(h.longitude),
    image_url: clean(h.image_url),
    direct_image_url: clean(h.image_url),
    property_type: clean(h.property_type || "Hotel"),
    live_rate_ready: Boolean(rate),
    price_confirmation_required: !rate,
    room_count: Array.isArray(h.rooms) ? h.rooms.length : 1,
    rooms: Array.isArray(h.rates)
      ? h.rates.slice(0, 20).map((r) => ({
          room_name: clean(r.room_name || r.rate_name || "Selected room"),
          board_name: clean(r.rate_name || "Room only"),
          payment_type: "Secure checkout",
          currency: clean(r.currency || "GBP"),
          amount: money(r.nightly_rate),
          rate_key: clean(r.rate_id),
          cancellation_policies: []
        }))
      : [],
    first_rate: rate
      ? {
          room_name: clean(rate.room_name || rate.rate_name || "Selected room"),
          board_name: clean(rate.rate_name || "Room only"),
          payment_type: "Secure checkout",
          currency: clean(rate.currency || "GBP"),
          amount: money(rate.nightly_rate),
          rate_key: clean(rate.rate_id),
          cancellation_policies: []
        }
      : null
  };
}

function customerSearch(country, city, area, keyword, propertyType, limit) {
  let hotels = getHotels()
    .filter((h) => clean(h.country) === clean(country) && clean(h.city) === clean(city))
    .map(hotelToCustomerShape);

  if (area) {
    const a = lower(area);
    hotels = hotels.filter((h) => lower([h.area, h.address, h.hotel_name].join(" ")).includes(a));
  }

  if (keyword) {
    const q = lower(keyword);
    hotels = hotels.filter((h) => lower([h.hotel_name, h.area, h.address].join(" ")).includes(q));
  }

  if (propertyType && propertyType !== "all") {
    const p = lower(propertyType);
    hotels = hotels.filter((h) => {
      const t = lower(h.property_type);
      if (p === "hotel") return t.includes("hotel") || t.includes("resort") || !t.includes("apartment");
      if (p === "apartment") return t.includes("apartment") || t.includes("residence") || t.includes("villa");
      return true;
    });
  }

  hotels.sort((a, b) => {
    const la = a.live_rate_ready ? 1 : 0;
    const lb = b.live_rate_ready ? 1 : 0;
    if (lb !== la) return lb - la;
    return clean(a.hotel_name).localeCompare(clean(b.hotel_name));
  });

  return hotels.slice(0, Math.max(1, Math.min(number(limit || 160), 500)));
}

const swaggerDocument = {
  openapi: "3.0.0",
  info: { title: "MySpace Hotel Enterprise API", version: "3.1.0" },
  paths: {
    "/api/real-catalog/destinations": { get: { summary: "Customer country and city catalogue" } },
    "/api/hotels/search": { get: { summary: "Customer hotel search" } },
    "/api/auth/login": { post: { summary: "Partner JWT login" } },
    "/api/admin/dashboard": { get: { summary: "Partner dashboard metrics" } },
    "/api/hotels": { get: { summary: "Authenticated enterprise hotel inventory" } }
  }
};

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get("/", (req, res) => {
  const hotels = getHotels();
  const countries = new Set(hotels.map((h) => clean(h.country)).filter(Boolean));
  const cities = new Set(hotels.map((h) => `${clean(h.country)}|||${clean(h.city)}`).filter((x) => !x.endsWith("|||")));

  res.json({
    status: "live",
    service: "MySpace Hotel Enterprise API V3",
    search: "enabled",
    reservation: "enabled",
    payment_after_email: "enabled",
    hotels: hotels.length,
    countries: countries.size,
    cities: cities.size,
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    smtp: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
    timestamp: nowISO()
  });
});

app.get("/status", (req, res) => {
  const hotels = getHotels();
  const countries = new Set(hotels.map((h) => clean(h.country)).filter(Boolean));
  const cities = new Set(hotels.map((h) => `${clean(h.country)}|||${clean(h.city)}`).filter((x) => !x.endsWith("|||")));

  res.json({
    ok: true,
    api: "online",
    search: "enabled",
    reservations: readJSON(BOOKINGS_FILE, []).length,
    webhooks: readJSON(WEBHOOK_FILE, []).length,
    hotels_loaded: hotels.length,
    countries: countries.size,
    cities: cities.size,
    mappings: readJSON(MAPPINGS_FILE, []).length,
    retry_queue: readJSON(RETRY_FILE, []).length,
    failovers: readJSON(FAILOVER_FILE, []).length,
    recoveries: readJSON(RECOVERY_FILE, []).length,
    timestamp: nowISO()
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const index = new Map();

  for (const h of getHotels()) {
    const country = clean(h.country);
    const city = clean(h.city);
    if (!country || !city) continue;

    if (!index.has(country)) index.set(country, new Map());
    const cityMap = index.get(country);

    if (!cityMap.has(city)) {
      cityMap.set(city, { city, destination_code: city, live_hotels: 0, catalog_hotels: 0 });
    }

    const row = cityMap.get(city);
    row.catalog_hotels += 1;
    if (Array.isArray(h.rates) && h.rates.some((r) => number(r.nightly_rate) > 0)) row.live_hotels += 1;
  }

  const countries = [...index.entries()]
    .map(([country, cityMap]) => {
      const cities = [...cityMap.values()].sort((a, b) => {
        if (b.live_hotels !== a.live_hotels) return b.live_hotels - a.live_hotels;
        if (b.catalog_hotels !== a.catalog_hotels) return b.catalog_hotels - a.catalog_hotels;
        return a.city.localeCompare(b.city);
      });

      return {
        country,
        city_count: cities.length,
        hotel_count: cities.reduce((s, c) => s + c.catalog_hotels, 0),
        live_hotel_count: cities.reduce((s, c) => s + c.live_hotels, 0),
        cities
      };
    })
    .sort((a, b) => a.country.localeCompare(b.country));

  res.json({
    ok: true,
    countries,
    total_countries: countries.length,
    total_cities: countries.reduce((s, c) => s + c.city_count, 0)
  });
});

app.get("/api/hotels/search", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const area = clean(req.query.area);
  const keyword = clean(req.query.keyword);
  const propertyType = clean(req.query.property_type || req.query.stay_type || "all");
  const limit = number(req.query.limit || 160);

  if (!country || !city) {
    return res.json({ ok: true, hotels: [], count: 0, message: "Choose a country and destination." });
  }

  const hotels = customerSearch(country, city, area, keyword, propertyType, limit);

  res.json({
    ok: true,
    hotels,
    count: hotels.length,
    country,
    city,
    property_type: propertyType,
    message: hotels.length ? "Available stays loaded." : "No matching stay found."
  });
});

app.get("/api/hotels/live-check", (req, res) => {
  const hotelId = clean(req.query.hotel_id || req.query.hotel_code);
  const hotel = getHotels().find((h) => clean(h.hotel_id) === hotelId);

  if (!hotel) {
    return res.json({ ok: true, live_payment_ready: false, payment_ready: false, price_status: "Latest price will be confirmed before payment." });
  }

  const shaped = hotelToCustomerShape(hotel);

  if (!shaped.first_rate) {
    return res.json({ ok: true, live_payment_ready: false, payment_ready: false, price_status: "Latest price will be confirmed before payment." });
  }

  res.json({
    ok: true,
    live_payment_ready: true,
    payment_ready: true,
    price_status: "Current price is available for secure checkout.",
    ...shaped
  });
});

app.get("/api/currency/convert", (req, res) => {
  const amount = money(req.query.amount || 1);
  const from = clean(req.query.from_currency || req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to_currency || req.query.to || "USD").toUpperCase();

  const FX = { GBP: 1, USD: 1.27, EUR: 1.17, NGN: 1900, AED: 4.66, CAD: 1.72, AUD: 1.92, ZAR: 23.2, CHF: 1.11, JPY: 197, KES: 165, GHS: 17, INR: 106, SGD: 1.72 };

  if (from === to) return res.json({ ok: true, amount, from_currency: from, to_currency: to, rate: 1, converted: amount, source: "same_currency" });

  if (FX[from] && FX[to]) {
    const converted = money((amount / FX[from]) * FX[to]);
    return res.json({ ok: true, amount, from_currency: from, to_currency: to, rate: money(FX[to] / FX[from]), converted, source: "fallback_estimate" });
  }

  res.status(503).json({ ok: false, message: "Currency conversion is temporarily unavailable." });
});

app.get("/api/guide", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const area = clean(req.query.area);
  const hotel = clean(req.query.hotel);
  const destination = [hotel, area, city, country].filter(Boolean).join(", ");

  const emergency = {
    "United Kingdom": { emergency: "999 or 112", police: "999", ambulance: "999", fire: "999" },
    "United States": { emergency: "911", police: "911", ambulance: "911", fire: "911" },
    "France": { emergency: "112", police: "17", ambulance: "15", fire: "18" },
    "Spain": { emergency: "112", police: "112", ambulance: "112", fire: "112" },
    "Nigeria": { emergency: "112", police: "112", ambulance: "112", fire: "112" }
  }[country] || { emergency: "Check locally", police: "Check locally", ambulance: "Check locally", fire: "Check locally" };

  const q = encodeURIComponent(destination || `${city} ${country}`);

  res.json({
    ok: true,
    guide: {
      destination: destination || [city, country].filter(Boolean).join(", "),
      selected_stay: hotel,
      emergency,
      links: {
        hospital: `https://www.google.com/maps/search/hospital+near+${q}`,
        pharmacy: `https://www.google.com/maps/search/pharmacy+near+${q}`,
        police: `https://www.google.com/maps/search/police+station+near+${q}`,
        airport: `https://www.google.com/maps/search/airport+near+${q}`,
        restaurants: `https://www.google.com/maps/search/restaurants+near+${q}`,
        taxi: `https://www.google.com/maps/search/taxi+near+${q}`,
        train_or_metro: `https://www.google.com/maps/search/train+station+near+${q}`,
        attractions: `https://www.google.com/maps/search/things+to+do+near+${q}`
      }
    }
  });
});

app.post("/reservation-request", (req, res) => {
  const body = req.body || {};
  const code = bookingCode();
  const bookings = readJSON(BOOKINGS_FILE, []);

  const booking = {
    booking_reference: code,
    reservation_code: code,
    created_at: nowISO(),
    status: body.rate_key ? "PAYMENT_READY" : "CONFIRMATION_REQUIRED",
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
    rate_key: clean(body.rate_key),
    amount: money(body.amount),
    currency: clean(body.currency)
  };

  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);
  webhookEvent("reservation.created", booking);
  audit("customer.reservation.created", { booking_reference: code });

  res.json({
    ok: true,
    reservation_code: code,
    booking_reference: code,
    status: booking.status,
    payment_url: null,
    message: booking.status === "PAYMENT_READY" ? "Reservation prepared." : "Request received. We will confirm availability and price before payment."
  });
});

app.post("/api/auth/login", (req, res) => {
  const { partner_id, token } = req.body || {};
  const partner = readJSON(PARTNERS_FILE, []).find((x) => x.partner_id === partner_id && x.token === token && x.enabled !== false);

  if (!partner) return res.status(401).json({ ok: false, error: "Invalid credentials" });

  audit("auth.login", { partner_id });
  res.json({ ok: true, jwt: createJWT(partner) });
});

app.get("/api/admin/dashboard", authMiddleware, (req, res) => {
  res.json({
    ok: true,
    partner: req.partner.partner_id,
    hotels_loaded: getHotels().length,
    reservations: readJSON(BOOKINGS_FILE, []).length,
    webhook_events: readJSON(WEBHOOK_FILE, []).length,
    retry_queue: readJSON(RETRY_FILE, []).length,
    failovers: readJSON(FAILOVER_FILE, []).length,
    recoveries: readJSON(RECOVERY_FILE, []).length,
    mappings: readJSON(MAPPINGS_FILE, []).length,
    timestamp: nowISO()
  });
});

app.get("/api/hotels", authMiddleware, (req, res) => {
  const hotels = getHotels();
  audit("enterprise.hotels", { partner: req.partner.partner_id });
  res.json({ ok: true, total: hotels.length, hotels: hotels.slice(0, 1000) });
});

app.get("/api/rooms", authMiddleware, (req, res) => {
  const rows = [];
  for (const h of getHotels().slice(0, 5000)) {
    for (const r of h.rooms || []) rows.push({ hotel_id: h.hotel_id, hotel_name: h.name, city: h.city, country: h.country, ...r });
  }
  res.json({ ok: true, total: rows.length, rooms: rows });
});

app.get("/api/rates", authMiddleware, (req, res) => {
  const rows = [];
  for (const h of getHotels().slice(0, 5000)) {
    for (const r of h.rates || []) rows.push({ hotel_id: h.hotel_id, hotel_name: h.name, city: h.city, country: h.country, ...r });
  }
  res.json({ ok: true, total: rows.length, rates: rows });
});

app.get("/api/availability", authMiddleware, (req, res) => {
  const hotel = getHotels().find((h) => clean(h.hotel_id) === clean(req.query.hotel_id)) || getHotels()[0];
  if (!hotel) return res.status(404).json({ ok: false, error: "No hotels loaded" });

  const rate = (hotel.rates || []).find((r) => number(r.nightly_rate) > 0) || (hotel.rates || [])[0] || {};

  res.json({
    ok: true,
    available: true,
    hotel_id: hotel.hotel_id,
    hotel_name: hotel.name,
    city: hotel.city,
    country: hotel.country,
    checkin: clean(req.query.checkin),
    checkout: clean(req.query.checkout),
    rooms: number(req.query.rooms || 1),
    guests: number(req.query.guests || 2),
    currency: rate.currency || "GBP",
    nightly_rate: number(rate.nightly_rate)
  });
});

app.post("/api/reservations", authMiddleware, (req, res) => {
  const code = bookingCode();
  const body = req.body || {};
  const bookings = readJSON(BOOKINGS_FILE, []);

  const booking = {
    booking_reference: code,
    created_at: nowISO(),
    status: "CONFIRMED",
    payment_status: "PENDING_CAPTURE",
    supplier_status: "PENDING_CONFIRMATION",
    polling_status: "ACTIVE",
    partner_id: req.partner.partner_id,
    hotel_id: body.hotel_id || null,
    room_id: body.room_id || null,
    rate_id: body.rate_id || null,
    checkin: body.checkin || null,
    checkout: body.checkout || null,
    guests: body.guests || 2,
    rooms: body.rooms || 1,
    customer: body.customer || {},
    total_amount: body.total_amount || 0,
    currency: body.currency || "GBP"
  };

  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);
  webhookEvent("reservation.created", booking);
  audit("enterprise.reservation.created", { booking_reference: code, partner: req.partner.partner_id });

  res.json({ ok: true, booking_reference: code, booking });
});

app.get("/api/reservations/:code", authMiddleware, (req, res) => {
  const booking = readJSON(BOOKINGS_FILE, []).find((x) => x.booking_reference === req.params.code || x.reservation_code === req.params.code);
  if (!booking) return res.status(404).json({ ok: false, error: "Booking not found" });
  res.json({ ok: true, booking });
});

app.get("/api/reservations/:code/status", authMiddleware, (req, res) => {
  const booking = readJSON(BOOKINGS_FILE, []).find((x) => x.booking_reference === req.params.code || x.reservation_code === req.params.code);
  if (!booking) return res.status(404).json({ ok: false, error: "Booking not found" });
  res.json({
    ok: true,
    booking_reference: booking.booking_reference || booking.reservation_code,
    booking_status: booking.status,
    supplier_status: booking.supplier_status || "PENDING_CONFIRMATION",
    payment_status: booking.payment_status || "PENDING",
    polling_status: booking.polling_status || "ACTIVE",
    timestamp: nowISO()
  });
});

app.post("/api/cancellations", authMiddleware, (req, res) => {
  const code = clean(req.body?.booking_reference);
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((x) => x.booking_reference === code || x.reservation_code === code);
  if (!booking) return res.status(404).json({ ok: false, error: "Booking not found" });

  booking.status = "CANCELLED";
  booking.cancelled_at = nowISO();
  writeJSON(BOOKINGS_FILE, bookings);
  webhookEvent("reservation.cancelled", booking);
  audit("reservation.cancelled", { booking_reference: code });

  res.json({ ok: true, booking_reference: code, status: "CANCELLED" });
});

app.post("/api/modifications", authMiddleware, (req, res) => {
  const code = clean(req.body?.booking_reference);
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((x) => x.booking_reference === code || x.reservation_code === code);
  if (!booking) return res.status(404).json({ ok: false, error: "Booking not found" });

  ["checkin", "checkout", "rooms", "guests", "hotel_id", "room_id", "rate_id"].forEach((k) => {
    if (req.body[k] !== undefined) booking[k] = req.body[k];
  });

  booking.status = "MODIFIED";
  booking.modified_at = nowISO();
  writeJSON(BOOKINGS_FILE, bookings);
  webhookEvent("reservation.modified", booking);
  audit("reservation.modified", { booking_reference: code });

  res.json({ ok: true, booking_reference: code, status: "MODIFIED", booking });
});

app.post("/api/webhooks/:partner", (req, res) => {
  const partner = readJSON(PARTNERS_FILE, []).find((x) => x.partner_id === req.params.partner);
  if (!partner) return res.status(404).json({ ok: false, error: "Partner not found" });

  const signature = req.headers["x-webhook-signature"];
  const expected = crypto.createHmac("sha256", partner.webhook_secret).update(JSON.stringify(req.body)).digest("hex");

  if (signature && signature !== expected) {
    const queue = readJSON(RETRY_FILE, []);
    queue.unshift({ id: crypto.randomUUID(), partner: partner.partner_id, reason: "INVALID_SIGNATURE", payload: req.body, created_at: nowISO() });
    writeJSON(RETRY_FILE, queue);
    return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
  }

  webhookEvent("partner.webhook.received", { partner: partner.partner_id, payload: req.body });
  audit("partner.webhook.received", { partner: partner.partner_id });

  res.json({ ok: true, received: true, partner: partner.partner_id, timestamp: nowISO() });
});

app.get("/api/webhooks/logs", authMiddleware, (req, res) => {
  res.json({ ok: true, total: readJSON(WEBHOOK_FILE, []).length, logs: readJSON(WEBHOOK_FILE, []).slice(0, 500) });
});

app.get("/api/audit/logs", authMiddleware, (req, res) => {
  res.json({ ok: true, total: readJSON(AUDIT_FILE, []).length, logs: readJSON(AUDIT_FILE, []).slice(0, 500) });
});

app.get("/api/mappings", authMiddleware, (req, res) => {
  res.json({ ok: true, mappings: readJSON(MAPPINGS_FILE, []) });
});

app.post("/api/mappings", authMiddleware, (req, res) => {
  const rows = readJSON(MAPPINGS_FILE, []);
  const row = { id: crypto.randomUUID(), created_at: nowISO(), ...req.body };
  rows.unshift(row);
  writeJSON(MAPPINGS_FILE, rows);
  audit("mapping.created", row);
  res.json({ ok: true, mapping: row });
});

app.get("/api/live-check", (req, res) => {
  res.json({
    ok: true,
    hotels_loaded: getHotels().length,
    reservations: readJSON(BOOKINGS_FILE, []).length,
    webhooks: readJSON(WEBHOOK_FILE, []).length,
    audits: readJSON(AUDIT_FILE, []).length,
    timestamp: nowISO()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("====================================");
  console.log("MYSPACE HOTEL CUSTOMER + ENTERPRISE API V3.1");
  console.log("====================================");
  console.log("PORT:", PORT);
  console.log("HOTELS:", getHotels().length);
  console.log("CUSTOMER ROUTES: RESTORED");
  console.log("ENTERPRISE ROUTES: ACTIVE");
  console.log("Swagger:", `http://127.0.0.1:${PORT}/docs`);
  console.log("====================================");
});
