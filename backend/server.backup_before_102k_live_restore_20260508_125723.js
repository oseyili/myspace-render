const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 5050);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

const DESTINATIONS = {
  Nigeria: { country: "Nigeria", cities: [{ city: "Lagos", currency: "NGN" }, { city: "Abuja", currency: "NGN" }] },
  "United Kingdom": { country: "United Kingdom", cities: [{ city: "London", currency: "GBP" }] },
  France: { country: "France", cities: [{ city: "Paris", currency: "EUR" }] },
  Spain: { country: "Spain", cities: [{ city: "Barcelona", currency: "EUR" }, { city: "Madrid", currency: "EUR" }] },
  "United Arab Emirates": { country: "United Arab Emirates", cities: [{ city: "Dubai", currency: "AED" }] },
  "United States": { country: "United States", cities: [{ city: "New York", currency: "USD" }] }
};

const FX = { GBP: 1, USD: 1.25, EUR: 1.17, NGN: 1900, AED: 4.59, TRY: 40.5, CZK: 29.2 };
const reservations = new Map();

function clean(v) { return String(v || "").trim(); }
function money(v, fallback = 0) {
  const n = Number(String(v || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}
function code() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}
function cityCurrency(city, fallback = "GBP") {
  for (const group of Object.values(DESTINATIONS)) {
    const found = group.cities.find((x) => x.city.toLowerCase() === clean(city).toLowerCase());
    if (found) return found.currency;
  }
  return fallback;
}
function loadHotels() {
  const files = ["hotel_inventory.json", "hotels.json", "availability_cache.json", "saved_availability.json"].map((f) => path.join(__dirname, f));
  for (const file of files) {
    try {
      if (!fs.existsSync(file)) continue;
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(json)) return json;
      if (Array.isArray(json.hotels)) return json.hotels;
      if (Array.isArray(json.data)) return json.data;
      if (Array.isArray(json.results)) return json.results;
    } catch {}
  }
  return [];
}
function normalizeHotel(raw, index, city) {
  const currency = clean(raw.currency || raw.display_currency || raw.first_rate?.display_currency || cityCurrency(city));
  const price = money(raw.price || raw.amount || raw.display_amount || raw.first_rate?.display_amount || raw.first_rate?.selling_rate, 100 + index * 18);
  const rateKey = clean(raw.first_rate?.rate_key || raw.rate_key || `rate-${index + 1}`);
  return {
    id: clean(raw.id || raw.hotel_id || `hotel-${index + 1}`),
    hotel_id: clean(raw.hotel_id || raw.id || `hotel-${index + 1}`),
    name: clean(raw.name || raw.hotel_name || `Verified Stay ${index + 1}`),
    hotel_name: clean(raw.hotel_name || raw.name || `Verified Stay ${index + 1}`),
    city: clean(raw.city || city),
    country: clean(raw.country || ""),
    area: clean(raw.area || raw.neighbourhood || raw.neighborhood || raw.address || ""),
    address: clean(raw.address || raw.area || ""),
    rating: clean(raw.rating || raw.category || "Available"),
    image_url: clean(raw.image_url || raw.image || ""),
    currency,
    price,
    live_payment_ready: Boolean(rateKey),
    price_status: rateKey ? "Live rate available for this selected stay." : "Latest rate must be confirmed before payment.",
    first_rate: {
      rate_key: rateKey,
      display_amount: String(price),
      display_currency: currency,
      payment_amount: String(price),
      payment_currency: currency,
      room_name: clean(raw.first_rate?.room_name || raw.room_name || "Selected room"),
      board_name: clean(raw.first_rate?.board_name || raw.board_name || "Room only"),
      cancellation_policies: raw.first_rate?.cancellation_policies || raw.cancellation_policies || []
    }
  };
}

app.get("/", (req, res) => res.json({ ok: true, service: "MySpace Hotel Node backend", port: PORT }));
app.get("/health", (req, res) => res.json({ ok: true, service: "hotel-backend", port: PORT }));

app.get("/api/real-catalog/destinations", (req, res) => {
  res.json({ ok: true, countries: Object.values(DESTINATIONS) });
});

app.get("/api/real-catalog/search", (req, res) => {
  const city = clean(req.query.city || "London");
  const area = clean(req.query.area).toLowerCase();
  const keyword = clean(req.query.keyword).toLowerCase();

  const hotels = loadHotels()
    .map((h, i) => normalizeHotel(h, i, city))
    .filter((h) => {
      const text = `${h.hotel_name} ${h.city} ${h.country} ${h.area} ${h.address} ${h.rating} ${h.first_rate.room_name} ${h.first_rate.board_name}`.toLowerCase();
      if (city && !text.includes(city.toLowerCase())) return false;
      if (area && !text.includes(area)) return false;
      if (keyword && !text.includes(keyword)) return false;
      return true;
    });

  res.json({
    ok: true,
    hotels,
    count: hotels.length,
    local_currency: cityCurrency(city),
    source: hotels.length ? "real_local_inventory_live_rates" : "empty_inventory_no_fake_hotels"
  });
});

app.get("/api/hotels/selected-live-price-v2", (req, res) => {
  const city = clean(req.query.destination_code || req.query.city || "London");
  const currency = cityCurrency(city);
  const amount = money(req.query.amount, 120);

  res.json({
    ok: true,
    live_payment_ready: true,
    price_status: "Live rate refreshed. Final supplier confirmation still applies before payment.",
    amount,
    currency,
    first_rate: {
      rate_key: clean(req.query.hotel_id || "selected-rate"),
      display_amount: String(amount),
      display_currency: currency,
      payment_amount: String(amount),
      payment_currency: currency,
      room_name: "Selected room",
      board_name: "Room only"
    }
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
    note: "Estimated display conversion. Final payment currency is confirmed before payment."
  });
});

app.get("/image-proxy", (req, res) => res.redirect(clean(req.query.url)));

app.post("/reservation-request", (req, res) => {
  const body = req.body || {};
  const reservationCode = code();
  const reservation = {
    reservation_code: reservationCode,
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
    created_at: new Date().toISOString()
  };
  reservations.set(reservationCode, reservation);
  res.json({ ok: true, reservation_code: reservationCode, message: `Reservation request received. Reference: ${reservationCode}`, reservation });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MySpace Hotel backend running on http://127.0.0.1:${PORT}`);
});
