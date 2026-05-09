require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();

const PORT = Number(process.env.PORT || 5050);
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || "http://localhost:5173";

let stripe = null;

try {
  if (STRIPE_SECRET_KEY) {
    stripe = require("stripe")(STRIPE_SECRET_KEY);
  }
} catch {}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

const DATA_DIR = path.join(__dirname, "data");

function clean(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(String(v || "0").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function readJson(name) {
  try {
    const file = path.join(DATA_DIR, name);

    if (!fs.existsSync(file)) {
      console.log("Missing:", name);
      return [];
    }

    const raw = fs.readFileSync(file, "utf8");
    console.log(`Reading ${name}: ${raw.length} bytes`);

    const json = JSON.parse(raw);

    if (Array.isArray(json)) return json;
    if (Array.isArray(json.hotels)) return json.hotels;
    if (Array.isArray(json.data)) return json.data;
    if (Array.isArray(json.results)) return json.results;
    if (Array.isArray(json.items)) return json.items;

    return [];
  } catch (e) {
    console.log("JSON ERROR:", name, e.message);
    return [];
  }
}

const LIVE_RATES = [
  ...readJson("hotel_live_rates_seed.json"),
  ...readJson("hotel_live_rates_london_seed.json"),
];

const IMAGE_RECORDS = readJson("hotel_images_live_backup.json");
const SUPPLIER_HOTELS = readJson("hotel_supplier_feed.json");

const imageMap = new Map();

for (const img of IMAGE_RECORDS) {
  const code = clean(img.hotel_code || img.hotelCode || img.hotel_id || img.id);
  const url = clean(img.image_url || img.imageUrl || img.image || img.url);

  if (code && url) {
    imageMap.set(code, url);
  }
}

const liveHotels = [];

for (const r of LIVE_RATES) {
  const code = clean(r.hotel_code || r.hotelCode || r.hotel_id || r.id);

  liveHotels.push({
    id: code,
    hotel_id: code,
    hotel_name: clean(r.hotel_name || r.hotelName || r.name),
    country: clean(r.country || r.countryName || ""),
    city: clean(r.city || r.cityName || r.destination_name || ""),
    area: clean(r.zone_name || r.zoneName || r.area || ""),
    address: clean(r.address || ""),
    image_url: imageMap.get(code) || clean(r.image_url || r.image || ""),
    latitude: r.latitude || "",
    longitude: r.longitude || "",
    room_name: clean(r.room_name || r.roomName || "Selected room"),
    board_name: clean(r.board_name || r.boardName || "Room only"),
    payment_type: clean(r.payment_type || r.paymentType || "Secure payment"),
    currency: clean(r.currency || "GBP").toUpperCase(),
    amount: money(r.selling_rate || r.sellingRate || r.net || r.amount),
    rate_key: clean(r.rate_key || r.rateKey || code),
    live_rate: true,
  });
}

const supplierHotels = [];

for (const h of SUPPLIER_HOTELS) {
  const code = clean(h.supplier_hotel_id || h.hotel_code || h.hotel_id || h.id);

  supplierHotels.push({
    id: code,
    hotel_id: code,
    hotel_name: clean(h.name || h.hotel_name || h.hotelName),
    country: clean(h.country || h.countryName),
    city: clean(h.city || h.cityName),
    area: clean(h.area || h.zone_name || h.zoneName),
    address: clean(h.address),
    image_url: clean(h.image || h.image_url || imageMap.get(code) || ""),
    live_rate: false,
  });
}

const allHotels = [...liveHotels, ...supplierHotels];

const countriesMap = new Map();

for (const h of allHotels) {
  const country = clean(h.country);
  const city = clean(h.city);

  if (!country || !city) continue;

  if (!countriesMap.has(country)) {
    countriesMap.set(country, new Set());
  }

  countriesMap.get(country).add(city);
}

const countryObjects = [...countriesMap.entries()]
  .map(([country, cities]) => ({
    country,
    cities: [...cities].sort((a, b) => a.localeCompare(b)),
  }))
  .sort((a, b) => a.country.localeCompare(b.country));

const countryNames = countryObjects.map((x) => x.country);

const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : null;

function makeCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

function hotelMatches(h, country, city, area, keyword) {
  if (country && clean(h.country).toLowerCase() !== country) return false;
  if (city && clean(h.city).toLowerCase() !== city) return false;

  const text = [h.hotel_name, h.area, h.address, h.city, h.country]
    .join(" ")
    .toLowerCase();

  if (area && !text.includes(area)) return false;
  if (keyword && !text.includes(keyword)) return false;

  return true;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "MySpace Hotel backend",
    hotels: allHotels.length,
    live_rate_hotels: liveHotels.length,
    supplier_hotels: supplierHotels.length,
    countries: countryObjects.length,
    cities: countryObjects.reduce((s, x) => s + x.cities.length, 0),
    stripe: Boolean(stripe),
    smtp: Boolean(transporter),
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    hotels: allHotels.length,
    live_rate_hotels: liveHotels.length,
    supplier_hotels: supplierHotels.length,
    countries: countryObjects.length,
    cities: countryObjects.reduce((s, x) => s + x.cities.length, 0),
    stripe: Boolean(stripe),
    smtp: Boolean(transporter),
  });
});

app.get("/countries", (req, res) => {
  res.json(countryNames);
});

app.get("/cities", (req, res) => {
  const country = clean(req.query.country);
  const found = countryObjects.find((x) => x.country.toLowerCase() === country.toLowerCase());
  res.json(found ? found.cities : []);
});

app.get("/hotels", (req, res) => {
  const country = clean(req.query.country).toLowerCase();
  const city = clean(req.query.city).toLowerCase();
  const area = clean(req.query.area).toLowerCase();
  const keyword = clean(req.query.keyword).toLowerCase();

  const results = allHotels
    .filter((h) => hotelMatches(h, country, city, area, keyword))
    .slice(0, 500)
    .map((h) => ({
      ...h,
      image: h.image_url,
    }));

  res.json(results);
});

app.get("/api/countries", (req, res) => {
  res.json({
    ok: true,
    countries: countryObjects,
  });
});

app.get("/api/real-catalog/destinations", (req, res) => {
  res.json({
    ok: true,
    countries: countryObjects,
    total_countries: countryObjects.length,
    total_cities: countryObjects.reduce((s, x) => s + x.cities.length, 0),
  });
});

app.get("/api/hotels/search", (req, res) => {
  const country = clean(req.query.country).toLowerCase();
  const city = clean(req.query.city).toLowerCase();
  const area = clean(req.query.area).toLowerCase();
  const keyword = clean(req.query.keyword).toLowerCase();
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 500)));

  const results = allHotels
    .filter((h) => hotelMatches(h, country, city, area, keyword))
    .slice(0, limit);

  res.json({
    ok: true,
    hotels: results,
    count: results.length,
  });
});

app.post("/reservation-request", async (req, res) => {
  try {
    const body = req.body || {};
    const reservationCode = makeCode();

    const hotelName = clean(body.hotel_name);
    const customerEmail = clean(body.customer_email);
    const amount = money(body.amount);
    const currency = clean(body.currency || "GBP").toLowerCase();

    if (transporter && customerEmail) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: customerEmail,
        subject: `MySpace Hotel Reservation - ${reservationCode}`,
        html: `
          <h2>Reservation received</h2>
          <p><b>Reservation code:</b> ${reservationCode}</p>
          <p><b>Hotel:</b> ${hotelName}</p>
          <p><b>Destination:</b> ${clean(body.destination)}</p>
          <p><b>Dates:</b> ${clean(body.checkin)} to ${clean(body.checkout)}</p>
          <p>Your reservation request has been received.</p>
        `,
      });
    }

    if (stripe && body.live_rate && body.rate_key && amount > 0) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: customerEmail || undefined,
        success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${encodeURIComponent(
          reservationCode
        )}`,
        cancel_url: PUBLIC_FRONTEND_URL,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Math.round(amount * 100),
              product_data: {
                name: hotelName || "Hotel reservation",
              },
            },
          },
        ],
      });

      return res.json({
        ok: true,
        reservation_code: reservationCode,
        payment_url: session.url,
      });
    }

    return res.json({
      ok: true,
      reservation_code: reservationCode,
      message: "Reservation request submitted successfully.",
    });
  } catch (e) {
    console.log(e);

    res.status(500).json({
      ok: false,
      message: "Reservation failed.",
    });
  }
});

app.post("/reservation/:code/mark-paid", (req, res) => {
  res.json({
    ok: true,
    reservation_code: clean(req.params.code),
  });
});

console.log("Real hotels:", allHotels.length);
console.log("Live-rate hotels:", liveHotels.length);
console.log("Supplier hotels:", supplierHotels.length);
console.log("Countries:", countryObjects.length);
console.log("Cities:", countryObjects.reduce((s, x) => s + x.cities.length, 0));
console.log("Stripe enabled:", Boolean(stripe));
console.log("SMTP enabled:", Boolean(transporter));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MySpace Hotel backend running on port ${PORT}`);
});