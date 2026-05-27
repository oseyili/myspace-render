const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();

const PORT = process.env.PORT || 5050;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, max: 3000 }));

const DATA_DIR = path.join(__dirname, "data");
const HOTELS_FILE = path.join(DATA_DIR, "live_hotels.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const COMPLIANCE_FILE = path.join(DATA_DIR, "compliance_blocks.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
  }
}

ensureFile(BOOKINGS_FILE, []);
ensureFile(COMPLIANCE_FILE, []);

let hotelsCache = null;
let hotelsCacheLoadedAt = 0;
let destinationsCache = null;
let destinationsCacheLoadedAt = 0;

const SANCTIONED_COUNTRY_NAMES = new Set([
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

function isSanctionedCountryName(country) {
  return SANCTIONED_COUNTRY_NAMES.has(clean(country));
}


const HOTEL_COUNT_HINT = Number(process.env.HOTEL_COUNT_HINT || 101804);
const COUNTRY_COUNT_HINT = Number(process.env.COUNTRY_COUNT_HINT || 113);
const CITY_COUNT_HINT = Number(process.env.CITY_COUNT_HINT || 12834);

const BLOCKED_REGIONS = [
  { code: "AF", name: "Afghanistan" },
  { code: "BY", name: "Belarus" },
  { code: "BI", name: "Burundi" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CG", name: "Congo Republic" },
  { code: "CU", name: "Cuba" },
  { code: "CD", name: "Democratic Republic of the Congo" },
  { code: "ER", name: "Eritrea" },
  { code: "IQ", name: "Iraq" },
  { code: "IR", name: "Iran" },
  { code: "LY", name: "Libya" },
  { code: "MM", name: "Myanmar" },
  { code: "KP", name: "North Korea" },
  { code: "SO", name: "Somalia" },
  { code: "SS", name: "South Sudan" },
  { code: "SD", name: "Sudan" },
  { code: "SY", name: "Syria" },
  { code: "RU", name: "Russia" },
  { code: "VE", name: "Venezuela" },
  { code: "YE", name: "Yemen" },
  { code: "UA-43", name: "Crimea" },
  { code: "UA-14", name: "Donetsk People's Republic" },
  { code: "UA-09", name: "Lugansk People's Republic" }
];

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

function bookingCode() {
  return (
    "MSH-" +
    Math.random().toString(36).substring(2, 8).toUpperCase() +
    "-" +
    Date.now().toString().slice(-5)
  );
}

function getHotelsLazy() {
  const age = Date.now() - hotelsCacheLoadedAt;

  if (hotelsCache && age < 10 * 60 * 1000) {
    return hotelsCache;
  }

  hotelsCache = readJSON(HOTELS_FILE, []);
  hotelsCacheLoadedAt = Date.now();

  return hotelsCache;
}

function blockedRegion(code) {
  const c = clean(code).toUpperCase();
  if (!c) return null;
  return BLOCKED_REGIONS.find((x) => x.code.toUpperCase() === c) || null;
}

function complianceCheck(body = {}) {
  const fields = [
    ["billing_country", body.billing_country || body.billingCountry],
    ["card_country", body.card_country || body.cardCountry],
    ["customer_country", body.customer_country || body.customerCountry],
    ["ip_country", body.ip_country || body.ipCountry],
    ["supplier_country", body.supplier_country || body.supplierCountry],
    ["destination_country_code", body.destination_country_code || body.destinationCountryCode]
  ];

  for (const [field, value] of fields) {
    const blocked = blockedRegion(value);
    if (blocked) {
      return {
        allowed: false,
        field,
        code: blocked.code,
        region: blocked.name,
        message:
          "We are unable to process this booking or payment due to international financial compliance restrictions."
      };
    }
  }

  return { allowed: true };
}

function saveComplianceBlock(route, body, result) {
  const rows = readJSON(COMPLIANCE_FILE, []);
  rows.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    route,
    result,
    safe_payload: {
      billing_country: clean(body.billing_country || body.billingCountry),
      card_country: clean(body.card_country || body.cardCountry),
      customer_country: clean(body.customer_country || body.customerCountry),
      ip_country: clean(body.ip_country || body.ipCountry),
      hotel_id: clean(body.hotel_id),
      hotel_name: clean(body.hotel_name),
      checkin: clean(body.checkin),
      checkout: clean(body.checkout)
    }
  });
  writeJSON(COMPLIANCE_FILE, rows.slice(0, 3000));
}

function enforceCompliance(req, res, next) {
  const result = complianceCheck(req.body || {});

  if (!result.allowed) {
    saveComplianceBlock(req.path, req.body || {}, result);

    return res.status(403).json({
      ok: false,
      compliance_blocked: true,
      error: "COMPLIANCE_RESTRICTED_REGION",
      message: result.message
    });
  }

  next();
}

function hotelToCustomerShape(h) {
  const rate = Array.isArray(h.rates)
    ? h.rates.find((r) => number(r.nightly_rate) > 0 || number(r.amount) > 0)
    : null;

  const amount = rate ? money(rate.nightly_rate || rate.amount) : 0;

  return {
    hotel_id: clean(h.hotel_id || h.id || h.code),
    hotel_code: clean(h.hotel_id || h.id || h.code),
    hotelbeds_code: clean(h.hotel_id || h.id || h.code),
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
    rooms: Array.isArray(h.rates)
      ? h.rates.slice(0, 20).map((r) => ({
          room_name: clean(r.room_name || r.rate_name || "Selected room"),
          board_name: clean(r.rate_name || "Room only"),
          payment_type: "Secure checkout",
          currency: clean(r.currency || "GBP"),
          amount: money(r.nightly_rate || r.amount),
          rate_key: clean(r.rate_id || r.rate_key),
          cancellation_policies: []
        }))
      : [],
    first_rate: rate
      ? {
          room_name: clean(rate.room_name || rate.rate_name || "Selected room"),
          board_name: clean(rate.rate_name || "Room only"),
          payment_type: "Secure checkout",
          currency: clean(rate.currency || "GBP"),
          amount,
          rate_key: clean(rate.rate_id || rate.rate_key),
          cancellation_policies: []
        }
      : null
  };
}

function buildDestinations() {
  const age = Date.now() - destinationsCacheLoadedAt;

  if (destinationsCache && age < 10 * 60 * 1000) {
    return destinationsCache;
  }

  const index = new Map();

  for (const h of getHotelsLazy()) {
    const country = clean(h.country);
    const city = clean(h.city);

    if (isSanctionedCountryName(country)) continue;

    if (!country || !city) continue;

    if (!index.has(country)) index.set(country, new Map());

    const cityMap = index.get(country);

    if (!cityMap.has(city)) {
      cityMap.set(city, {
        city,
        destination_code: city,
        live_hotels: 0,
        catalog_hotels: 0
      });
    }

    const row = cityMap.get(city);
    row.catalog_hotels += 1;

    if (
      Array.isArray(h.rates) &&
      h.rates.some((r) => number(r.nightly_rate || r.amount) > 0)
    ) {
      row.live_hotels += 1;
    }
  }

  const countries = [...index.entries()]
    .map(([country, cityMap]) => {
      const cityRows = [...cityMap.values()].sort((a, b) => {
        if (b.live_hotels !== a.live_hotels) return b.live_hotels - a.live_hotels;
        if (b.catalog_hotels !== a.catalog_hotels) return b.catalog_hotels - a.catalog_hotels;
        return a.city.localeCompare(b.city);
      });

      return {
        country,
        city_count: cityRows.length,
        hotel_count: cityRows.reduce((s, c) => s + c.catalog_hotels, 0),
        live_hotel_count: cityRows.reduce((s, c) => s + c.live_hotels, 0),
        cities_full: cityRows,
        cities: cityRows.map((x) => x.city)
      };
    })
    .sort((a, b) => a.country.localeCompare(b.country));

  destinationsCache = {
    ok: true,
    countries,
    total_countries: countries.length,
    total_cities: countries.reduce((s, c) => s + c.city_count, 0)
  };

  destinationsCacheLoadedAt = Date.now();

  return destinationsCache;
}


function isHotelOnlyNameSafe(h) {
  const text = [
    h.name,
    h.hotel_name,
    h.property_type,
    h.type,
    h.category,
    h.address,
    h.area
  ].map(clean).join(" ").toLowerCase();

  const blocked = [
    "apartment",
    "apartments",
    "villa",
    "villas",
    "residence",
    "residences",
    "hostel",
    "guest house",
    "guesthouse",
    "homestay",
    "studio",
    "private rental"
  ];

  return !blocked.some((x) => text.includes(x));
}

function customerSearch(country, city, area, keyword, propertyType, limit) {
  let hotels = getHotelsLazy()
    .filter((h) => !isSanctionedCountryName(h.country) && clean(h.country) === clean(country) && clean(h.city) === clean(city))
    .map(hotelToCustomerShape);

  if (area) {
    const a = lower(area);
    hotels = hotels.filter((h) =>
      lower([h.area, h.address, h.hotel_name].join(" ")).includes(a)
    );
  }

  if (keyword) {
    const q = lower(keyword);
    hotels = hotels.filter((h) =>
      lower([h.hotel_name, h.area, h.address].join(" ")).includes(q)
    );
  }

  if (propertyType && propertyType !== "all") {
    const p = lower(propertyType);

    hotels = hotels.filter((h) => {
      const t = lower(h.property_type);

      if (p === "hotel") {
        return t.includes("hotel") || t.includes("resort") || (!t.includes("apartment") && !t.includes("villa"));
      }

      if (p === "apartment") {
        return t.includes("apartment") || t.includes("residence");
      }

      if (p === "villa") {
        return t.includes("villa");
      }

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

app.get("/", (req, res) => {
  res.json({
    status: "live",
    service: "MySpace Hotel API",
    hotels: hotelsCache ? hotelsCache.length : HOTEL_COUNT_HINT,
    countries: COUNTRY_COUNT_HINT,
    cities: CITY_COUNT_HINT,
    timestamp: nowISO()
  });
});

app.get("/status", (req, res) => {
  res.json({
    ok: true,
    api: "online",
    hotels_loaded: hotelsCache ? hotelsCache.length : HOTEL_COUNT_HINT,
    countries: COUNTRY_COUNT_HINT,
    cities: CITY_COUNT_HINT,
    bookings: readJSON(BOOKINGS_FILE, []).length,
    compliance_blocks: readJSON(COMPLIANCE_FILE, []).length,
    timestamp: nowISO()
  });
});

app.get("/api/destinations", (req, res) => {
  res.json(buildDestinations());
});

app.get("/api/real-catalog/destinations", (req, res) => {
  res.json(buildDestinations());
});

app.get("/api/hotels/search", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const area = clean(req.query.area);
  const keyword = clean(req.query.keyword);
  const propertyType = clean(req.query.property_type || req.query.stay_type || "all");
  const limit = number(req.query.limit || 160);

  if (!country || !city) {
    return res.json({
      ok: true,
      hotels: [],
      count: 0,
      message: "Choose a country and destination."
    });
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

app.get("/api/hotels/live-rate", (req, res) => {
  const hotelId = clean(req.query.hotel_id || req.query.hotel_code || req.query.id);
  const hotel = getHotelsLazy().find((h) => clean(h.hotel_id || h.id || h.code) === hotelId);

  if (!hotel) {
    return res.json({
      ok: true,
      live_available: false,
      payment_ready: false,
      customer_message: "Latest price will be confirmed before payment."
    });
  }

  const shaped = hotelToCustomerShape(hotel);

  if (!shaped.first_rate) {
    return res.json({
      ok: true,
      live_available: false,
      payment_ready: false,
      hotel: shaped,
      customer_message: "Latest price will be confirmed before payment."
    });
  }

  res.json({
    ok: true,
    live_available: true,
    payment_ready: true,
    hotel: shaped,
    rate: shaped.first_rate,
    customer_message: "Current price is available for your selected stay."
  });
});

app.get("/api/hotels/live-check", (req, res) => {
  const hotelId = clean(req.query.hotel_id || req.query.hotel_code);
  const hotel = getHotelsLazy().find((h) => clean(h.hotel_id || h.id || h.code) === hotelId);

  if (!hotel) {
    return res.json({
      ok: true,
      live_payment_ready: false,
      payment_ready: false,
      price_status: "Latest price will be confirmed before payment."
    });
  }

  const shaped = hotelToCustomerShape(hotel);

  if (!shaped.first_rate) {
    return res.json({
      ok: true,
      live_payment_ready: false,
      payment_ready: false,
      price_status: "Latest price will be confirmed before payment."
    });
  }

  res.json({
    ok: true,
    live_payment_ready: true,
    payment_ready: true,
    price_status: "Current price is available for secure checkout.",
    ...shaped
  });
});

app.get("/api/guide", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const area = clean(req.query.area);
  const hotel = clean(req.query.hotel);
  const destination = [hotel, area, city, country].filter(Boolean).join(", ");
  const q = encodeURIComponent(destination || `${city} ${country}`);

  res.json({
    ok: true,
    guide: {
      destination: destination || [city, country].filter(Boolean).join(", "),
      selected_stay: hotel,
      emergency: {
        note: "Please confirm emergency numbers locally before travel."
      },
      links: {
        hospital: `https://www.google.com/maps/search/hospital+near+${q}`,
        pharmacy: `https://www.google.com/maps/search/pharmacy+near+${q}`,
        police: `https://www.google.com/maps/search/police+station+near+${q}`,
        airport: `https://www.google.com/maps/search/airport+near+${q}`,
        restaurants: `https://www.google.com/maps/search/restaurants+near+${q}`,
        taxi: `https://www.google.com/maps/search/taxi+near+${q}`,
        train_or_metro: `https://www.google.com/maps/search/train+station+near+${q}`,
        attractions: `https://www.google.com/maps/search/things+to+do+near+${q}`,
        museums: `https://www.google.com/maps/search/museums+near+${q}`,
        tours: `https://www.google.com/maps/search/tours+near+${q}`,
        family: `https://www.google.com/maps/search/family+activities+near+${q}`
      }
    }
  });
});

app.get("/api/currency/convert", (req, res) => {
  const amount = money(req.query.amount || 1);
  const from = clean(req.query.from_currency || req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to_currency || req.query.to || "USD").toUpperCase();

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
    SGD: 1.72
  };

  if (from === to) {
    return res.json({
      ok: true,
      amount,
      from_currency: from,
      to_currency: to,
      rate: 1,
      converted: amount,
      source: "same_currency"
    });
  }

  if (FX[from] && FX[to]) {
    const converted = money((amount / FX[from]) * FX[to]);

    return res.json({
      ok: true,
      amount,
      from_currency: from,
      to_currency: to,
      rate: money(FX[to] / FX[from]),
      converted,
      source: "estimate"
    });
  }

  res.status(503).json({
    ok: false,
    message: "Currency conversion is temporarily unavailable."
  });
});

app.post("/reservation-request", enforceCompliance, (req, res) => {
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
    currency: clean(body.currency),
    billing_country: clean(body.billing_country || body.billingCountry),
    card_country: clean(body.card_country || body.cardCountry),
    ip_country: clean(body.ip_country || body.ipCountry)
  };

  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  res.json({
    ok: true,
    reservation_code: code,
    booking_reference: code,
    status: booking.status,
    payment_url: null,
    message:
      booking.status === "PAYMENT_READY"
        ? "Reservation prepared."
        : "Request received. We will confirm availability and price before payment."
  });
});

app.post("/api/create-checkout-session", enforceCompliance, async (req, res) => {
  try {
    const Stripe = require("stripe");

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Payment provider is not configured yet."
      });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = req.body || {};
    const amountNumber = Number(body.amount || body.total || body.total_amount || body.price || 0);

    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Valid full booking amount is required before checkout."
      });
    }

    const currency = String(body.currency || "GBP").toLowerCase();
    const amount = Math.round(amountNumber * 100);
    const hotelName = String(body.hotel_name || "MySpace Hotel Reservation");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL || "https://myspace-hotel.com"}?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL || "https://myspace-hotel.com"}?payment=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amount,
            product_data: {
              name: hotelName,
              description: `${body.checkin || ""} to ${body.checkout || ""} | ${body.guests || 1} guest(s) | ${body.rooms || 1} room(s)`
            }
          }
        }
      ],
      metadata: {
        hotel_id: String(body.hotel_id || ""),
        hotel_name: hotelName,
        checkin: String(body.checkin || ""),
        checkout: String(body.checkout || ""),
        guests: String(body.guests || ""),
        rooms: String(body.rooms || ""),
        rate_key: String(body.rate_key || "").slice(0, 450)
      }
    });

    return res.json({ ok: true, url: session.url, id: session.id });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || "Checkout could not be started."
    });
  }
});

app.get("/api/live-check", (req, res) => {
  res.json({
    ok: true,
    hotels_loaded: hotelsCache ? hotelsCache.length : HOTEL_COUNT_HINT,
    bookings: readJSON(BOOKINGS_FILE, []).length,
    compliance_blocks: readJSON(COMPLIANCE_FILE, []).length,
    timestamp: nowISO()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("====================================");
  console.log("MYSPACE HOTEL API");
  console.log("====================================");
  console.log("PORT:", PORT);
  console.log("HOTEL JSON: LAZY LOAD ONLY");
  console.log("CUSTOMER ROUTES: ACTIVE");
  console.log("DROPDOWN ROUTE: /api/destinations");
  console.log("GUIDE ROUTE: /api/guide");
  console.log("LIVE RATE ROUTE: /api/hotels/live-rate");
  console.log("====================================");
});