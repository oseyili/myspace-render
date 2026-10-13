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

// ==========================================
// CORS CONFIGURATION
// ==========================================
app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use((req, res, next) => {
  if (req.originalUrl === "/api/stripe/webhook") return next();
  return express.json({ limit: "25mb" })(req, res, next);
});

const PORT = process.env.PORT || 5050;

// ==========================================
// DATA DIRECTORY & FILE SETUP
// ==========================================
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const PARTNERS_FILE = path.join(DATA_DIR, "partner_applications.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const SERVICE_ACTIVITY_FILE = path.join(DATA_DIR, "service_activity.json");
const AFFILIATE_CONVERSIONS_FILE = path.join(DATA_DIR, "affiliate_conversions.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
}

ensureFile(BOOKINGS_FILE, []);
ensureFile(PARTNERS_FILE, []);
ensureFile(FEEDBACK_FILE, []);
ensureFile(SERVICE_ACTIVITY_FILE, []);
ensureFile(AFFILIATE_CONVERSIONS_FILE, []);

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

function clean(v) { return String(v || "").trim(); }
function number(v) { const n = Number(String(v || "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function money(v) { return Number(number(v).toFixed(2)); }
function nowISO() { return new Date().toISOString(); }
function makeRef(prefix) { return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`; }

function recordActivity(action, payload, response) {
  const logs = readJSON(SERVICE_ACTIVITY_FILE, []);
  logs.unshift({ id: crypto.randomUUID(), created_at: nowISO(), action, payload, response });
  writeJSON(SERVICE_ACTIVITY_FILE, logs.slice(0, 3000));
}

// ==========================================
// STRICT CUSTOMER DESTINATIONS (SINGLE SOURCE OF TRUTH)
// ==========================================
const MSH_STRICT_LIVE_DESTINATIONS = [
  { country: "United Kingdom", cities: ["London", "Manchester", "Birmingham", "Edinburgh", "Glasgow"] },
  { country: "United States", cities: ["New York", "Los Angeles", "Miami", "Las Vegas"] },
  { country: "United Arab Emirates", cities: ["Dubai", "Abu Dhabi"] },
  { country: "France", cities: ["Paris"] },
  { country: "Nigeria", cities: ["Lagos", "Abuja"] },
  { country: "Spain", cities: ["Barcelona", "Madrid"] },
  { country: "Italy", cities: ["Rome", "Milan"] },
  { country: "Germany", cities: ["Berlin", "Munich"] },
  { country: "Turkey", cities: ["Istanbul", "Antalya"] },
  { country: "Thailand", cities: ["Bangkok", "Phuket"] },
  { country: "Singapore", cities: ["Singapore"] },
  { country: "Japan", cities: ["Tokyo", "Osaka"] },
  { country: "Australia", cities: ["Sydney", "Melbourne"] },
  { country: "Canada", cities: ["Toronto", "Vancouver"] }
];

// ==========================================
// HOTELBEDS LIVE CONNECTOR
// ==========================================
function hotelbedsConfig() {
  const baseUrl = clean(process.env.HOTELBEDS_BASE_URL || "https://api.test.hotelbeds.com").replace(/\/$/, "");
  const apiKey = clean(process.env.HOTELBEDS_API_KEY);
  const secret = clean(process.env.HOTELBEDS_SECRET);
  return { baseUrl, apiKey, secret, ready: Boolean(baseUrl && apiKey && secret) };
}

function hotelbedsSignature() {
  const cfg = hotelbedsConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  return crypto.createHash("sha256").update(cfg.apiKey + cfg.secret + timestamp).digest("hex");
}

function hotelbedsDestinationCode(country, city) {
  const wantedCountry = clean(country).toLowerCase();
  const wantedCity = clean(city).toLowerCase();

  try {
    const map = JSON.parse(process.env.HOTELBEDS_DESTINATIONS || "{}");
    const keys = [`${wantedCountry}|${wantedCity}`, wantedCity, clean(city), clean(country)];
    for (const key of keys) {
      if (map[key]) return clean(map[key]).toUpperCase();
    }
  } catch {}

  const fallback = {
    "united kingdom|london": "LON", "london": "LON",
    "united kingdom|manchester": "MAN", "manchester": "MAN",
    "united kingdom|birmingham": "BHX", "birmingham": "BHX",
    "united kingdom|edinburgh": "EDI", "edinburgh": "EDI",
    "united kingdom|glasgow": "GLA", "glasgow": "GLA",
    "united states|new york": "NYC", "new york": "NYC",
    "united states|los angeles": "LAX", "los angeles": "LAX",
    "united states|miami": "MIA", "miami": "MIA",
    "united states|las vegas": "LAS", "las vegas": "LAS",
    "united arab emirates|dubai": "DXB", "dubai": "DXB",
    "united arab emirates|abu dhabi": "AUH", "abu dhabi": "AUH",
    "france|paris": "PAR", "paris": "PAR",
    "nigeria|lagos": "LOS", "lagos": "LOS",
    "nigeria|abuja": "ABV", "abuja": "ABV",
    "spain|barcelona": "BCN", "barcelona": "BCN",
    "spain|madrid": "MAD", "madrid": "MAD",
    "italy|rome": "ROM", "rome": "ROM",
    "italy|milan": "MIL", "milan": "MIL",
    "germany|berlin": "BER", "berlin": "BER",
    "germany|munich": "MUC", "munich": "MUC",
    "turkey|istanbul": "IST", "istanbul": "IST",
    "turkey|antalya": "AYT", "antalya": "AYT",
    "thailand|bangkok": "BKK", "bangkok": "BKK",
    "thailand|phuket": "HKT", "phuket": "HKT",
    "singapore|singapore": "SIN", "singapore": "SIN",
    "japan|tokyo": "TYO", "tokyo": "TYO",
    "japan|osaka": "OSA", "osaka": "OSA",
    "australia|sydney": "SYD", "sydney": "SYD",
    "australia|melbourne": "MEL", "melbourne": "MEL",
    "canada|toronto": "YTO", "toronto": "YTO",
    "canada|vancouver": "YVR", "vancouver": "YVR"
  };

  return clean(fallback[`${wantedCountry}|${wantedCity}`] || fallback[wantedCity]).toUpperCase();
}

const HOTELBEDS_IMAGE_CACHE = new Map();

async function hotelbedsContentImageUrl(hotelCode) {
  const code = clean(hotelCode || "");
  if (!code) return "";
  if (HOTELBEDS_IMAGE_CACHE.has(code)) return HOTELBEDS_IMAGE_CACHE.get(code);

  try {
    const cfg = hotelbedsConfig();
    if (!cfg.ready) return "";

    const url = `${cfg.baseUrl}/hotel-content-api/1.0/hotels/${encodeURIComponent(code)}/details?language=ENG&useSecondaryLanguage=false`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Api-key": cfg.apiKey,
        "X-Signature": hotelbedsSignature(),
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      HOTELBEDS_IMAGE_CACHE.set(code, "");
      return "";
    }

    const data = await response.json();
    const images = Array.isArray(data?.hotel?.images) ? data.hotel.images : [];
    const first = images.find((x) => clean(x?.path || x?.url || ""));

    const rawPath = clean(first?.path || first?.url || "");
    if (!rawPath) {
      HOTELBEDS_IMAGE_CACHE.set(code, "");
      return "";
    }

    const finalUrl = /^https?:\/\//i.test(rawPath)
      ? rawPath
      : `https://photos.hotelbeds.com/giata/original/${rawPath.replace(/^\/+/, "")}`;

    HOTELBEDS_IMAGE_CACHE.set(code, finalUrl);
    return finalUrl;
  } catch {
    HOTELBEDS_IMAGE_CACHE.set(code, "");
    return "";
  }
}

function hotelbedsBestRoom(hotel) {
  const rooms = Array.isArray(hotel?.rooms) ? hotel.rooms : [];
  const candidates = [];

  for (const room of rooms) {
    const rates = Array.isArray(room?.rates) ? room.rates : [];
    for (const rate of rates) {
      const amount = number(rate?.net || rate?.sellingRate || rate?.hotelSellingRate || 0);
      if (amount > 0) candidates.push({ room, rate, amount });
    }
  }

  candidates.sort((a, b) => a.amount - b.amount);
  return candidates[0] || null;
}

function tomorrowISOForRatehawk(daysAhead) {
  const d = new Date(Date.now() + Number(daysAhead || 1) * 86400000);
  return d.toISOString().slice(0, 10);
}

async function hotelbedsAvailabilitySearch(query) {
  const cfg = hotelbedsConfig();

  if (!cfg.ready) {
    return { ok: false, hotels: [], status: 400, message: "Hotelbeds is not configured." };
  }

  const country = clean(query.country || "");
  const city = clean(query.city || "");
  const currency = clean(query.currency || "GBP").toUpperCase();
  const destination = clean(query.destination || query.destinationCode || hotelbedsDestinationCode(country, city)).toUpperCase();

  if (!destination) {
    return { ok: false, hotels: [], status: 400, message: "No Hotelbeds destination code is mapped for this search." };
  }

  const checkIn = clean(query.checkIn || query.checkin || query.check_in || tomorrowISOForRatehawk(14));
  const checkOut = clean(query.checkOut || query.checkout || query.check_out || tomorrowISOForRatehawk(15));
  const guests = Math.max(1, Number(query.guests || 2));
  const rooms = Math.max(1, Number(query.rooms || 1));

  const body = {
    stay: { checkIn, checkOut },
    occupancies: [{ rooms, adults: guests, children: 0 }],
    destination: { code: destination },
    filter: { maxHotels: Math.max(1, Math.min(Number(query.limit || 100), 1000)) }
  };

  const response = await fetch(`${cfg.baseUrl}/hotel-api/1.0/hotels`, {
    method: "POST",
    headers: {
      "Api-key": cfg.apiKey,
      "X-Signature": hotelbedsSignature(),
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      hotels: [],
      status: response.status,
      message: data?.error?.message || data?.message || "Hotelbeds availability request failed.",
      data
    };
  }

  const rawHotels = Array.isArray(data?.hotels?.hotels) ? data.hotels.hotels : [];

  const hotels = (
    await Promise.all(
      rawHotels.map(async (hotel) => {
        const best = hotelbedsBestRoom(hotel);
        if (!best) return null;

        const hotelName = clean(hotel?.name || hotel?.hotelName || "");
        if (!hotelName) return null;

        const image = await hotelbedsContentImageUrl(hotel.code || hotel.id);
        const roomName = clean(best.room?.name || "Available room");
        const displayCurrency = clean(best.rate?.currency || currency).toUpperCase();

        return {
          hotelId: `HOTELBEDS-${hotel.code || hotel.id || hotelName}`,
          hotel_id: `HOTELBEDS-${hotel.code || hotel.id || hotelName}`,
          id: `HOTELBEDS-${hotel.code || hotel.id || hotelName}`,
          code: `HOTELBEDS-${hotel.code || hotel.id || hotelName}`,
          supplier_hotel_id: clean(hotel.code || hotel.id || ""),
          name: hotelName,
          hotel_name: hotelName,
          city,
          country,
          destinationCode: destination,
          price: best.amount,
          convertedPrice: best.amount,
          displayPrice: best.amount,
          currency: displayCurrency,
          displayCurrency,
          availableToBook: true,
          image: image,
          images: image ? [image] : [],
          source: "hotelbeds_live_supplier",
          supplierLabel: "Hotelbeds live rate",
          supplier_private: {
            supplier_code: "HOTELBEDS",
            destination_code: destination,
            supplier_hotel_id: clean(hotel.code || hotel.id || "")
          },
          rooms: [{
            roomCode: clean(best.room?.code || best.rate?.rateKey || "STANDARD"),
            roomName,
            room_name: roomName,
            board: clean(best.rate?.boardName || best.rate?.boardCode || "Available room"),
            price: best.amount,
            convertedPrice: best.amount,
            displayCurrency,
            rate_source_id: clean(best.rate?.rateKey || hotel.code || ""),
            rate_source_timestamp: nowISO(),
            supplier_private: {
              supplier_code: "HOTELBEDS",
              destination_code: destination,
              rate_key: clean(best.rate?.rateKey || "")
            }
          }]
        };
      })
    )
  ).filter(Boolean);

  return {
    ok: true,
    source: "hotelbeds_live_supplier",
    destination,
    count: hotels.length,
    hotels,
    rawCount: rawHotels.length
  };
}

// ==========================================
// PUBLIC API ENDPOINTS
// ==========================================

app.get("/", (req, res) => {
  res.json({ ok: true, service: "MySpace Hotel", message: "Welcome to MySpace Hotel.", timestamp: nowISO() });
});

app.get("/status", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel",
    destinationCountries: MSH_STRICT_LIVE_DESTINATIONS.length,
    destinationCities: MSH_STRICT_LIVE_DESTINATIONS.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    hotelbedsReady: hotelbedsConfig().ready,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    mailReady: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)),
    timestamp: nowISO()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel",
    destinationCountries: MSH_STRICT_LIVE_DESTINATIONS.length,
    destinationCities: MSH_STRICT_LIVE_DESTINATIONS.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    hotelbedsReady: hotelbedsConfig().ready,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    mailReady: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)),
    timestamp: nowISO()
  });
});

// SINGLE, RELIABLE DESTINATION ENDPOINT
app.get("/api/destinations", (req, res) => {
  res.json(MSH_STRICT_LIVE_DESTINATIONS);
});

app.get("/api/countries", (req, res) => {
  res.json({ ok: true, count: MSH_STRICT_LIVE_DESTINATIONS.length, countries: MSH_STRICT_LIVE_DESTINATIONS });
});

// DEFINITIVE CUSTOMER HOTEL SEARCH ENDPOINT
app.get("/api/hotels/search", async (req, res) => {
  try {
    const { country, city, checkIn, checkOut, guests, rooms, currency } = req.query;

    if (!country || !city) {
      return res.status(400).json({ ok: false, message: "Country and city are required." });
    }

    const liveResult = await hotelbedsAvailabilitySearch({
      country,
      city,
      checkIn,
      checkOut,
      guests,
      rooms,
      currency,
      limit: 200
    });

    if (!liveResult.ok) {
      return res.json({
        ok: true,
        source: "live_supplier_failed",
        count: 0,
        hotels: [],
        message: liveResult.message || "Could not retrieve live rates at this time."
      });
    }

    const finalHotels = liveResult.hotels.filter(
      (hotel) => hotel.name && hotel.price > 0 && hotel.image
    );

    res.json({
      ok: true,
      source: "live_supplier_search",
      count: finalHotels.length,
      hotels: finalHotels
    });
  } catch (err) {
    console.error("Customer hotel search error:", err);
    res.status(500).json({
      ok: false,
      message: "An unexpected error occurred during the search.",
      error: err.message
    });
  }
});

// ==========================================
// BOOKING & PAYMENT ENDPOINTS
// ==========================================
function getBaseUrl(req) {
  const envBase = process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || "";
  if (envBase) return envBase.replace(/\/$/, "");
  if (req.headers.origin) return String(req.headers.origin).replace(/\/$/, "");
  return "http://localhost:5173";
}

function stripeCurrency(currency) {
  return clean(currency || "GBP").toLowerCase();
}

function stripeAmount(amount) {
  const n = number(amount);
  return Math.max(50, Math.round(n * 100));
}

async function createStripeCheckout(req, res) {
  try {
    const paymentLink = process.env.STRIPE_PAYMENT_LINK || process.env.VITE_STRIPE_PAYMENT_LINK || process.env.PUBLIC_STRIPE_PAYMENT_LINK || "";
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
          message: "Secure payment could not be started.",
          stripe_error: stripeData?.error?.message
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

    return res.status(400).json({ ok: false, message: "Stripe is not configured yet." });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({ ok: false, message: "Secure payment could not be started." });
  }
}

app.post("/api/create-checkout-session", createStripeCheckout);
app.post("/api/stripe/checkout", createStripeCheckout);
app.post("/create-checkout-session", createStripeCheckout);

app.post("/api/book", async (req, res) => {
  const bookingRef = makeRef("MSH");
  const confirmationRef = makeRef("CONF");

  const booking = {
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    createdAt: nowISO(),
    hotelId: clean(req.body.hotelId || req.body.hotel_id),
    hotelName: clean(req.body.hotelName || req.body.hotel),
    roomCode: clean(req.body.roomCode || "STANDARD"),
    roomName: clean(req.body.roomName || "Available room"),
    country: clean(req.body.country),
    city: clean(req.body.city),
    checkIn: clean(req.body.checkIn || req.body.checkin),
    checkOut: clean(req.body.checkOut || req.body.checkout),
    guests: number(req.body.guests),
    rooms: number(req.body.rooms),
    amount: money(req.body.amount || req.body.total),
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    customerPhone: clean(req.body.customerPhone),
    specialRequests: clean(req.body.specialRequests)
  };

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  recordActivity("booking_prepared", req.body, { ok: true, bookingRef });

  res.json({
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    message: "Your reservation has been prepared for secure payment."
  });
});

app.get("/api/bookings", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  res.json({ ok: true, total: bookings.length, bookings });
});

app.get("/api/bookings/:reference", (req, res) => {
  const booking = readJSON(BOOKINGS_FILE, []).find((b) => b.bookingRef === req.params.reference);
  if (!booking) return res.status(404).json({ ok: false, message: "We could not find a booking with that reference." });
  res.json({ ok: true, booking });
});

// ==========================================
// SECONDARY ENDPOINTS
// ==========================================
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

  res.json({
    ok: true,
    message: "Thank you. Your partnership enquiry has been received.",
    reference: `PARTNER-${row.id.slice(0, 8).toUpperCase()}`
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

  res.json({ ok: true, message: "Thank you. Your message has been received." });
});

app.get("/api/certification/logs", (req, res) => {
  res.json({ ok: true, logs: readJSON(SERVICE_ACTIVITY_FILE, []) });
});

// ==========================================
// SERVER START
// ==========================================
app.listen(PORT, "0.0.0.0", () => {
  console.log("====================================");
  console.log("MYSPACE HOTEL SERVICE READY");
  console.log("PORT:", PORT);
  console.log("DESTINATIONS:", MSH_STRICT_LIVE_DESTINATIONS.length);
  console.log("HOTELBEDS CONFIGURED:", hotelbedsConfig().ready);
  console.log("STRIPE:", process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK ? "READY" : "NOT CONFIGURED");
  console.log("MAIL:", process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ? "READY" : "NOT CONFIGURED");
  console.log("====================================");
});