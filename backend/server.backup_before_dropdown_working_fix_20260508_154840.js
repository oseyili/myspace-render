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
  GBP: 1, USD: 1.25, EUR: 1.17, NGN: 1900, AED: 4.59, TRY: 40.5, CZK: 29.2,
  CAD: 1.7, AUD: 1.9, ZAR: 23, CHF: 1.1, JPY: 195, CNY: 9.1, INR: 104
};

const FALLBACK_COUNTRIES = [
  { country: "Nigeria", cities: [{ city: "Lagos", currency: "NGN" }, { city: "Abuja", currency: "NGN" }] },
  { country: "United Kingdom", cities: [{ city: "London", currency: "GBP" }] },
  { country: "France", cities: [{ city: "Paris", currency: "EUR" }] },
  { country: "Spain", cities: [{ city: "Barcelona", currency: "EUR" }, { city: "Madrid", currency: "EUR" }] },
  { country: "United Arab Emirates", cities: [{ city: "Dubai", currency: "AED" }] },
  { country: "United States", cities: [{ city: "New York", currency: "USD" }] }
];

function clean(v) { return String(v || "").trim(); }
function norm(v) { return clean(v).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(); }
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
  if (Array.isArray(json.countries)) return json.countries;
  return [];
}
function discoverJsonFiles() {
  const files = [];
  function walk(dir) {
    try {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory() && !["node_modules", "dist", ".git"].includes(item.name)) walk(full);
        if (item.isFile() && item.name.toLowerCase().endsWith(".json")) {
          if (!["package.json", "package-lock.json", "tsconfig.json"].includes(item.name.toLowerCase())) files.push(full);
        }
      }
    } catch {}
  }
  walk(__dirname);
  return files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
}

let HOTEL_CACHE = null;
let HOTEL_SOURCE = "";

function loadHotels() {
  if (HOTEL_CACHE) return HOTEL_CACHE;

  for (const file of discoverJsonFiles()) {
    const json = readJson(file);
    const arr = extractArray(json);
    if (arr.length > 1000) {
      HOTEL_CACHE = arr;
      HOTEL_SOURCE = file;
      console.log(`Loaded ${arr.length} records from ${file}`);
      return HOTEL_CACHE;
    }
  }

  HOTEL_CACHE = [];
  HOTEL_SOURCE = "";
  return HOTEL_CACHE;
}

function getDeep(raw, paths) {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = raw;
    for (const part of parts) cur = cur && cur[part];
    if (clean(cur)) return clean(cur);
  }
  return "";
}

function rateFrom(raw) {
  return raw.first_rate || raw.lowest_rate || raw.best_rate || raw.rate || raw.rates?.[0] || raw.rooms?.[0]?.rates?.[0] || {};
}

function normalizeHotel(raw, index, fallbackCity = "", fallbackCountry = "") {
  const rate = rateFrom(raw);

  const city = getDeep(raw, [
    "city", "cityName", "city_name", "destination", "destination_name", "destinationName",
    "location.city", "address.city", "zoneName", "zone_name", "locality", "municipality"
  ]) || fallbackCity;

  const country = getDeep(raw, [
    "country", "countryName", "country_name", "country_code", "countryCode",
    "location.country", "address.country", "nation"
  ]) || fallbackCountry;

  const price = money(
    raw.price || raw.amount || raw.display_amount || raw.selling_rate || raw.net ||
    rate.display_amount || rate.selling_rate || rate.sellingRate || rate.net || rate.amount || rate.payment_amount,
    0
  );

  const currency = clean(
    raw.currency || raw.display_currency || raw.payment_currency ||
    rate.display_currency || rate.currency || rate.payment_currency || "GBP"
  ).toUpperCase();

  const id = getDeep(raw, ["hotel_id", "id", "code", "hotelCode", "hotel_code", "property_id", "propertyId"]) || `hotel-${index + 1}`;
  const name = getDeep(raw, ["hotel_name", "name", "hotelName", "property_name", "propertyName", "title"]) || `Hotel ${index + 1}`;

  return {
    id,
    hotel_id: id,
    name,
    hotel_name: name,
    city,
    country,
    area: getDeep(raw, ["area", "neighbourhood", "neighborhood", "zone", "zoneName", "district"]),
    address: getDeep(raw, ["address", "address_line", "addressLine", "full_address", "location.address"]),
    rating: getDeep(raw, ["rating", "stars", "category", "categoryName"]) || "Available",
    image_url: clean(raw.image_url || raw.image || raw.main_image || raw.photo || raw.photos?.[0] || raw.images?.[0] || ""),
    currency,
    price,
    live_payment_ready: false,
    price_status: "Live supplier rate required before payment.",
    first_rate: {
      rate_key: clean(rate.rate_key || rate.rateKey || raw.rate_key || raw.rateKey || id),
      display_amount: price ? String(price) : "",
      display_currency: currency,
      payment_amount: price ? String(price) : "",
      payment_currency: currency,
      room_name: clean(rate.room_name || rate.roomName || raw.room_name || raw.roomName || "Selected room"),
      board_name: clean(rate.board_name || rate.boardName || raw.board_name || raw.boardName || ""),
      cancellation_policies: Array.isArray(rate.cancellation_policies) ? rate.cancellation_policies : []
    }
  };
}

function buildDestinations(records) {
  const map = new Map();

  function add(country, city, currency) {
    country = clean(country);
    city = clean(city);
    currency = clean(currency || "GBP").toUpperCase();

    if (!country || !city) return;
    if (norm(country) === "worldwide") return;
    if (norm(city) === "global") return;

    if (!map.has(country)) map.set(country, new Map());
    if (!map.get(country).has(city)) map.get(country).set(city, { city, currency });
  }

  for (const group of FALLBACK_COUNTRIES) {
    for (const c of group.cities) add(group.country, c.city, c.currency);
  }

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];

    if (raw.country && Array.isArray(raw.cities)) {
      for (const c of raw.cities) add(raw.country, c.city || c.name, c.currency);
      continue;
    }

    const h = normalizeHotel(raw, i);
    add(h.country, h.city, h.currency);
  }

  const countries = [...map.entries()].map(([country, cities]) => ({
    country,
    cities: [...cities.values()].sort((a, b) => a.city.localeCompare(b.city))
  }));

  countries.sort((a, b) => a.country.localeCompare(b.country));
  return countries;
}

function matchesHotel(h, country, city, area, keyword) {
  const text = norm([h.hotel_name, h.city, h.country, h.area, h.address, h.rating, h.first_rate.room_name, h.first_rate.board_name].join(" "));
  if (country && !text.includes(norm(country))) return false;
  if (city && !text.includes(norm(city))) return false;
  if (area && !text.includes(norm(area))) return false;
  if (keyword && !text.includes(norm(keyword))) return false;
  return true;
}

app.get("/", (req, res) => {
  const hotels = loadHotels();
  const countries = buildDestinations(hotels);
  res.json({ ok: true, service: "MySpace Hotel backend", real_hotels_loaded: hotels.length, countries: countries.length, cities: countries.reduce((s, x) => s + x.cities.length, 0), hotel_source: HOTEL_SOURCE, stripe_enabled: Boolean(stripe) });
});

app.get("/health", (req, res) => {
  const hotels = loadHotels();
  const countries = buildDestinations(hotels);
  res.json({ ok: true, real_hotels_loaded: hotels.length, countries: countries.length, cities: countries.reduce((s, x) => s + x.cities.length, 0), hotel_source: HOTEL_SOURCE, stripe_enabled: Boolean(stripe) });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const hotels = loadHotels();
  const countries = buildDestinations(hotels);
  res.json({ ok: true, total_hotels: hotels.length, total_countries: countries.length, total_cities: countries.reduce((s, x) => s + x.cities.length, 0), hotel_source: HOTEL_SOURCE, countries });
});

app.get("/api/real-catalog/search", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const area = clean(req.query.area);
  const keyword = clean(req.query.keyword);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 120)));
  const rawHotels = loadHotels();
  const hotels = [];

  for (let i = 0; i < rawHotels.length; i++) {
    const h = normalizeHotel(rawHotels[i], i, city, country);
    if (matchesHotel(h, country, city, area, keyword)) {
      hotels.push(h);
      if (hotels.length >= limit) break;
    }
  }

  res.json({ ok: true, hotels, count: hotels.length, total_catalog_hotels: rawHotels.length, hotel_source: HOTEL_SOURCE });
});

app.get("/api/hotels/selected-live-price-v2", (req, res) => {
  const rawHotels = loadHotels();
  const selectedId = clean(req.query.hotel_id || req.query.id);
  const selectedName = norm(req.query.hotel_name || req.query.name);
  const city = clean(req.query.destination_code || req.query.city);
  const country = clean(req.query.country);

  let selected = null;

  for (let i = 0; i < rawHotels.length; i++) {
    const h = normalizeHotel(rawHotels[i], i, city, country);
    if ((selectedId && String(h.hotel_id) === String(selectedId)) || (selectedName && norm(h.hotel_name) === selectedName)) {
      selected = h;
      break;
    }
  }

  const amount = 0;
  const currency = clean(selected?.currency || selected?.first_rate?.display_currency || req.query.currency || "GBP").toUpperCase();

  res.json({
    ok: true,
    live_payment_ready: false,
    price_status: "No live supplier rate connected yet. Cached/fake prices are blocked.",
    amount,
    currency,
    hotel_id: selected?.hotel_id || selectedId,
    hotel_name: selected?.hotel_name || clean(req.query.hotel_name),
    first_rate: {
      rate_key: clean(selected?.first_rate?.rate_key || selected?.hotel_id || selectedId || "selected-rate"),
      display_amount: amount ? String(amount) : "",
      display_currency: currency,
      payment_amount: amount ? String(amount) : "",
      payment_currency: currency,
      room_name: selected?.first_rate?.room_name || "Selected room",
      board_name: selected?.first_rate?.board_name || "",
      cancellation_policies: selected?.first_rate?.cancellation_policies || []
    }
  });
});

app.get("/api/currency/convert", (req, res) => {
  const amount = money(req.query.amount, 0);
  const from = clean(req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to || "USD").toUpperCase();
  if (!amount || !FX[from] || !FX[to]) return res.status(400).json({ ok: false, message: "Unsupported or invalid conversion." });
  const converted = (amount / FX[from]) * FX[to];
  res.json({ ok: true, amount, from, to, converted: Number(converted.toFixed(2)), note: "Estimated display conversion. Final payment currency is confirmed before payment." });
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
    const amount = money(body.amount || body.display_amount, 0);
    const currency = clean(body.currency || body.display_currency || "GBP").toLowerCase();

    const reservation = {
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
      amount: String(amount || ""),
      currency: currency.toUpperCase(),
      rate_key: clean(body.rate_key),
      status: "pending_payment",
      paid: false,
      created_at: new Date().toISOString()
    };

    reservations.set(reservation_code, reservation);

    if (stripe && amount > 0 && currency) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${PUBLIC_FRONTEND_URL}/?reservation=${encodeURIComponent(reservation_code)}&status=success`,
        cancel_url: `${PUBLIC_FRONTEND_URL}/?reservation=${encodeURIComponent(reservation_code)}&status=cancelled`,
        customer_email: reservation.customer_email || undefined,
        metadata: { reservation_code, hotel_id: reservation.hotel_id },
        line_items: [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: reservation.hotel_name.slice(0, 250) || "Hotel reservation",
              description: `${reservation.checkin} to ${reservation.checkout}`.slice(0, 250)
            }
          }
        }]
      });

      reservation.stripe_session_id = session.id;
      reservations.set(reservation_code, reservation);
      return res.json({ ok: true, reservation_code, payment_url: session.url, stripe_enabled: true });
    }

    return res.json({ ok: true, reservation_code, stripe_enabled: false, message: `Reservation request received. Reference: ${reservation_code}. Stripe is not enabled in this terminal environment.` });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Could not prepare booking/payment.", detail: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  const hotels = loadHotels();
  const countries = buildDestinations(hotels);
  console.log(`MySpace Hotel backend running on http://127.0.0.1:${PORT}`);
  console.log(`Loaded records: ${hotels.length}`);
  console.log(`Countries: ${countries.length}`);
  console.log(`Cities: ${countries.reduce((s, x) => s + x.cities.length, 0)}`);
  console.log(`Hotel source: ${HOTEL_SOURCE || "NONE FOUND"}`);
  console.log(`Stripe enabled: ${Boolean(stripe)}`);
});

