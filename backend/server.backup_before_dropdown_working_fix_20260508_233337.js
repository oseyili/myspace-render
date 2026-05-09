const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5050);
const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || "http://localhost:5173";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try { stripe = require("stripe")(STRIPE_SECRET_KEY); } catch { stripe = null; }
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "8mb" }));

const reservations = new Map();

const FX = {
  GBP: 1, USD: 1.25, EUR: 1.17, NGN: 1900, AED: 4.59, TRY: 40.5,
  CAD: 1.7, AUD: 1.9, ZAR: 23, CHF: 1.1, JPY: 195, CNY: 9.1, INR: 104
};

const DESTINATIONS = {
  LON: { country: "United Kingdom", city: "London", currency: "GBP" },
  PAR: { country: "France", city: "Paris", currency: "EUR" },
  NYC: { country: "United States", city: "New York", currency: "USD" },
  DXB: { country: "United Arab Emirates", city: "Dubai", currency: "AED" },
  LOS: { country: "Nigeria", city: "Lagos", currency: "NGN" },
  ABV: { country: "Nigeria", city: "Abuja", currency: "NGN" },
  BCN: { country: "Spain", city: "Barcelona", currency: "EUR" },
  MAD: { country: "Spain", city: "Madrid", currency: "EUR" }
};

function clean(v) {
  return String(v || "").trim();
}

function norm(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function money(v, fallback = 0) {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function makeCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
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
  return [];
}

function loadArray(filename) {
  return extractArray(readJson(path.join(__dirname, "data", filename)));
}

let HOTEL_CACHE = null;

function getDestination(raw) {
  const code = clean(raw.destination_code || raw.destinationCode || raw.destination || raw.city_code || raw.cityCode).toUpperCase();
  return DESTINATIONS[code] || null;
}

function getRate(raw) {
  const rates = [];

  if (Array.isArray(raw.rates)) rates.push(...raw.rates);
  if (Array.isArray(raw.rooms)) {
    for (const room of raw.rooms) {
      if (Array.isArray(room.rates)) {
        for (const r of room.rates) {
          rates.push({
            ...r,
            roomName: room.name || room.roomName || r.roomName || r.room_name || "Selected room"
          });
        }
      }
    }
  }

  if (raw.rate) rates.push(raw.rate);
  if (raw.first_rate) rates.push(raw.first_rate);

  return rates[0] || {};
}

function buildHotels() {
  if (HOTEL_CACHE) return HOTEL_CACHE;

  const rateRecords = [
    ...loadArray("hotel_live_rates_seed.json"),
    ...loadArray("hotel_live_rates_london_seed.json")
  ];

  const imageRecords = loadArray("hotel_images_live_backup.json");

  const imageMap = new Map();

  for (const img of imageRecords) {
    const code = clean(img.hotel_code || img.hotelCode || img.hotel_id || img.id);
    if (code && clean(img.image_url)) {
      imageMap.set(code, clean(img.image_url));
    }
  }

  const hotels = [];

  for (let i = 0; i < rateRecords.length; i++) {
    const raw = rateRecords[i];
    const dest = getDestination(raw);

    if (!dest) continue;

    const hotelCode = clean(raw.hotel_code || raw.hotelCode || raw.hotel_id || raw.id || raw.code || `rate-${i + 1}`);
    const rate = getRate(raw);

    const amount = money(
      rate.net ||
      rate.sellingRate ||
      rate.selling_rate ||
      rate.amount ||
      raw.net ||
      raw.price ||
      raw.amount,
      0
    );

    const currency = clean(
      rate.currency ||
      rate.payment_currency ||
      raw.currency ||
      raw.payment_currency ||
      dest.currency
    ).toUpperCase();

    const imageUrl = clean(raw.image_url || raw.image || imageMap.get(hotelCode) || "");

    hotels.push({
      id: hotelCode,
      hotel_id: hotelCode,
      hotel_code: hotelCode,
      hotel_name: clean(raw.hotel_name || raw.hotelName || raw.name || `Hotel ${i + 1}`),
      country: dest.country,
      city: dest.city,
      destination_code: clean(raw.destination_code || raw.destinationCode || "").toUpperCase(),
      area: clean(raw.zoneName || raw.zone_name || raw.area || raw.neighbourhood || raw.neighborhood || ""),
      address: clean(raw.address || raw.addressLine || raw.full_address || ""),
      rating: clean(raw.categoryName || raw.category || raw.stars || raw.rating || ""),
      image_url: imageUrl,
      currency,
      price: amount,
      room_name: clean(rate.roomName || rate.room_name || "Selected room"),
      board_name: clean(rate.boardName || rate.board_name || "Room only"),
      cancellation_policies: Array.isArray(rate.cancellationPolicies) ? rate.cancellationPolicies : [],
      live_payment_ready: amount > 0 && Boolean(currency),
      price_status: amount > 0 && currency
        ? "Verified live rate available for customer review before secure payment."
        : "Live rate confirmation required before secure payment."
    });
  }

  HOTEL_CACHE = hotels;
  console.log(`Usable live-rate hotels: ${HOTEL_CACHE.length}`);
  return HOTEL_CACHE;
}

function buildDestinations() {
  const map = new Map();

  for (const h of buildHotels()) {
    if (!h.country || !h.city) continue;

    if (!map.has(h.country)) map.set(h.country, new Map());

    const cities = map.get(h.country);

    if (!cities.has(h.city)) {
      cities.set(h.city, {
        city: h.city,
        currency: h.currency || ""
      });
    }
  }

  return [...map.entries()]
    .map(([country, cities]) => ({
      country,
      city_count: cities.size,
      cities: [...cities.values()].sort((a, b) => a.city.localeCompare(b.city))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function matchesHotel(h, country, city, area, keyword) {
  if (country && norm(h.country) !== norm(country)) return false;
  if (city && norm(h.city) !== norm(city)) return false;

  const text = norm([
    h.hotel_name,
    h.country,
    h.city,
    h.area,
    h.address,
    h.rating,
    h.room_name,
    h.board_name
  ].join(" "));

  if (area && !text.includes(norm(area))) return false;
  if (keyword && !text.includes(norm(keyword))) return false;

  return true;
}

app.get("/", (req, res) => {
  const countries = buildDestinations();
  res.json({
    ok: true,
    service: "MySpace Hotel reservation service",
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.cities.length, 0)
  });
});

app.get("/health", (req, res) => {
  const countries = buildDestinations();
  res.json({
    ok: true,
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.cities.length, 0)
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const countries = buildDestinations();
  res.json({
    ok: true,
    countries,
    total_countries: countries.length,
    total_cities: countries.reduce((s, x) => s + x.cities.length, 0)
  });
});

app.get("/api/real-catalog/search", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const area = clean(req.query.area);
  const keyword = clean(req.query.keyword);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 120)));

  const hotels = buildHotels()
    .filter((h) => matchesHotel(h, country, city, area, keyword))
    .slice(0, limit);

  res.json({
    ok: true,
    hotels,
    count: hotels.length,
    country,
    city
  });
});

app.get("/api/hotels/selected-live-price-v2", (req, res) => {
  const selectedId = clean(req.query.hotel_id || req.query.id);
  const city = clean(req.query.city);
  const country = clean(req.query.country);

  const selected = buildHotels().find((h) => {
    return String(h.hotel_id) === String(selectedId) &&
      norm(h.country) === norm(country) &&
      norm(h.city) === norm(city);
  });

  if (!selected || !selected.live_payment_ready) {
    return res.json({
      ok: true,
      live_payment_ready: false,
      amount: 0,
      currency: "",
      price_status: "Verified live rate is not available yet. Please request reservation support before payment."
    });
  }

  res.json({
    ok: true,
    live_payment_ready: true,
    amount: selected.price,
    currency: selected.currency,
    hotel_id: selected.hotel_id,
    hotel_name: selected.hotel_name,
    room_name: selected.room_name,
    board_name: selected.board_name,
    cancellation_policies: selected.cancellation_policies,
    price_status: selected.price_status
  });
});

app.get("/api/currency/convert", (req, res) => {
  const amount = money(req.query.amount, 0);
  const from = clean(req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to || "USD").toUpperCase();

  if (!amount || !FX[from] || !FX[to]) {
    return res.status(400).json({
      ok: false,
      message: "Conversion unavailable."
    });
  }

  res.json({
    ok: true,
    amount,
    from,
    to,
    converted: Number(((amount / FX[from]) * FX[to]).toFixed(2))
  });
});

app.get("/image-proxy", (req, res) => {
  const url = clean(req.query.url);
  if (!url.startsWith("http")) return res.status(400).send("Invalid image URL");
  res.redirect(url);
});

app.post("/reservation-request", async (req, res) => {
  try {
    const body = req.body || {};
    const reservation_code = makeCode();
    const amount = money(body.amount || 0, 0);
    const currency = clean(body.currency || "").toLowerCase();

    reservations.set(reservation_code, {
      reservation_code,
      hotel_id: clean(body.hotel_id),
      hotel_name: clean(body.hotel_name),
      destination: clean(body.destination),
      checkin: clean(body.checkin),
      checkout: clean(body.checkout),
      guests: Number(body.guests || 1),
      rooms: Number(body.rooms || 1),
      customer_name: clean(body.customer_name),
      customer_email: clean(body.customer_email),
      customer_phone: clean(body.customer_phone),
      note: clean(body.note),
      amount: amount ? String(amount) : "",
      currency: currency.toUpperCase(),
      status: amount > 0 ? "ready_for_secure_payment" : "rate_confirmation_required",
      created_at: new Date().toISOString()
    });

    if (stripe && amount > 0 && currency) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${PUBLIC_FRONTEND_URL}/?reservation=${encodeURIComponent(reservation_code)}&status=success`,
        cancel_url: `${PUBLIC_FRONTEND_URL}/?reservation=${encodeURIComponent(reservation_code)}&status=cancelled`,
        customer_email: clean(body.customer_email) || undefined,
        metadata: { reservation_code, hotel_id: clean(body.hotel_id) },
        line_items: [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: clean(body.hotel_name).slice(0, 250) || "Hotel reservation",
              description: `${clean(body.checkin)} to ${clean(body.checkout)}`.slice(0, 250)
            }
          }
        }]
      });

      return res.json({ ok: true, reservation_code, payment_url: session.url });
    }

    res.json({
      ok: true,
      reservation_code,
      message: "Reservation request received. Pricing and availability will be confirmed before secure payment."
    });
  } catch {
    res.status(500).json({
      ok: false,
      message: "Reservation request could not be completed."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  const countries = buildDestinations();
  console.log(`MySpace Hotel backend running on http://127.0.0.1:${PORT}`);
  console.log(`Countries: ${countries.length}`);
  console.log(`Cities: ${countries.reduce((s, x) => s + x.cities.length, 0)}`);
});
