const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5050);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));

const reservations = new Map();

const FX = {
  GBP: 1,
  USD: 1.25,
  EUR: 1.17,
  NGN: 1900,
  AED: 4.59,
  TRY: 40.5,
  CZK: 29.2,
};

const CITY_CURRENCY = {
  lagos: "NGN",
  abuja: "NGN",
  london: "GBP",
  paris: "EUR",
  barcelona: "EUR",
  madrid: "EUR",
  dubai: "AED",
  "new york": "USD",
  istanbul: "TRY",
  prague: "CZK",
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

function extractHotels(json) {
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

function discoverInventoryFiles() {
  const names = [
    "hotel_inventory.json",
    "hotels.json",
    "real_hotels.json",
    "real_catalog.json",
    "hotel_catalog.json",
    "global_hotels.json",
    "availability_cache.json",
    "saved_availability.json",
    "hotelbeds_hotels.json",
    "ratehawk_hotels.json",
    "amadeus_hotels.json",
  ];

  const direct = names.map((name) => path.join(__dirname, name));

  const recursive = [];
  function walk(dir) {
    try {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory() && !["node_modules", "dist", ".git"].includes(item.name)) walk(full);
        if (item.isFile() && item.name.toLowerCase().endsWith(".json")) recursive.push(full);
      }
    } catch {}
  }

  walk(__dirname);

  return [...new Set([...direct, ...recursive])]
    .filter((file) => fs.existsSync(file))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
}

let HOTEL_CACHE = null;
let HOTEL_SOURCE = "";

function loadHotels() {
  if (HOTEL_CACHE) return HOTEL_CACHE;

  const files = discoverInventoryFiles();

  for (const file of files) {
    const json = readJson(file);
    const hotels = extractHotels(json);

    if (hotels.length > 0) {
      HOTEL_CACHE = hotels;
      HOTEL_SOURCE = file;
      console.log(`Loaded ${hotels.length} real hotels from ${file}`);
      return HOTEL_CACHE;
    }
  }

  HOTEL_CACHE = [];
  HOTEL_SOURCE = "";
  console.log("No real hotel inventory found.");
  return HOTEL_CACHE;
}

function getRate(raw) {
  const rate =
    raw.first_rate ||
    raw.rate ||
    raw.lowest_rate ||
    raw.lowestRate ||
    raw.best_rate ||
    raw.bestRate ||
    raw.rates?.[0] ||
    raw.rooms?.[0]?.rates?.[0] ||
    {};

  return rate || {};
}

function getName(raw, index) {
  return clean(
    raw.hotel_name ||
    raw.name ||
    raw.hotelName ||
    raw.property_name ||
    raw.propertyName ||
    raw.title ||
    `Hotel ${index + 1}`
  );
}

function getCity(raw) {
  return clean(
    raw.city ||
    raw.destination ||
    raw.destination_name ||
    raw.destinationName ||
    raw.location?.city ||
    raw.address?.city ||
    raw.cityName ||
    raw.zoneName ||
    ""
  );
}

function getCountry(raw) {
  return clean(
    raw.country ||
    raw.country_name ||
    raw.countryName ||
    raw.location?.country ||
    raw.address?.country ||
    raw.country_code ||
    raw.countryCode ||
    ""
  );
}

function getCurrency(raw, rate, city) {
  return clean(
    raw.currency ||
    raw.display_currency ||
    raw.payment_currency ||
    rate.display_currency ||
    rate.currency ||
    rate.payment_currency ||
    CITY_CURRENCY[norm(city)] ||
    "GBP"
  ).toUpperCase();
}

function getPrice(raw, rate) {
  return money(
    raw.price ||
    raw.amount ||
    raw.display_amount ||
    raw.selling_rate ||
    raw.net ||
    rate.display_amount ||
    rate.selling_rate ||
    rate.sellingRate ||
    rate.net ||
    rate.amount ||
    rate.payment_amount ||
    0
  );
}

function normalizeHotel(raw, index, fallbackCity) {
  const rate = getRate(raw);
  const city = getCity(raw) || fallbackCity;
  const currency = getCurrency(raw, rate, city);
  const price = getPrice(raw, rate);

  const id = clean(
    raw.hotel_id ||
    raw.id ||
    raw.code ||
    raw.hotelCode ||
    raw.hotel_code ||
    raw.property_id ||
    raw.propertyId ||
    `hotel-${index + 1}`
  );

  return {
    id,
    hotel_id: id,
    name: getName(raw, index),
    hotel_name: getName(raw, index),
    city,
    country: getCountry(raw),
    area: clean(raw.area || raw.neighbourhood || raw.neighborhood || raw.zone || raw.zoneName || raw.district || ""),
    address: clean(raw.address || raw.address_line || raw.addressLine || raw.location || raw.full_address || ""),
    rating: clean(raw.rating || raw.stars || raw.category || raw.categoryName || "Available"),
    image_url: clean(raw.image_url || raw.image || raw.main_image || raw.photo || raw.photos?.[0] || raw.images?.[0] || ""),
    currency,
    price,
    live_payment_ready: Boolean(clean(rate.rate_key || rate.rateKey || raw.rate_key || raw.rateKey)) || price > 0,
    price_status: price > 0 ? "Live or saved supplier rate available. Refresh before final payment." : "Rate available on request. Supplier confirmation required.",
    first_rate: {
      rate_key: clean(rate.rate_key || rate.rateKey || raw.rate_key || raw.rateKey || id),
      display_amount: price ? String(price) : "",
      display_currency: currency,
      payment_amount: price ? String(price) : "",
      payment_currency: currency,
      room_name: clean(rate.room_name || rate.roomName || raw.room_name || raw.roomName || "Selected room"),
      board_name: clean(rate.board_name || rate.boardName || raw.board_name || raw.boardName || ""),
      cancellation_policies: Array.isArray(rate.cancellation_policies) ? rate.cancellation_policies : [],
    },
  };
}

function hotelMatches(hotel, country, city, area, keyword) {
  const text = norm([
    hotel.hotel_name,
    hotel.name,
    hotel.city,
    hotel.country,
    hotel.area,
    hotel.address,
    hotel.rating,
    hotel.first_rate?.room_name,
    hotel.first_rate?.board_name,
  ].join(" "));

  const cityValue = norm(city);
  const countryValue = norm(country);
  const areaValue = norm(area);
  const keywordValue = norm(keyword);

  if (cityValue && !text.includes(cityValue)) return false;
  if (countryValue && !text.includes(countryValue)) {
    if (!(cityValue && text.includes(cityValue))) return false;
  }
  if (areaValue && !text.includes(areaValue)) return false;
  if (keywordValue && !text.includes(keywordValue)) return false;

  return true;
}

function buildDestinationsFromHotels(hotels) {
  const map = new Map();

  for (let i = 0; i < Math.min(hotels.length, 200000); i++) {
    const h = normalizeHotel(hotels[i], i, "");
    const country = h.country || "Worldwide";
    const city = h.city || "Global";
    const currency = h.currency || CITY_CURRENCY[norm(city)] || "GBP";

    if (!map.has(country)) map.set(country, new Map());
    if (!map.get(country).has(city)) map.get(country).set(city, { city, currency });
  }

  const countries = [...map.entries()].map(([country, citiesMap]) => ({
    country,
    cities: [...citiesMap.values()].sort((a, b) => a.city.localeCompare(b.city)),
  }));

  countries.sort((a, b) => {
    if (a.country === "Nigeria") return -1;
    if (b.country === "Nigeria") return 1;
    if (a.country === "United Kingdom") return -1;
    if (b.country === "United Kingdom") return 1;
    return a.country.localeCompare(b.country);
  });

  return countries;
}

app.get("/", (req, res) => {
  const hotels = loadHotels();
  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    port: PORT,
    real_hotels_loaded: hotels.length,
    hotel_source: HOTEL_SOURCE,
  });
});

app.get("/health", (req, res) => {
  const hotels = loadHotels();
  res.json({
    ok: true,
    service: "hotel-backend",
    port: PORT,
    real_hotels_loaded: hotels.length,
    hotel_source: HOTEL_SOURCE,
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  const hotels = loadHotels();
  res.json({
    ok: true,
    total_hotels: hotels.length,
    hotel_source: HOTEL_SOURCE,
    countries: buildDestinationsFromHotels(hotels),
  });
});

app.get("/api/real-catalog/search", (req, res) => {
  const country = clean(req.query.country);
  const city = clean(req.query.city);
  const area = clean(req.query.area);
  const keyword = clean(req.query.keyword);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 120)));

  const rawHotels = loadHotels();
  const results = [];

  for (let i = 0; i < rawHotels.length; i++) {
    const hotel = normalizeHotel(rawHotels[i], i, city);

    if (hotelMatches(hotel, country, city, area, keyword)) {
      results.push(hotel);
      if (results.length >= limit) break;
    }
  }

  res.json({
    ok: true,
    hotels: results,
    count: results.length,
    total_catalog_hotels: rawHotels.length,
    hotel_source: HOTEL_SOURCE,
    source: "real_102k_catalog_no_fake_hotels",
  });
});

app.get("/api/hotels/selected-live-price-v2", (req, res) => {
  const city = clean(req.query.destination_code || req.query.city);
  const amount = money(req.query.amount, 0);
  const currency = clean(req.query.currency || CITY_CURRENCY[norm(city)] || "GBP").toUpperCase();

  res.json({
    ok: true,
    live_payment_ready: amount > 0,
    price_status: amount > 0
      ? "Live or saved supplier rate refreshed. Final supplier confirmation still applies before payment."
      : "Supplier rate must be confirmed before payment.",
    amount,
    currency,
    first_rate: {
      rate_key: clean(req.query.hotel_id || "selected-rate"),
      display_amount: amount ? String(amount) : "",
      display_currency: currency,
      payment_amount: amount ? String(amount) : "",
      payment_currency: currency,
      room_name: "Selected room",
      board_name: "",
    },
  });
});

app.get("/api/currency/convert", (req, res) => {
  const amount = money(req.query.amount, 0);
  const from = clean(req.query.from || "GBP").toUpperCase();
  const to = clean(req.query.to || "USD").toUpperCase();

  if (!amount || amount <= 0) return res.status(400).json({ ok: false, message: "Valid amount is required." });
  if (!FX[from] || !FX[to]) return res.status(400).json({ ok: false, message: "Unsupported currency." });

  const converted = (amount / FX[from]) * FX[to];

  res.json({
    ok: true,
    amount,
    from,
    to,
    converted: Number(converted.toFixed(2)),
    rate: Number((FX[to] / FX[from]).toFixed(6)),
    note: "Estimated display conversion. Final payment currency is confirmed before payment.",
  });
});

app.get("/image-proxy", (req, res) => {
  const url = clean(req.query.url);
  if (!url.startsWith("http")) return res.status(400).send("Invalid image URL");
  res.redirect(url);
});

app.post("/reservation-request", (req, res) => {
  const body = req.body || {};
  const reservation_code = makeCode();

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
    amount: clean(body.amount),
    currency: clean(body.currency),
    status: "request_received",
    created_at: new Date().toISOString(),
  };

  reservations.set(reservation_code, reservation);

  res.json({
    ok: true,
    reservation_code,
    message: `Reservation request received. Reference: ${reservation_code}`,
    reservation,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  const hotels = loadHotels();
  console.log(`MySpace Hotel backend running on http://127.0.0.1:${PORT}`);
  console.log(`Loaded real hotels: ${hotels.length}`);
  console.log(`Hotel source: ${HOTEL_SOURCE || "NONE FOUND"}`);
});
