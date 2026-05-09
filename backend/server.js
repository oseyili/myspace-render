require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const app = express();

const PORT = 5050;

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const PUBLIC_FRONTEND_URL = process.env.PUBLIC_FRONTEND_URL || "http://localhost:5173";

let stripe = null;

try {
  if (STRIPE_SECRET_KEY) {
    stripe = require("stripe")(STRIPE_SECRET_KEY);
  }
} catch {}

app.use(cors());
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

    return [];
  } catch (e) {
    console.log("JSON ERROR:", name, e.message);
    return [];
  }
}

const LIVE_RATES = [
  ...readJson("hotel_live_rates_seed.json"),
  ...readJson("hotel_live_rates_london_seed.json")
];

const IMAGE_RECORDS = readJson("hotel_images_live_backup.json");

const SUPPLIER_HOTELS = readJson("hotel_supplier_feed.json");

const imageMap = new Map();

for (const img of IMAGE_RECORDS) {
  const code = clean(img.hotel_code);

  if (code && img.image_url) {
    imageMap.set(code, img.image_url);
  }
}

const liveHotels = [];

for (const r of LIVE_RATES) {
  const code = clean(r.hotel_code);

  liveHotels.push({
    id: code,
    hotel_id: code,
    hotel_name: clean(r.hotel_name),
    country: clean(r.country || ""),
    city: clean(r.city || ""),
    area: clean(r.zone_name || ""),
    image_url: imageMap.get(code) || "",
    latitude: r.latitude || "",
    longitude: r.longitude || "",
    room_name: clean(r.room_name),
    board_name: clean(r.board_name),
    payment_type: clean(r.payment_type),
    currency: clean(r.currency || "GBP"),
    amount: money(r.selling_rate || r.net || r.amount),
    rate_key: clean(r.rate_key),
    live_rate: true
  });
}

const supplierHotels = [];

for (const h of SUPPLIER_HOTELS) {
  supplierHotels.push({
    id: clean(h.supplier_hotel_id),
    hotel_id: clean(h.supplier_hotel_id),
    hotel_name: clean(h.name),
    country: clean(h.country),
    city: clean(h.city),
    address: clean(h.address),
    image_url: clean(h.image),
    live_rate: false
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

const countries = [...countriesMap.entries()]
  .map(([country, cities]) => ({
    country,
    cities: [...cities].sort((a, b) => a.localeCompare(b))
  }))
  .sort((a, b) => a.country.localeCompare(b.country));

const transporter =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      })
    : null;

function makeCode() {
  return `MSH-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    hotels: allHotels.length,
    live_rate_hotels: liveHotels.length,
    supplier_hotels: supplierHotels.length,
    countries: countries.length,
    cities: countries.reduce((s, x) => s + x.cities.length, 0),
    stripe: Boolean(stripe),
    smtp: Boolean(transporter)
  });
});

app.get("/api/countries", (req, res) => {
  res.json({
    ok: true,
    countries
  });
});

app.get("/api/hotels/search", (req, res) => {
  const country = clean(req.query.country).toLowerCase();
  const city = clean(req.query.city).toLowerCase();
  const area = clean(req.query.area).toLowerCase();
  const keyword = clean(req.query.keyword).toLowerCase();

  const results = allHotels
    .filter((h) => {
      if (country && clean(h.country).toLowerCase() !== country) return false;
      if (city && clean(h.city).toLowerCase() !== city) return false;

      const text = [
        h.hotel_name,
        h.area,
        h.address,
        h.city,
        h.country
      ]
        .join(" ")
        .toLowerCase();

      if (area && !text.includes(area)) return false;
      if (keyword && !text.includes(keyword)) return false;

      return true;
    })
    .slice(0, 500);

  res.json({
    ok: true,
    hotels: results
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
          <p>Your reservation request has been received.</p>
        `
      });
    }

    if (
      stripe &&
      body.live_rate &&
      body.rate_key &&
      amount > 0
    ) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: customerEmail,
        success_url: `${PUBLIC_FRONTEND_URL}/reservation-confirmed?code=${reservationCode}`,
        cancel_url: `${PUBLIC_FRONTEND_URL}`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Math.round(amount * 100),
              product_data: {
                name: hotelName
              }
            }
          }
        ]
      });

      return res.json({
        ok: true,
        reservation_code: reservationCode,
        payment_url: session.url
      });
    }

    return res.json({
      ok: true,
      reservation_code: reservationCode,
      message: "Reservation request submitted successfully."
    });
  } catch (e) {
    console.log(e);

    res.status(500).json({
      ok: false,
      message: "Reservation failed."
    });
  }
});

console.log("Real hotels:", allHotels.length);
console.log("Live-rate hotels:", liveHotels.length);
console.log("Supplier hotels:", supplierHotels.length);
console.log("Countries:", countries.length);
console.log("Cities:", countries.reduce((s, x) => s + x.cities.length, 0));
console.log("Stripe enabled:", Boolean(stripe));
console.log("SMTP enabled:", Boolean(transporter));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`MySpace Hotel backend running on http://127.0.0.1:${PORT}`);
});
