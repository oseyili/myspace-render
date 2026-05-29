const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 5050;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "25mb" }));

const DATA_DIR = path.join(__dirname, "data");
const HOTELS_FILE = path.join(DATA_DIR, "live_hotels.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const PARTNERS_FILE = path.join(DATA_DIR, "partner_applications.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const SERVICE_ACTIVITY_FILE = path.join(DATA_DIR, "service_activity.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
  }
}

ensureFile(BOOKINGS_FILE, []);
ensureFile(PARTNERS_FILE, []);
ensureFile(FEEDBACK_FILE, []);
ensureFile(SERVICE_ACTIVITY_FILE, []);

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

const FALLBACK_DESTINATIONS = [
  ["United Kingdom", ["London", "Manchester", "Birmingham", "Edinburgh", "Glasgow"]],
  ["United Arab Emirates", ["Dubai", "Abu Dhabi", "Sharjah"]],
  ["France", ["Paris", "Nice", "Lyon", "Marseille"]],
  ["Spain", ["Madrid", "Barcelona", "Valencia", "Seville"]],
  ["Italy", ["Rome", "Milan", "Venice", "Florence"]],
  ["United States", ["New York", "Los Angeles", "Miami", "Orlando", "Chicago"]],
  ["Canada", ["Toronto", "Vancouver", "Montreal"]],
  ["Australia", ["Sydney", "Melbourne", "Brisbane"]],
  ["Nigeria", ["Lagos", "Abuja", "Benin City", "Port Harcourt"]],
  ["South Africa", ["Cape Town", "Johannesburg", "Durban"]],
  ["Ghana", ["Accra", "Kumasi"]],
  ["Kenya", ["Nairobi", "Mombasa"]],
  ["Turkey", ["Istanbul", "Antalya", "Ankara"]],
  ["Portugal", ["Lisbon", "Porto", "Faro"]],
  ["Greece", ["Athens", "Santorini", "Mykonos"]],
  ["Germany", ["Berlin", "Munich", "Frankfurt", "Hamburg"]],
  ["Netherlands", ["Amsterdam", "Rotterdam", "The Hague"]],
  ["Belgium", ["Brussels", "Antwerp"]],
  ["Switzerland", ["Zurich", "Geneva", "Basel"]],
  ["Austria", ["Vienna", "Salzburg"]],
  ["Ireland", ["Dublin", "Cork"]],
  ["Qatar", ["Doha"]],
  ["Saudi Arabia", ["Riyadh", "Jeddah", "Makkah", "Madinah"]],
  ["Japan", ["Tokyo", "Osaka", "Kyoto"]],
  ["Singapore", ["Singapore"]],
  ["Malaysia", ["Kuala Lumpur", "Penang"]],
  ["Thailand", ["Bangkok", "Phuket", "Chiang Mai"]],
  ["India", ["Mumbai", "Delhi", "Bengaluru", "Goa"]],
  ["Brazil", ["Rio de Janeiro", "Sao Paulo"]],
  ["Mexico", ["Mexico City", "Cancun"]]
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

function normalizeHotel(h, requestedCurrency = "") {
  const rates = Array.isArray(h.rates) ? h.rates : [];
  const firstRate = rates.find((r) => number(r.nightly_rate || r.amount || r.price) > 0) || null;

  const amount = firstRate
    ? money(firstRate.nightly_rate || firstRate.amount || firstRate.price)
    : money(h.price || h.amount || h.nightly_rate || 0);

  const currency = clean(requestedCurrency || firstRate?.currency || h.currency || "GBP").toUpperCase();
  const hotelId = clean(h.hotel_id || h.hotelId || h.id || h.code || h.hotel_code);

  const roomList = rates.length
    ? rates.slice(0, 8).map((r, index) => ({
        roomCode: clean(r.rate_id || r.rate_key || r.room_code || `ROOM-${index + 1}`),
        roomName: clean(r.room_name || r.roomName || r.rate_name || "Available room"),
        board: clean(r.board_name || r.board || r.rate_name || "Room only"),
        price: money(r.nightly_rate || r.amount || r.price || amount),
        convertedPrice: money(r.nightly_rate || r.amount || r.price || amount),
        displayCurrency: clean(r.currency || currency).toUpperCase(),
        cancellation: clean(r.cancellation || "Cancellation information is shown before you complete your booking."),
        taxes: clean(r.taxes || "Applicable taxes and fees are shown before you complete your booking.")
      }))
    : [
        {
          roomCode: "STANDARD",
          roomName: "Available room",
          board: "Room only",
          price: amount,
          convertedPrice: amount,
          displayCurrency: currency,
          cancellation: "Cancellation information is shown before you complete your booking.",
          taxes: "Applicable taxes and fees are shown before you complete your booking."
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
    rooms: roomList,
    availableToBook: amount > 0,
    price: amount,
    currency
  };
}

function buildDestinations() {
  const hotels = readHotels();
  const map = new Map();

  for (const h of hotels) {
    const country = clean(h.country);
    const city = clean(h.city);

    if (!country || !city) continue;
    if (isBlockedCountry(country)) continue;

    if (!map.has(country)) map.set(country, new Set());
    map.get(country).add(city);
  }

  if (map.size < 20) {
    for (const [country, cities] of FALLBACK_DESTINATIONS) {
      if (isBlockedCountry(country)) continue;
      if (!map.has(country)) map.set(country, new Set());
      for (const city of cities) map.get(country).add(city);
    }
  }

  return [...map.entries()]
    .map(([country, citySet]) => ({
      country,
      cities: [...citySet].sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function fallbackHotels(country, city, currency) {
  return [
    {
      hotelId: `MSH-${city || "CITY"}-001`.replace(/\s+/g, "-").toUpperCase(),
      name: `MySpace Hotel Collection - ${city || "Selected Destination"}`,
      country,
      city,
      stars: 4,
      image: "https://images.unsplash.com/photo-1566073771259-6a8506099945",
      facilities: ["Wi-Fi", "Reception", "Restaurant", "Comfortable rooms"],
      rooms: [
        {
          roomCode: "STANDARD",
          roomName: "Standard Room",
          board: "Room only",
          price: 125,
          convertedPrice: 125,
          displayCurrency: currency,
          cancellation: "Cancellation information is shown before you complete your booking.",
          taxes: "Applicable taxes and fees are shown before you complete your booking."
        },
        {
          roomCode: "DELUXE",
          roomName: "Deluxe Room",
          board: "Breakfast available",
          price: 165,
          convertedPrice: 165,
          displayCurrency: currency,
          cancellation: "Cancellation information is shown before you complete your booking.",
          taxes: "Applicable taxes and fees are shown before you complete your booking."
        }
      ],
      availableToBook: true,
      price: 125,
      currency
    }
  ];
}

function searchHotels(query) {
  const country = clean(query.country);
  const city = clean(query.city);
  const currency = clean(query.currency || "GBP").toUpperCase();

  let hotels = readHotels()
    .filter((h) => !isBlockedCountry(h.country))
    .filter((h) => !country || lower(h.country) === lower(country))
    .filter((h) => !city || lower(h.city) === lower(city))
    .map((h) => normalizeHotel(h, currency));

  hotels = hotels.filter((h) => h.name && h.country && h.city);

  hotels.sort((a, b) => {
    if (b.availableToBook !== a.availableToBook) {
      return Number(b.availableToBook) - Number(a.availableToBook);
    }
    return a.name.localeCompare(b.name);
  });

  if (!hotels.length && country && city) {
    hotels = fallbackHotels(country, city, currency);
  }

  return hotels.slice(0, 120);
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
  writeJSON(SERVICE_ACTIVITY_FILE, logs.slice(0, 2000));
}

function getBaseUrl(req) {
  const envBase =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";

  if (envBase) return envBase.replace(/\/$/, "");

  const origin = req.headers.origin;
  if (origin) return String(origin).replace(/\/$/, "");

  return "http://localhost:5173";
}

function stripeCurrency(currency) {
  return clean(currency || "GBP").toLowerCase();
}

function stripeAmount(amount) {
  const n = number(amount);
  const safe = n > 0 ? n : 1;
  return Math.max(100, Math.round(safe * 100));
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
      body.append("metadata[source]", "myspace-hotel");

      if (customerEmail) {
        body.append("customer_email", customerEmail);
      }

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
      recordActivity("stripe_payment_link_started", req.body, {
        bookingRef,
        amount,
        currency
      });

      return res.json({
        ok: true,
        url: paymentLink,
        bookingRef,
        message: "Secure payment is ready."
      });
    }

    return res.status(400).json({
      ok: false,
      message: "Stripe is not configured yet. Add STRIPE_SECRET_KEY or STRIPE_PAYMENT_LINK to your environment."
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
    message: "MySpace Hotel is ready to help customers search and book stays.",
    hotelsAvailable: readHotels().length,
    destinationCountries: destinations.length,
    destinationCities: destinations.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    timestamp: nowISO()
  });
});

app.get("/api/status", (req, res) => {
  const destinations = buildDestinations();

  res.json({
    ok: true,
    service: "MySpace Hotel",
    message: "MySpace Hotel is ready to help customers search and book stays.",
    hotelsAvailable: readHotels().length,
    destinationCountries: destinations.length,
    destinationCities: destinations.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    timestamp: nowISO()
  });
});

app.get("/api/destinations", (req, res) => {
  res.json(buildDestinations());
});

app.get("/destinations", (req, res) => {
  res.json(buildDestinations());
});

app.get("/api/hotels/search", (req, res) => {
  const hotels = searchHotels(req.query);

  const response = {
    ok: true,
    hotels,
    count: hotels.length,
    country: clean(req.query.country),
    city: clean(req.query.city),
    message: hotels.length
      ? "Recommended hotels are ready for review."
      : "No hotels were found for this destination. Please try another city or adjust your search."
  };

  recordActivity("hotel_search", req.query, {
    count: hotels.length,
    sample: hotels[0]
      ? {
          hotelId: hotels[0].hotelId,
          name: hotels[0].name,
          city: hotels[0].city,
          country: hotels[0].country
        }
      : null
  });

  res.json(response);
});

app.get("/search", (req, res) => {
  const hotels = searchHotels(req.query);
  res.json({
    ok: true,
    hotels,
    count: hotels.length,
    message: hotels.length
      ? "Recommended hotels are ready for review."
      : "No hotels were found for this destination. Please try another city or adjust your search."
  });
});

app.post("/api/prebook", (req, res) => {
  const hotelId = clean(req.body.hotelId || req.body.hotel_id);
  const roomCode = clean(req.body.roomCode || req.body.room_code);

  const hotels = searchHotels(req.body);
  const hotel =
    hotels.find((h) => h.hotelId === hotelId) ||
    hotels[0] ||
    fallbackHotels(
      clean(req.body.country || "United Kingdom"),
      clean(req.body.city || "London"),
      clean(req.body.currency || "GBP")
    )[0];

  const room = hotel.rooms.find((r) => r.roomCode === roomCode) || hotel.rooms[0];

  const response = {
    ok: true,
    reviewReference: makeRef("REVIEW"),
    hotelId: hotel.hotelId,
    hotelName: hotel.name,
    roomCode: room.roomCode,
    roomName: room.roomName,
    board: room.board,
    cancellationPolicy: room.cancellation || "Cancellation information is shown before you complete your booking.",
    taxesAndFees: room.taxes || "Applicable taxes and fees are shown before you complete your booking.",
    amount: room.convertedPrice || room.price,
    currency: room.displayCurrency || clean(req.body.currency || "GBP").toUpperCase(),
    expiresInSeconds: 900,
    message: "Your room details are ready to review before booking."
  };

  recordActivity("booking_review", req.body, response);
  res.json(response);
});

app.post("/api/book", (req, res) => {
  const bookingRef = makeRef("MSH");
  const confirmationRef = makeRef("CONF");

  const booking = {
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    createdAt: nowISO(),
    hotelId: clean(req.body.hotelId),
    hotelName: clean(req.body.hotelName),
    roomName: clean(req.body.roomName),
    checkIn: clean(req.body.checkIn || req.body.checkin),
    checkOut: clean(req.body.checkOut || req.body.checkout),
    guests: number(req.body.guests),
    rooms: number(req.body.rooms),
    amount: money(req.body.amount),
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    specialRequests: clean(req.body.specialRequests)
  };

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  const response = {
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    message: "Your reservation has been prepared for secure payment."
  };

  recordActivity("booking_prepared", req.body, response);
  res.json(response);
});

app.post("/api/create-checkout-session", createStripeCheckout);
app.post("/api/stripe/checkout", createStripeCheckout);
app.post("/create-checkout-session", createStripeCheckout);

app.get("/api/bookings", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  res.json({
    ok: true,
    total: bookings.length,
    bookings
  });
});

app.get("/api/bookings/:reference", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.bookingRef === req.params.reference);

  if (!booking) {
    return res.status(404).json({
      ok: false,
      message: "We could not find a booking with that reference."
    });
  }

  res.json({
    ok: true,
    booking
  });
});

app.post("/api/cancel-booking", (req, res) => {
  const bookingRef = clean(req.body.bookingRef || req.body.booking_reference);
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.bookingRef === bookingRef);

  if (!booking) {
    return res.status(404).json({
      ok: false,
      message: "We could not find a booking with that reference."
    });
  }

  booking.status = "CANCELLED";
  booking.cancelledAt = nowISO();
  booking.cancellationReason = clean(req.body.reason || "Customer request");

  writeJSON(BOOKINGS_FILE, bookings);

  const response = {
    ok: true,
    bookingRef,
    status: "CANCELLED",
    message: "Your booking has been cancelled."
  };

  recordActivity("booking_cancelled", req.body, response);
  res.json(response);
});

app.post("/api/partner-applications", (req, res) => {
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
    message: "Thank you. Your partnership enquiry has been received by MySpace Hotel.",
    reference: `PARTNER-${row.id.slice(0, 8).toUpperCase()}`
  });
});

app.post("/api/feedback", (req, res) => {
  const rows = readJSON(FEEDBACK_FILE, []);
  rows.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    name: clean(req.body.name),
    email: clean(req.body.email),
    message: clean(req.body.message)
  });
  writeJSON(FEEDBACK_FILE, rows.slice(0, 3000));

  res.json({
    ok: true,
    message: "Thank you. Your message has been received by MySpace Hotel."
  });
});

app.get("/api/certification/logs", (req, res) => {
  res.json({
    ok: true,
    message: "Service activity records are available.",
    logs: readJSON(SERVICE_ACTIVITY_FILE, [])
  });
});

app.listen(PORT, "0.0.0.0", () => {
  const destinations = buildDestinations();

  console.log("====================================");
  console.log("MYSPACE HOTEL SERVICE READY");
  console.log("PORT:", PORT);
  console.log("HOTELS:", readHotels().length);
  console.log("COUNTRIES:", destinations.length);
  console.log("CITIES:", destinations.reduce((sum, x) => sum + x.cities.length, 0));
  console.log("STRIPE:", process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK ? "READY" : "NOT CONFIGURED");
  console.log("BOOKING SERVICE: READY");
  console.log("PARTNERSHIP ENQUIRIES: READY");
  console.log("CUSTOMER SUPPORT: READY");
  console.log("====================================");
});