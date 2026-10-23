const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URLSearchParams } = require("url");

try {
  require("dotenv").config();
} catch {}

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {}

const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowed = new Set([
    "https://www.myspace-hotel.com",
    "https://myspace-hotel.com",
    "https://hotel-frontend-vlwa.onrender.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]);

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") return res.status(204).end();
  return next();
});

const PORT = process.env.PORT || 5050;

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowedOrigins = new Set([
    "https://www.myspace-hotel.com",
    "https://myspace-hotel.com",
    "https://hotel-frontend-vlwa.onrender.com",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]);

  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

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

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const HOTELS_FILE = path.join(DATA_DIR, "live_hotels.json");
const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const PARTNERS_FILE = path.join(DATA_DIR, "partner_applications.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.json");
const SERVICE_ACTIVITY_FILE = path.join(DATA_DIR, "service_activity.json");
const SUPPLIER_AUDIT_FILE = path.join(DATA_DIR, "supplier_rate_audit.json");


if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// MSH CHUNKS LOADER START
(function loadChunks() {
    // Cross-platform path resolution
    const chunksDir = path.join(__dirname, "..", "data", "chunks");
    if (fs.existsSync(chunksDir)) {
        const chunkFiles = fs.readdirSync(chunksDir).filter(f => f.endsWith(".json"));
        let loadedCount = 0;
        global.mshChunkCache = {};
        global.mshCityIndex = {}; // FAST CITY INDEX
        
        for (const file of chunkFiles) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(chunksDir, file), "utf8"));
                for (const [key, hotel] of Object.entries(data)) {
                    if (!global.mshChunkCache[key]) {
                        global.mshChunkCache[key] = hotel;
                        loadedCount++;
                        
                        // BUILD THE FAST CITY INDEX
                        const c = mshCityNorm(hotel.city || hotel.destination || "");
                        if (c) {
                            if (!global.mshCityIndex[c]) global.mshCityIndex[c] = [];
                            global.mshCityIndex[c].push(hotel);
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to load chunk " + file + ": " + e.message);
            }
        }
        console.log("[Chunks] Loaded " + loadedCount + " additional hotels.");
        console.log("[Chunks] Indexed " + Object.keys(global.mshCityIndex).length + " cities.");
    }
})();
// MSH CHUNKS LOADER END


function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
}

ensureFile(BOOKINGS_FILE, []);
ensureFile(PARTNERS_FILE, []);
ensureFile(FEEDBACK_FILE, []);
ensureFile(SERVICE_ACTIVITY_FILE, []);
ensureFile(SUPPLIER_AUDIT_FILE, []);

function readJSON(file, fallback = []) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed;
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

// MSH CUSTOMER CITY CLEANUP + HOTEL SEARCH MATCHING START
function mshCityNorm(v) {
  return clean(v).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function mshTitleCity(v) {
  return clean(v)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.length <= 2 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function mshCanonicalCountry(v) {
  const n = mshCityNorm(v);
  if (["uk", "gb", "great britain", "england", "scotland", "wales", "northern ireland"].includes(n)) return "united kingdom";
  return n;
}

function mshCanonicalCity(v, country = "") {
  let raw = clean(v);
  if (!raw) return "";
  raw = raw.replace(/\s+/g, " ").trim();
  let n = mshCityNorm(raw);
  const c = mshCanonicalCountry(country);

  if (c === "united kingdom") {
    const londonAreas = [
      "westminster", "city of westminster", "kensington", "chelsea", "paddington", "bayswater",
      "mayfair", "soho", "covent garden", "bloomsbury", "marylebone", "canary wharf", "docklands",
      "camden", "hammersmith", "fulham", "greenwich", "islington", "shoreditch", "stratford",
      "victoria", "king cross", "kings cross", "st pancras", "heathrow", "wembley", "croydon"
    ];
    if (n === "london" || n === "greater london" || n === "city of london" || n === "central london") return "London";
    if (n.includes("london") || londonAreas.some((area) => n === area || n.includes(area))) return "London";
    if (n === "liverpool" || n === "liverpool city centre" || n === "liverpool merseyside" || n === "liverpool cheshire") return "Liverpool";
    if (n.includes("liverpool")) return "Liverpool";
    if (n === "manchester" || n === "manchester city centre" || n === "greater manchester") return "Manchester";
    if (n.includes("manchester")) return "Manchester";
    if (n === "birmingham" || n === "birmingham city centre" || n === "west midlands") return "Birmingham";
    if (n.includes("birmingham")) return "Birmingham";
    if (n === "edinburgh" || n === "edinburgh city centre") return "Edinburgh";
    if (n.includes("edinburgh")) return "Edinburgh";
    if (n === "glasgow" || n === "glasgow city centre") return "Glasgow";
    if (n.includes("glasgow")) return "Glasgow";
  }

  if (c === "canada") {
    if (["coquitlam", "burnaby", "richmond", "surrey", "north vancouver", "west vancouver", "new westminster", "delta", "langley", "abbotsford"].includes(n)) return "Vancouver";
    if (n.includes("vancouver")) return "Vancouver";
    if (["mississauga", "brampton", "markham", "scarborough", "north york", "etobicoke", "vaughan"].includes(n)) return "Toronto";
    if (n.includes("toronto")) return "Toronto";
    if (n.includes("montreal") || n.includes("montrÃ©al")) return "Montreal";
    if (n.includes("calgary")) return "Calgary";
    if (n.includes("ottawa")) return "Ottawa";
  }

  if (c === "bahamas") {
    if (n.includes("nassau") || n.includes("paradise island")) return "Nassau";
  }

  if (c === "united states") {
    if (n.includes("new york") || n === "manhattan" || n === "brooklyn" || n === "queens") return "New York";
    if (n.includes("los angeles") || n === "hollywood" || n === "santa monica" || n === "beverly hills") return "Los Angeles";
    if (n.includes("las vegas")) return "Las Vegas";
    if (n.includes("miami")) return "Miami";
    if (n.includes("orlando")) return "Orlando";
  }

  if (c === "united arab emirates") {
    if (n.includes("dubai")) return "Dubai";
    if (n.includes("abu dhabi")) return "Abu Dhabi";
  }

  if (raw.includes(" - ")) raw = raw.split(" - ")[0];
  if (raw.includes(",")) raw = raw.split(",")[0];
  raw = raw.replace(/\b(city centre|city center|centre|center|downtown|central)\b/ig, "").replace(/\s+/g, " ").trim();
  return mshTitleCity(raw);
}

function mshSameCountryForCustomer(actual, wanted) {
  const a = mshCanonicalCountry(actual);
  const b = mshCanonicalCountry(wanted);
  if (!a || !b) return true;
  return a === b;
}

function mshSameCityForCustomer(actual, wanted, country = "") {
  const a = mshCityNorm(mshCanonicalCity(actual, country));
  const b = mshCityNorm(mshCanonicalCity(wanted, country));
  if (!a || !b) return true;
  return a === b;
}

const MSH_PUBLIC_CITY_LISTS = {
  "united kingdom": ["London", "Manchester", "Birmingham", "Liverpool", "Leeds", "Bristol", "Edinburgh", "Glasgow", "Cardiff", "Belfast", "Newcastle upon Tyne", "Sheffield", "Nottingham", "Leicester", "Southampton", "Brighton", "Oxford", "Cambridge", "York", "Bath", "Blackpool", "Bournemouth"],
  "canada": ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Quebec City", "Edmonton", "Winnipeg", "Halifax", "Victoria"],
  "united states": ["New York", "Los Angeles", "Las Vegas", "Miami", "Orlando", "Chicago", "San Francisco", "Washington", "Boston", "Seattle"],
  "united arab emirates": ["Dubai", "Abu Dhabi"],
  "france": ["Paris", "Nice", "Lyon", "Marseille"],
  "nigeria": ["Lagos", "Abuja"],
  "bahamas": ["Nassau"]
};

function mshPublicCityList(country, sourceCities = []) {
  const key = mshCanonicalCountry(country);
  const curated = MSH_PUBLIC_CITY_LISTS[key];
  if (Array.isArray(curated) && curated.length) return curated;

  const seen = new Set();
  return (sourceCities || [])
    .map((city) => mshCanonicalCity(city && (city.city || city.name || city.label) ? (city.city || city.name || city.label) : city, country))
    .filter((city) => {
      const n = mshCityNorm(city);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

function mshCustomerDestinationRows() {
  const existing = buildDestinations();
  const rows = [];
  const present = new Set();

  for (const row of existing) {
    const country = clean(row.country);
    if (!country) continue;
    present.add(mshCanonicalCountry(country));
    rows.push({ country, cities: mshPublicCityList(country, row.cities) });
  }

  const displayNames = {
    "united kingdom": "United Kingdom",
    "canada": "Canada",
    "united states": "United States",
    "united arab emirates": "United Arab Emirates",
    "france": "France",
    "nigeria": "Nigeria",
    "bahamas": "Bahamas"
  };

  for (const [normCountry, cities] of Object.entries(MSH_PUBLIC_CITY_LISTS)) {
    if (!present.has(normCountry)) rows.push({ country: displayNames[normCountry] || normCountry, cities });
  }

  return rows
    .filter((row) => row.country && Array.isArray(row.cities) && row.cities.length)
    .sort((a, b) => a.country.localeCompare(b.country));
}
// MSH CUSTOMER CITY CLEANUP + HOTEL SEARCH MATCHING END

function hotelOnlyText(h) {
  return lower([
    h && h.name, h && h.hotel_name, h && h.hotelName, h && h.property_name, h && h.title,
    h && h.propertyType, h && h.property_type, h && h.type, h && h.category,
    h && h.categoryName, h && h.accommodationType, h && h.accommodation_type, h && h.description
  ].filter(Boolean).join(" "));
}

function isStrictHotelOnly(h) {
  const text = hotelOnlyText(h);
  if (!text || /test|demo|placeholder|sample|fake|dummy/.test(text)) return false;

  const blocked = [
    "apartment", "apartments", "flat", "flats", "serviced apartment", "service apartment",
    "aparthotel", "apart hotel", "studio", "residence", "residences", "villa", "villas",
    "home", "house", "holiday home", "vacation rental", "condo", "penthouse", "loft",
    "private room", "shared room", "entire home", "entire place", "hostel", "camp", "caravan",
    "farm stay", "cottage", "guest house", "guesthouse", "b&b", "bed and breakfast",
    "long stay", "long-stay", "monthly", "rental", "for rent", "for sale"
  ];

  if (blocked.some((word) => text.includes(word))) return false;

  const allowed = [
    "hotel", "inn", "motel", "hotel suites", "suite hotel", "premier inn", "holiday inn",
    "travelodge", "marriott", "hilton", "hyatt", "radisson", "novotel", "ibis",
    "mercure", "sheraton", "doubletree", "crowne plaza", "intercontinental",
    "fairmont", "ritz", "waldorf", "sofitel", "westin"
  ];

  return allowed.some((word) => text.includes(word));
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

function privateSupplierName(v) {
  const value = clean(v).toUpperCase();
  return value || "MYSPACE_INTERNAL";
}

function supplierCodeFromName(name) {
  return privateSupplierName(name)
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "MYSPACE_INTERNAL";
}

function makeSupplierRateId(parts) {
  const raw = [
    parts.supplier_name,
    parts.supplier_hotel_id,
    parts.hotel_id,
    parts.room_code,
    parts.price,
    parts.currency,
    parts.timestamp
  ].join("|");

  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24).toUpperCase();
}

function supplierMetaFromHotel(h, rate = null, requestedCurrency = "") {
  const supplierName = privateSupplierName(
    rate?.supplier_name ||
      rate?.supplier ||
      rate?.source ||
      rate?.provider ||
      h.supplier_name ||
      h.supplier ||
      h.source ||
      h.provider ||
      h.partner ||
      h.inventory_source ||
      "MYSPACE_INTERNAL"
  );

  const supplierCode = clean(
    rate?.supplier_code ||
      rate?.source_code ||
      h.supplier_code ||
      h.source_code ||
      supplierCodeFromName(supplierName)
  );

  const supplierHotelId = clean(
    rate?.supplier_hotel_id ||
      rate?.supplierHotelId ||
      rate?.hotel_supplier_id ||
      rate?.hotel_code ||
      h.supplier_hotel_id ||
      h.supplierHotelId ||
      h.hotel_supplier_id ||
      h.hotel_code ||
      h.code ||
      h.hotel_id ||
      h.hotelId ||
      h.id
  );

  const supplierRateKey = clean(
    rate?.supplier_rate_id ||
      rate?.supplierRateId ||
      rate?.rate_key ||
      rate?.rateKey ||
      rate?.rate_id ||
      rate?.rateId ||
      rate?.room_code ||
      rate?.roomCode ||
      ""
  );

  const currency = clean(requestedCurrency || rate?.currency || h.currency || "GBP").toUpperCase();
  const price = money(rate?.nightly_rate || rate?.amount || rate?.price || h.price || h.amount || h.nightly_rate || 0);
  const timestamp = clean(rate?.rate_source_timestamp || rate?.updated_at || rate?.created_at || h.rate_source_timestamp || h.updated_at || h.created_at || nowISO());

  return {
    supplier_name: supplierName,
    supplier_code: supplierCode || supplierCodeFromName(supplierName),
    supplier_hotel_id: supplierHotelId,
    supplier_rate_key: supplierRateKey,
    supplier_rate_id: makeSupplierRateId({
      supplier_name: supplierName,
      supplier_hotel_id: supplierHotelId,
      hotel_id: clean(h.hotel_id || h.hotelId || h.id || h.code || h.hotel_code),
      room_code: supplierRateKey,
      price,
      currency,
      timestamp
    }),
    supplier_currency: currency,
    supplier_price: price,
    rate_source_timestamp: timestamp
  };
}

function publicRateSource(meta) {
  return {
    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",
    price_trace_available: true
  };
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
  writeJSON(SERVICE_ACTIVITY_FILE, logs.slice(0, 3000));
}

function recordSupplierAudit(action, payload) {
  const rows = readJSON(SUPPLIER_AUDIT_FILE, []);
  rows.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    action,
    ...payload
  });
  writeJSON(SUPPLIER_AUDIT_FILE, rows.slice(0, 10000));
}

function mailTo() {
  return clean(process.env.MAIL_TO || "reservations@myspace-hotel.com");
}

function mailFrom() {
  return clean(
    process.env.MAIL_FROM ||
      process.env.SMTP_FROM ||
      process.env.RESEND_FROM ||
      "MySpace Hotel <reservations@myspace-hotel.com>"
  );
}

function htmlEscape(v) {
  return clean(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildEmailHtml(title, rows) {
  const body = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#0b1d51;width:210px;">${htmlEscape(label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">${htmlEscape(value)}</td>
        </tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;">
      <div style="max-width:760px;margin:auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dbe4f0;">
        <div style="background:#0b1d51;color:#ffffff;padding:22px 26px;">
          <div style="font-size:26px;font-weight:900;">MYSPACE HOTEL</div>
          <div style="font-size:15px;margin-top:6px;">${htmlEscape(title)}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:15px;">
          ${body}
        </table>
        <div style="padding:18px 26px;color:#64748b;font-size:13px;">
          Sent automatically from MySpace Hotel booking platform.
        </div>
      </div>
    </div>`;
}

async function sendEmailNotification(subject, rows) {
  const to = mailTo();
  const from = mailFrom();
  const html = buildEmailHtml(subject, rows);
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  if (!to) {
    recordActivity("email_skipped", { subject }, { reason: "MAIL_TO missing" });
    return { ok: false, skipped: true, reason: "MAIL_TO missing" };
  }

  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ from, to, subject, html, text })
      });

      const data = await res.json().catch(() => ({}));
      recordActivity("email_resend", { subject, to }, { ok: res.ok, status: res.status, data });
      return { ok: res.ok, provider: "resend", status: res.status, data };
    } catch (err) {
      recordActivity("email_resend_error", { subject, to }, { error: err.message, stack: err.stack });
      return { ok: false, provider: "resend", error: err.message, stack: err.stack };
    }
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && nodemailer) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      const info = await transporter.sendMail({ from, to, subject, html, text });
      recordActivity("email_smtp", { subject, to }, { ok: true, messageId: info.messageId });
      return { ok: true, provider: "smtp", messageId: info.messageId };
    } catch (err) {
      recordActivity("email_smtp_error", { subject, to }, { error: err.message, stack: err.stack });
      return { ok: false, provider: "smtp", error: err.message, stack: err.stack };
    }
  }

  recordActivity("email_skipped", { subject, to }, { reason: "No RESEND_API_KEY or SMTP configuration available" });
  return { ok: false, skipped: true, reason: "No email provider configured" };
}

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

function isBlockedCountry(country) {
  return SANCTIONED_COUNTRIES.has(clean(country));
}

function readHotels() {
  const hotels = readJSON(HOTELS_FILE, []);
  const baseHotels = Array.isArray(hotels) ? hotels : [];
  
  // MSH READ HOTELS PATCHED
  if (global.mshChunkCache) {
      const chunkHotels = Object.values(global.mshChunkCache);
      return [...baseHotels, ...chunkHotels];
  }
  return baseHotels;
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

function normalizeRoomRate(r, h, index, amount, currency) {
  const meta = supplierMetaFromHotel(h, r, currency);

  return {
    roomCode: clean(r.rate_id || r.rate_key || r.room_code || meta.supplier_rate_key || `ROOM-${index + 1}`),
    roomName: clean(r.room_name || r.roomName || r.rate_name || "Available room"),
    board: clean(r.board_name || r.board || r.rate_name || "Room only"),
    price: money(r.nightly_rate || r.amount || r.price || amount),
    convertedPrice: money(r.nightly_rate || r.amount || r.price || amount),
    displayCurrency: clean(r.currency || currency).toUpperCase(),
    cancellation: clean(r.cancellation || "Cancellation information is shown before you complete your booking."),
    taxes: clean(r.taxes || "Applicable taxes and fees are shown before you complete your booking."),

    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",

    _supplier_name: meta.supplier_name,
    _supplier_code: meta.supplier_code,
    _supplier_hotel_id: meta.supplier_hotel_id,
    _supplier_rate_id: meta.supplier_rate_id,
    _supplier_rate_key: meta.supplier_rate_key,
    _supplier_currency: meta.supplier_currency,
    _supplier_price: meta.supplier_price
  };
}

function normalizeHotel(h, requestedCurrency = "") {
  const rates = Array.isArray(h.rates) ? h.rates : [];
  const firstRate = rates.find((r) => number(r.nightly_rate || r.amount || r.price) > 0) || null;
  const meta = supplierMetaFromHotel(h, firstRate, requestedCurrency);

  const amount = firstRate
    ? money(firstRate.nightly_rate || firstRate.amount || firstRate.price)
    : money(h.price || h.amount || h.nightly_rate || 0);

  const currency = clean(requestedCurrency || firstRate?.currency || h.currency || "GBP").toUpperCase();
  const hotelId = clean(h.hotel_id || h.hotelId || h.id || h.code || h.hotel_code || meta.supplier_hotel_id);

  const rooms = rates.length
    ? rates.slice(0, 8).map((r, index) => normalizeRoomRate(r, h, index, amount, currency))
    : [
        {
          roomCode: "STANDARD",
          roomName: "Available room",
          board: "Room only",
          price: amount,
          convertedPrice: amount,
          displayCurrency: currency,
          cancellation: "Cancellation information is shown before you complete your booking.",
          taxes: "Applicable taxes and fees are shown before you complete your booking.",
          ...publicRateSource(meta),
          _supplier_name: meta.supplier_name,
          _supplier_code: meta.supplier_code,
          _supplier_hotel_id: meta.supplier_hotel_id,
          _supplier_rate_id: meta.supplier_rate_id,
          _supplier_rate_key: meta.supplier_rate_key,
          _supplier_currency: meta.supplier_currency,
          _supplier_price: meta.supplier_price
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
    rooms,
    availableToBook: amount > 0,
    price: amount,
    currency,
    rate_source_id: meta.supplier_rate_id,
    rate_source_timestamp: meta.rate_source_timestamp,
    source_health: "verified",

    _supplier_name: meta.supplier_name,
    _supplier_code: meta.supplier_code,
    _supplier_hotel_id: meta.supplier_hotel_id,
    _supplier_rate_id: meta.supplier_rate_id,
    _supplier_rate_key: meta.supplier_rate_key,
    _supplier_currency: meta.supplier_currency,
    _supplier_price: meta.supplier_price
  };
}

function publicHotel(h) {
  const rooms = Array.isArray(h.rooms)
    ? h.rooms.map((room) => ({
        roomCode: room.roomCode,
        roomName: room.roomName,
        board: room.board,
        price: room.price,
        convertedPrice: room.convertedPrice,
        displayCurrency: room.displayCurrency,
        cancellation: room.cancellation,
        taxes: room.taxes,
        rate_source_id: room.rate_source_id,
        rate_source_timestamp: room.rate_source_timestamp,
        source_health: room.source_health
      }))
    : [];

  return {
    hotelId: h.hotelId,
    hotel_id: h.hotel_id,
    name: h.name,
    hotel_name: h.hotel_name,
    country: h.country,
    city: h.city,
    area: h.area,
    address: h.address,
    stars: h.stars,
    image: h.image,
    facilities: h.facilities,
    rooms,
    availableToBook: h.availableToBook,
    price: h.price,
    currency: h.currency,
    rate_source_id: h.rate_source_id,
    rate_source_timestamp: h.rate_source_timestamp,
    source_health: h.source_health
  };
}

function buildDestinations() {
  const map = new Map();

  for (const h of readHotels()) {
    const country = clean(h.country);
    const city = clean(h.city);

    if (!country || !city) continue;
    if (isBlockedCountry(country)) continue;

    if (!map.has(country)) map.set(country, new Set());
    map.get(country).add(city);
  }

  return [...map.entries()]
    .map(([country, citySet]) => ({
      country,
      cities: [...citySet].sort((a, b) => a.localeCompare(b))
    }))
    .sort((a, b) => a.country.localeCompare(b.country));
}

function internalSearchHotels(query) {
  const country = clean(query.country);
  const city = clean(query.city);
  const currency = clean(query.currency || "GBP").toUpperCase();

  // FAST CITY INDEX with LOOSE MATCHING for districts and neighbourhoods
  let sourceHotels = [];
  const cityKey = mshCityNorm(city);
  
  if (cityKey && global.mshCityIndex) {
    // 1. Exact match first (fastest)
    if (global.mshCityIndex[cityKey]) {
      sourceHotels = global.mshCityIndex[cityKey];
    } else {
      // 2. Loose match for districts/neighbourhoods
      // e.g. "sao pedro" will match "sao pedro" inside "lisbon sao pedro"
      for (const [key, bucket] of Object.entries(global.mshCityIndex)) {
        if (key.includes(cityKey) || cityKey.includes(key)) {
          sourceHotels.push(...bucket);
        }
      }
      // 3. If no loose match, fall back to all hotels
      if (!sourceHotels.length) sourceHotels = readHotels();
    }
  } else {
    sourceHotels = readHotels();
  }

  let hotels = sourceHotels
    .filter((h) => !isBlockedCountry(h.country))
    .filter((h) => !country || mshSameCountryForCustomer(h.country, country))
    // Loosen the city filter too so district searches work
    .filter((h) => !city || mshSameCityForCustomer(h.city, city, country || h.country) || 
                    (city && h.city && mshCityNorm(h.city).includes(mshCityNorm(city))))
    .filter((h) => isStrictHotelOnly(h))
    .map((h) => normalizeHotel({ ...h, city: mshCanonicalCity(h.city, h.country) || h.city }, currency))
    .filter((h) => h.name && h.country && h.city);

  hotels.sort((a, b) => {
    if (b.availableToBook !== a.availableToBook) return Number(b.availableToBook) - Number(a.availableToBook);
    return a.name.localeCompare(b.name);
  });

  const limit = Math.max(1, Math.min(number(query.limit || 25), 300));
  const offset = Math.max(0, number(query.offset || 0));

  return hotels.slice(offset, offset + limit);
}

function searchHotels(query) {
  return internalSearchHotels(query).map(publicHotel);
}

function findInternalOffer(payload) {
  const hotelId = clean(payload.hotelId || payload.hotel_id);
  const rateSourceId = clean(payload.rate_source_id || payload.rateSourceId || payload.supplier_rate_id);
  const roomCode = clean(payload.roomCode || payload.room_code);

  const hotels = internalSearchHotels({
    country: payload.country,
    city: payload.city,
    currency: payload.currency
  });

  let hotel =
    hotels.find((h) => clean(h.hotelId) === hotelId || clean(h.hotel_id) === hotelId) ||
    hotels.find((h) => clean(h.rate_source_id) === rateSourceId) ||
    hotels[0];

  if (!hotel) {
    return { hotel: null, room: null };
  }

  let room =
    (hotel.rooms || []).find((r) => clean(r.rate_source_id) === rateSourceId) ||
    (hotel.rooms || []).find((r) => clean(r.roomCode) === roomCode) ||
    (hotel.rooms || [])[0];

  if (!room) room = (hotel.rooms || [])[0] || null;

  return { hotel, room };
}

function getBaseUrl(req) {
  const envBase =
    process.env.FRONTEND_URL ||
    process.env.CLIENT_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "";

  if (envBase) return envBase.replace(/\/$/, "");
  if (req.headers.origin) return String(req.headers.origin).replace(/\/$/, "");
  return "http://localhost:5173";
}

function stripeCurrency(currency) {
  return clean(currency || "GBP").toLowerCase();
}

function stripeAmount(amount) {
  const n = number(amount);
  const safe = n > 0 ? n : 1;
  return Math.max(50, Math.round(safe * 100));
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
      body.append("metadata[rate_source_id]", clean(req.body.rate_source_id || ""));
      body.append("metadata[supplier_code]", clean(req.body.supplier_code || ""));

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
      return res.json({
        ok: true,
        url: paymentLink,
        bookingRef,
        message: "Secure payment is ready."
      });
    }

    return res.status(400).json({
      ok: false,
      message: "Stripe is not configured yet. Add STRIPE_SECRET_KEY to your environment."
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
    hotelsAvailable: readHotels().length,
    destinationCountries: destinations.length,
    destinationCities: destinations.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    supplierAuditRecords: readJSON(SUPPLIER_AUDIT_FILE, []).length,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    mailReady: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)),
    mailTo: mailTo(),
    timestamp: nowISO()
  });
});


app.get("/api/cache-stats", (req, res) => {
  const countryMap = new Map();

  if (global.mshChunkCache) {
    for (const hotel of Object.values(global.mshChunkCache)) {
      const country = clean(hotel.country || "Unknown");
      const city = clean(hotel.city || hotel.destination || "Unknown");
      if (!countryMap.has(country)) countryMap.set(country, new Map());
      const cityMap = countryMap.get(country);
      cityMap.set(city, (cityMap.get(city) || 0) + 1);
    }
  }

  const table = [];
  for (const [country, cityMap] of countryMap) {
    for (const [city, count] of cityMap) {
      table.push({ country, city, hotels: count });
    }
  }

  table.sort((a, b) => {
    if (a.country !== b.country) return a.country.localeCompare(b.country);
    return b.hotels - a.hotels;
  });

  const totalCountries = countryMap.size;
  const totalCities = table.length;
  const totalHotels = table.reduce((sum, row) => sum + row.hotels, 0);

  res.json({
    ok: true,
    generated_at: nowISO(),
    totals: {
      hotels: totalHotels,
      countries: totalCountries,
      cities: totalCities
    },
    table
  });
});
app.get("/api/status", (req, res) => {
  const destinations = buildDestinations();
  res.json({
    ok: true,
    service: "MySpace Hotel",
    hotelsAvailable: readHotels().length,
    destinationCountries: destinations.length,
    destinationCities: destinations.reduce((sum, x) => sum + x.cities.length, 0),
    confirmedBookings: readJSON(BOOKINGS_FILE, []).length,
    supplierAuditRecords: readJSON(SUPPLIER_AUDIT_FILE, []).length,
    stripeReady: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PAYMENT_LINK),
    mailReady: Boolean(process.env.RESEND_API_KEY || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)),
    mailTo: mailTo(),
    timestamp: nowISO()
  });
});

app.get("/api/destinations", (req, res) => res.json(buildDestinations()));
app.get("/destinations", (req, res) => res.json(buildDestinations()));

app.get("/api/countries", (req, res) => {
  const countries = mshCustomerDestinationRows().map((row) => ({ ...row, cities: row.cities.map((city) => ({ city })) }));
  res.json({ ok: true, count: countries.length, countries });
});
app.get("/api/platform/v3/destinations", (req, res) => {
  const rows = buildDestinations();
  res.json({ ok: true, count: rows.length, destinations: rows.map((row) => ({ country: row.country, cities: row.cities })) });
});

app.get("/api/platform/v3/search", async (req, res) => {
  const country = clean(req.query.country || "");
  const city = clean(req.query.city || "");
  const currency = clean(req.query.currency || "GBP").toUpperCase();
  const checkIn = clean(req.query.checkIn || req.query.checkin || "");
  const checkOut = clean(req.query.checkOut || req.query.checkout || "");
  const guests = clean(req.query.guests || "2");
  const rooms = clean(req.query.rooms || "1");
  const limit = Math.max(1, Math.min(Number(req.query.limit || 300), 1000));

  try {
    const collected = [];

    if (typeof hotelbedsAvailabilitySearch === "function" && typeof hotelbedsConfig === "function" && hotelbedsConfig().ready) {
      const hb = await hotelbedsAvailabilitySearch({ country, city, currency, checkIn, checkOut, guests, rooms, limit }).catch(() => ({ hotels: [] }));
      const hbRows = Array.isArray(hb.hotels) ? hb.hotels : [];
      for (const h of hbRows) collected.push(h);
    }

    const seen = new Set();
    const hotels = collected.filter((h) => {
      if (!h || !h.name) return false;
      const key = clean(`${h.hotelId || h.hotel_id || h.name}|${h.city}|${h.country}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    hotels.sort((a, b) => {
      const ap = number(a.price || a.convertedPrice || a.displayPrice || 0);
      const bp = number(b.price || b.convertedPrice || b.displayPrice || 0);
      if (ap > 0 && bp <= 0) return -1;
      if (bp > 0 && ap <= 0) return 1;
      if (ap > 0 && bp > 0) return ap - bp;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

    res.json({
      ok: true,
      source: "platform_v3_search",
      count: hotels.length,
      totalAvailable: hotels.length,
      hotels,
      customerMessage: hotels.length ? "Hotels found for your search." : "We could not find available hotels for this destination right now. Please try another city or date."
    });
  } catch (err) {
    res.json({ ok: true, source: "platform_v3_search", count: 0, hotels: [], customerMessage: "We could not find available hotels for this destination right now. Please try another city or date." });
  }
});
app.get("/api/global-countries", (req, res) => {
  const countries = mshCustomerDestinationRows().map((row) => ({ ...row, cities: row.cities.map((city) => ({ city })) }));
  res.json({ ok: true, count: countries.length, countries });
});

// MSH CUSTOMER HOTEL SEARCH V2 START
function mshCustomerSearchV2Query(query) {
  const country = clean(query.country);
  const city = mshCanonicalCity(query.city, country);
  return { ...query, country, city };
}

function mshCustomerSearchV2Price(h) {
  const rooms = Array.isArray(h?.rooms) ? h.rooms : [];
  const firstRoom = rooms[0] || {};
  return number(h?.price || h?.convertedPrice || h?.displayPrice || h?.amount || h?.nightly_rate || firstRoom.price || firstRoom.convertedPrice || firstRoom.amount || 0);
}

function mshCustomerSearchV2Image(h) {
  return firstImage(h) || clean(h?.image || h?.image_url || h?.main_image || h?.photo || h?.thumbnail || "");
}

function mshCustomerSearchV2LocationOk(h, country, city) {
  const wantedCountry = clean(country);
  const wantedCity = mshCanonicalCity(city, wantedCountry);

  if (wantedCountry && !mshSameCountryForCustomer(h.country, wantedCountry)) return false;
  if (!wantedCity) return true;

  const wanted = mshCityNorm(wantedCity);
  const primaryFields = [
    h.city,
    h.cityName,
    h.destination,
    h.location && h.location.city
  ].filter(Boolean);

  const fieldsToCheck = primaryFields.length
    ? primaryFields
    : [h.area, h.address, h.region, h.zone, h.location && h.location.address].filter(Boolean);

  for (const field of fieldsToCheck) {
    const canon = mshCityNorm(mshCanonicalCity(field, wantedCountry));
    if (canon && canon === wanted) return true;
  }

  return false;
}

function mshCustomerSearchV2PublicFromRaw(query, limit, offset) {
  const q = mshCustomerSearchV2Query(query);
  const currency = clean(q.currency || "GBP").toUpperCase();
  const wantedCity = mshCanonicalCity(q.city, q.country);
  const seen = new Set();

  const rows = readHotels()
    .filter((hotel) => !isBlockedCountry(hotel.country))
    .filter((hotel) => isStrictHotelOnly(hotel))
    .filter((hotel) => mshCustomerSearchV2LocationOk(hotel, q.country, wantedCity))
    .map((hotel) => normalizeHotel({ ...hotel, country: clean(hotel.country || q.country), city: wantedCity || clean(hotel.city) }, currency))
    .filter((hotel) => hotel && hotel.name && hotel.country && hotel.city)
    .filter((hotel) => {
      const key = lower(`${hotel.hotelId || hotel.hotel_id || hotel.name}|${hotel.city}|${hotel.country}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const ap = mshCustomerSearchV2Price(a);
      const bp = mshCustomerSearchV2Price(b);
      const ai = mshCustomerSearchV2Image(a) ? 1 : 0;
      const bi = mshCustomerSearchV2Image(b) ? 1 : 0;
      if (bp > 0 && ap <= 0) return 1;
      if (ap > 0 && bp <= 0) return -1;
      if (bi !== ai) return bi - ai;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });

  return rows.slice(offset, offset + limit).map(publicHotel);
}

function mshCustomerSearchV2TotalAvailable(query) {
  const q = mshCustomerSearchV2Query(query);
  const wantedCity = mshCanonicalCity(q.city, q.country);
  const seen = new Set();
  let total = 0;

  for (const hotel of readHotels()) {
    if (isBlockedCountry(hotel.country)) continue;
    if (!isStrictHotelOnly(hotel)) continue;
    if (!mshCustomerSearchV2LocationOk(hotel, q.country, wantedCity)) continue;
    const key = lower(`${hotel.hotel_id || hotel.hotelId || hotel.id || hotel.code || hotel.name}|${mshCanonicalCity(hotel.city, hotel.country)}|${hotel.country}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    total += 1;
  }

  return total;
}

app.get("/api/customer-hotel-search-v2", async (req, res) => {
  const q = mshCustomerSearchV2Query(req.query || {});
  const limit = Math.max(1, Math.min(number(q.limit || 60), 1000));
  const offset = Math.max(0, number(q.offset || 0));
  const currency = clean(q.currency || "GBP").toUpperCase();

  const totalAvailable = mshCustomerSearchV2TotalAvailable({ ...q, currency });
  const hotels = mshCustomerSearchV2PublicFromRaw({ ...q, currency }, limit, offset);

  res.json({
    ok: true,
    source: "myspace_full_catalogue_hotel_search",
    mode: "hotel_only_catalogue_first",
    count: hotels.length,
    totalAvailable,
    offset,
    limit,
    hasMore: offset + hotels.length < totalAvailable,
    country: q.country,
    city: q.city,
    hotels,
    customerMessage: hotels.length ? "Hotels found for your search." : "We could not find available hotels for this destination right now. Please try another city or date."
  });
});
// MSH CUSTOMER HOTEL SEARCH V2 END

app.get("/api/hotels/search", (req, res) => {
  const internalHotels = internalSearchHotels(req.query);
  const hotels = internalHotels.map(publicHotel);

  recordActivity("hotel_search", req.query, { count: hotels.length });

  for (const h of internalHotels.slice(0, 25)) {
    recordSupplierAudit("rate_returned_to_search", {
      hotelId: h.hotelId,
      hotelName: h.name,
      country: h.country,
      city: h.city,
      supplier_name: h._supplier_name,
      supplier_code: h._supplier_code,
      supplier_hotel_id: h._supplier_hotel_id,
      supplier_rate_id: h._supplier_rate_id,
      price: h.price,
      currency: h.currency,
      rate_source_timestamp: h.rate_source_timestamp
    });
  }

  res.json({ ok: true, hotels, count: hotels.length, country: clean(req.query.country), city: clean(req.query.city) });
});

app.get("/search", (req, res) => {
  const internalHotels = internalSearchHotels(req.query);
  const hotels = internalHotels.map(publicHotel);
  res.json({ ok: true, hotels, count: hotels.length });
});

app.post("/api/prebook", (req, res) => {
  const { hotel, room } = findInternalOffer(req.body);

  const response = {
    ok: true,
    reviewReference: makeRef("REVIEW"),
    hotelId: hotel.hotelId,
    hotelName: hotel.name,
    roomCode: room.roomCode,
    roomName: room.roomName,
    board: room.board,
    cancellationPolicy: room.cancellation,
    taxesAndFees: room.taxes,
    amount: room.convertedPrice || room.price,
    currency: room.displayCurrency || clean(req.body.currency || "GBP").toUpperCase(),
    rate_source_id: room.rate_source_id || hotel.rate_source_id,
    rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
    source_health: "verified",
    expiresInSeconds: 900,
    message: "Your room details are ready to review before booking."
  };

  recordSupplierAudit("prebook_rate_review", {
    reviewReference: response.reviewReference,
    hotelId: hotel.hotelId,
    hotelName: hotel.name,
    roomCode: room.roomCode,
    supplier_name: room._supplier_name || hotel._supplier_name,
    supplier_code: room._supplier_code || hotel._supplier_code,
    supplier_hotel_id: room._supplier_hotel_id || hotel._supplier_hotel_id,
    supplier_rate_id: room._supplier_rate_id || hotel._supplier_rate_id,
    supplier_rate_key: room._supplier_rate_key || hotel._supplier_rate_key,
    price: response.amount,
    currency: response.currency,
    rate_source_timestamp: response.rate_source_timestamp
  });

  recordActivity("booking_review", req.body, response);
  res.json(response);
});

// MSH SUPPLIER TRACKING OVERRIDE START
function mshAuditFile() {
  return typeof SUPPLIER_AUDIT_FILE !== "undefined"
    ? SUPPLIER_AUDIT_FILE
    : path.join(DATA_DIR, "supplier_rate_audit.json");
}

function mshSupplierDefault() {
  return clean(process.env.DEFAULT_SUPPLIER_NAME || "HOTELBEDS").toUpperCase() || "HOTELBEDS";
}

function mshSupplierCode(name) {
  return clean(name || mshSupplierDefault()).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "HOTELBEDS";
}

function mshAppendSupplierAudit(action, payload) {
  const file = mshAuditFile();
  ensureFile(file, []);
  const rows = readJSON(file, []);
  rows.unshift({
    id: crypto.randomUUID(),
    created_at: nowISO(),
    action,
    ...payload
  });
  writeJSON(file, rows.slice(0, 10000));
}

function mshFindPublicOffer(payload) {
  const hotelId = clean(payload.hotelId || payload.hotel_id);
  const rateSourceId = clean(payload.rate_source_id || payload.rateSourceId);
  const roomCode = clean(payload.roomCode || payload.room_code);

  const offers = searchHotels({
    country: payload.country,
    city: payload.city,
    currency: payload.currency || "GBP"
  });

  const hotel =
    offers.find((h) => clean(h.hotelId) === hotelId || clean(h.hotel_id) === hotelId) ||
    offers.find((h) => clean(h.rate_source_id) === rateSourceId) ||
    offers[0] ||
    {};

  const rooms = Array.isArray(hotel.rooms) ? hotel.rooms : [];
  const room =
    rooms.find((r) => clean(r.rate_source_id) === rateSourceId) ||
    rooms.find((r) => clean(r.roomCode) === roomCode) ||
    rooms[0] ||
    {};

  return { hotel, room };
}

function mshSupplierTrackingFromPayload(payload) {
  const found = mshFindPublicOffer(payload);
  const hotel = found.hotel || {};
  const room = found.room || {};

  const rateSourceId = clean(
    payload.rate_source_id ||
    payload.rateSourceId ||
    room.rate_source_id ||
    hotel.rate_source_id ||
    makeRef("RATE")
  );

  const rateTimestamp = clean(
    payload.rate_source_timestamp ||
    payload.rateSourceTimestamp ||
    room.rate_source_timestamp ||
    hotel.rate_source_timestamp ||
    nowISO()
  );

  const supplierName = clean(
    payload.supplier_name ||
    payload.supplier ||
    payload.source ||
    process.env.DEFAULT_SUPPLIER_NAME ||
    "HOTELBEDS"
  ).toUpperCase();

  const supplierCode = clean(
    payload.supplier_code ||
    payload.source_code ||
    mshSupplierCode(supplierName)
  ).toUpperCase();

  return {
    supplier_name: supplierName,
    supplier_code: supplierCode,
    supplier_hotel_id: clean(payload.supplier_hotel_id || payload.supplierHotelId || payload.hotelId || payload.hotel_id || hotel.hotelId || hotel.hotel_id),
    supplier_rate_id: rateSourceId,
    supplier_rate_key: clean(payload.supplier_rate_key || payload.rate_key || payload.roomCode || payload.room_code || room.roomCode),
    supplier_booking_reference: clean(payload.supplier_booking_reference || ""),
    rate_source_id: rateSourceId,
    rate_source_timestamp: rateTimestamp,
    source_health: clean(payload.source_health || room.source_health || hotel.source_health || "verified"),
    selected_room_code: clean(payload.roomCode || payload.room_code || room.roomCode || "STANDARD"),
    selected_room_name: clean(payload.roomName || payload.room_name || room.roomName || "Available room")
  };
}

function mshSearchAuditMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function patchedJson(body) {
    try {
      const hotels = Array.isArray(body && body.hotels) ? body.hotels : [];
      hotels.slice(0, 120).forEach((hotel) => {
        const rooms = Array.isArray(hotel.rooms) ? hotel.rooms : [];
        const room = rooms[0] || {};
        const tracking = mshSupplierTrackingFromPayload({
          ...req.query,
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          roomCode: room.roomCode,
          rate_source_id: room.rate_source_id || hotel.rate_source_id,
          rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
          source_health: room.source_health || hotel.source_health
        });

        mshAppendSupplierAudit("rate_returned_to_search", {
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          country: hotel.country,
          city: hotel.city,
          price: hotel.price,
          currency: hotel.currency,
          supplier_name: tracking.supplier_name,
          supplier_code: tracking.supplier_code,
          supplier_hotel_id: tracking.supplier_hotel_id,
          supplier_rate_id: tracking.supplier_rate_id,
          rate_source_id: tracking.rate_source_id,
          rate_source_timestamp: tracking.rate_source_timestamp,
          source_health: tracking.source_health
        });
      });
    } catch (err) {
      recordActivity("supplier_search_audit_error", { url: req.originalUrl }, { error: err.message, stack: err.stack });
    }

    return originalJson(body);
  };

  next();
}

app.use("/search", mshSearchAuditMiddleware);
app.use("/api/hotels/search", mshSearchAuditMiddleware);

app.post("/api/book", async (req, res) => {
  const bookingRef = makeRef("MSH");
  const confirmationRef = makeRef("CONF");
  const tracking = mshSupplierTrackingFromPayload(req.body);
  const found = mshFindPublicOffer(req.body);
  const foundHotel = found.hotel || {};
  const foundRoom = found.room || {};

  const booking = {
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    createdAt: nowISO(),

    hotelId: clean(req.body.hotelId || req.body.hotel_id || foundHotel.hotelId || foundHotel.hotel_id),
    hotelName: clean(req.body.hotelName || req.body.hotel || foundHotel.name || foundHotel.hotel_name),
    roomCode: tracking.selected_room_code,
    roomName: tracking.selected_room_name,

    country: clean(req.body.country || foundHotel.country),
    city: clean(req.body.city || foundHotel.city),
    checkIn: clean(req.body.checkIn || req.body.checkin),
    checkOut: clean(req.body.checkOut || req.body.checkout),
    guests: number(req.body.guests),
    rooms: number(req.body.rooms),
    amount: money(req.body.amount || req.body.total || foundRoom.convertedPrice || foundRoom.price || foundHotel.price),
    currency: clean(req.body.currency || foundRoom.displayCurrency || foundHotel.currency || "GBP").toUpperCase(),

    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    customerPhone: clean(req.body.customerPhone),
    specialRequests: clean(req.body.specialRequests),

    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health,

    internalSupplierTracking: {
      supplier_name: tracking.supplier_name,
      supplier_code: tracking.supplier_code,
      supplier_hotel_id: tracking.supplier_hotel_id,
      supplier_rate_id: tracking.supplier_rate_id,
      supplier_rate_key: tracking.supplier_rate_key,
      supplier_booking_reference: tracking.supplier_booking_reference,
      rate_source_id: tracking.rate_source_id,
      rate_source_timestamp: tracking.rate_source_timestamp
    },

    selected_supplier_offer: {
      supplier_code: tracking.supplier_code,
      supplier_hotel_id: tracking.supplier_hotel_id,
      supplier_rate_id: tracking.supplier_rate_id,
      rate_source_id: tracking.rate_source_id,
      rate_source_timestamp: tracking.rate_source_timestamp
    }
  };

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  mshAppendSupplierAudit("booking_prepared_supplier_source", {
    bookingRef,
    confirmationReference: confirmationRef,
    hotelId: booking.hotelId,
    hotelName: booking.hotelName,
    roomCode: booking.roomCode,
    roomName: booking.roomName,
    country: booking.country,
    city: booking.city,
    amount: booking.amount,
    currency: booking.currency,
    customerEmail: booking.customerEmail,
    supplier_name: tracking.supplier_name,
    supplier_code: tracking.supplier_code,
    supplier_hotel_id: tracking.supplier_hotel_id,
    supplier_rate_id: tracking.supplier_rate_id,
    supplier_rate_key: tracking.supplier_rate_key,
    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health
  });

  const emailResult = await sendEmailNotification("New booking prepared - MySpace Hotel", [
    ["Booking reference", booking.bookingRef],
    ["Hotel", booking.hotelName],
    ["Destination", `${booking.city}, ${booking.country}`],
    ["Check-in", booking.checkIn],
    ["Check-out", booking.checkOut],
    ["Guests", String(booking.guests)],
    ["Rooms", String(booking.rooms)],
    ["Amount", `${booking.currency} ${booking.amount}`],
    ["Customer name", booking.customerName],
    ["Customer email", booking.customerEmail],
    ["Customer phone", booking.customerPhone],
    ["Special requests", booking.specialRequests],
    ["Internal supplier", tracking.supplier_name],
    ["Supplier code", tracking.supplier_code],
    ["Supplier hotel ID", tracking.supplier_hotel_id],
    ["Supplier rate ID", tracking.supplier_rate_id],
    ["Rate source ID", tracking.rate_source_id],
    ["Rate timestamp", tracking.rate_source_timestamp],
    ["Created", booking.createdAt]
  ]);

  const affiliateConversion = recordAffiliateConversionIfPresent({ ...booking, affiliateCode: req.body.affiliateCode || req.body.affiliate_code || req.body.ref });

  const response = {
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    rate_source_id: tracking.rate_source_id,
    rate_source_timestamp: tracking.rate_source_timestamp,
    source_health: tracking.source_health,
    emailSent: Boolean(emailResult.ok),
    affiliateTracked: Boolean(affiliateConversion),
    affiliateCode: affiliateConversion?.affiliateCode || "",
    message: "Your reservation has been prepared for secure payment."
  };

  recordActivity("booking_prepared", req.body, response);
  res.json(response);
});
// MSH SUPPLIER TRACKING OVERRIDE END

app.post("/api/book", async (req, res) => {
  const bookingRef = makeRef("MSH");
  const confirmationRef = makeRef("CONF");
  const { hotel, room } = findInternalOffer(req.body);

  const supplierSnapshot = {
    supplier_name: room._supplier_name || hotel._supplier_name,
    supplier_code: room._supplier_code || hotel._supplier_code,
    supplier_hotel_id: room._supplier_hotel_id || hotel._supplier_hotel_id,
    supplier_rate_id: room._supplier_rate_id || hotel._supplier_rate_id,
    supplier_rate_key: room._supplier_rate_key || hotel._supplier_rate_key,
    supplier_currency: room._supplier_currency || hotel._supplier_currency,
    supplier_price: room._supplier_price || hotel._supplier_price,
    rate_source_timestamp: room.rate_source_timestamp || hotel.rate_source_timestamp,
    supplier_booking_reference: clean(req.body.supplier_booking_reference || "")
  };

  const booking = {
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    createdAt: nowISO(),
    hotelId: clean(req.body.hotelId || hotel.hotelId),
    hotelName: clean(req.body.hotelName || hotel.name),
    roomCode: clean(req.body.roomCode || room.roomCode),
    roomName: clean(req.body.roomName || room.roomName),
    country: clean(req.body.country || hotel.country),
    city: clean(req.body.city || hotel.city),
    checkIn: clean(req.body.checkIn || req.body.checkin),
    checkOut: clean(req.body.checkOut || req.body.checkout),
    guests: number(req.body.guests),
    rooms: number(req.body.rooms),
    amount: money(req.body.amount),
    currency: clean(req.body.currency || room.displayCurrency || hotel.currency || "GBP").toUpperCase(),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    customerPhone: clean(req.body.customerPhone),
    specialRequests: clean(req.body.specialRequests),

    internalSupplierTracking: supplierSnapshot,
    selected_supplier_offer: {
      supplier_code: supplierSnapshot.supplier_code,
      supplier_hotel_id: supplierSnapshot.supplier_hotel_id,
      supplier_rate_id: supplierSnapshot.supplier_rate_id,
      rate_source_timestamp: supplierSnapshot.rate_source_timestamp
    }
  };

  const bookings = readJSON(BOOKINGS_FILE, []);
  bookings.unshift(booking);
  writeJSON(BOOKINGS_FILE, bookings);

  recordSupplierAudit("booking_prepared_supplier_source", {
    bookingRef,
    confirmationReference: confirmationRef,
    hotelId: booking.hotelId,
    hotelName: booking.hotelName,
    roomCode: booking.roomCode,
    supplier_name: supplierSnapshot.supplier_name,
    supplier_code: supplierSnapshot.supplier_code,
    supplier_hotel_id: supplierSnapshot.supplier_hotel_id,
    supplier_rate_id: supplierSnapshot.supplier_rate_id,
    supplier_rate_key: supplierSnapshot.supplier_rate_key,
    supplier_booking_reference: supplierSnapshot.supplier_booking_reference,
    amount: booking.amount,
    currency: booking.currency,
    customerEmail: booking.customerEmail,
    rate_source_timestamp: supplierSnapshot.rate_source_timestamp
  });

  const emailResult = await sendEmailNotification("New booking prepared - MySpace Hotel", [
    ["Booking reference", booking.bookingRef],
    ["Hotel", booking.hotelName],
    ["Destination", `${booking.city}, ${booking.country}`],
    ["Check-in", booking.checkIn],
    ["Check-out", booking.checkOut],
    ["Guests", String(booking.guests)],
    ["Rooms", String(booking.rooms)],
    ["Amount", `${booking.currency} ${booking.amount}`],
    ["Customer name", booking.customerName],
    ["Customer email", booking.customerEmail],
    ["Customer phone", booking.customerPhone],
    ["Special requests", booking.specialRequests],
    ["Internal supplier", supplierSnapshot.supplier_name],
    ["Supplier code", supplierSnapshot.supplier_code],
    ["Supplier hotel ID", supplierSnapshot.supplier_hotel_id],
    ["Supplier rate ID", supplierSnapshot.supplier_rate_id],
    ["Rate timestamp", supplierSnapshot.rate_source_timestamp],
    ["Created", booking.createdAt]
  ]);

  const affiliateConversion = recordAffiliateConversionIfPresent({ ...booking, affiliateCode: req.body.affiliateCode || req.body.affiliate_code || req.body.ref });

  const response = {
    ok: true,
    bookingRef,
    confirmationReference: confirmationRef,
    status: "PENDING_PAYMENT",
    rate_source_id: supplierSnapshot.supplier_rate_id,
    rate_source_timestamp: supplierSnapshot.rate_source_timestamp,
    emailSent: Boolean(emailResult.ok),
    affiliateTracked: Boolean(affiliateConversion),
    affiliateCode: affiliateConversion?.affiliateCode || "",
    message: "Your reservation has been prepared for secure payment."
  };

  recordActivity("booking_prepared", req.body, response);
  res.json(response);
});

// MSH STRIPE WEBHOOK AFFILIATE PAID START
function markBookingPaidFromStripe(bookingRef, stripePayload) {
  const ref = clean(bookingRef);
  if (!ref) return { ok: false, reason: "Missing booking reference" };

  const bookings = readJSON(BOOKINGS_FILE, []);
  const index = bookings.findIndex((b) => clean(b.bookingRef) === ref);

  if (index >= 0) {
    bookings[index] = {
      ...bookings[index],
      status: "PAID",
      paidAt: nowISO(),
      stripeSessionId: clean(stripePayload.stripeSessionId),
      stripePaymentIntent: clean(stripePayload.stripePaymentIntent),
      stripePaymentStatus: clean(stripePayload.stripePaymentStatus || "paid"),
      paymentReference: clean(stripePayload.paymentReference || stripePayload.stripePaymentIntent || stripePayload.stripeSessionId)
    };

    writeJSON(BOOKINGS_FILE, bookings);
  }

  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const conversionIndex = conversions.findIndex((x) => clean(x.bookingRef) === ref);

  if (conversionIndex >= 0) {
    conversions[conversionIndex] = {
      ...conversions[conversionIndex],
      status: "PAID",
      paidAt: nowISO(),
      paymentReference: clean(stripePayload.paymentReference || stripePayload.stripePaymentIntent || stripePayload.stripeSessionId),
      stripeSessionId: clean(stripePayload.stripeSessionId),
      stripePaymentIntent: clean(stripePayload.stripePaymentIntent)
    };

    writeJSON(AFFILIATE_CONVERSIONS_FILE, conversions);
  }

  recordActivity("stripe_payment_confirmed", { bookingRef: ref }, {
    bookingUpdated: index >= 0,
    affiliateConversionUpdated: conversionIndex >= 0,
    stripeSessionId: clean(stripePayload.stripeSessionId),
    stripePaymentIntent: clean(stripePayload.stripePaymentIntent)
  });

  return {
    ok: true,
    bookingUpdated: index >= 0,
    affiliateConversionUpdated: conversionIndex >= 0
  };
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
    const signature = req.headers["stripe-signature"];

    let event;

    if (webhookSecret && stripeSecretKey && signature) {
      try {
        const Stripe = require("stripe");
        const stripe = Stripe(stripeSecretKey);
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
      } catch (err) {
        recordActivity("stripe_webhook_signature_failed", {}, { error: err.message, stack: err.stack });
        return res.status(400).json({ ok: false, message: "Invalid Stripe webhook signature." });
      }
    } else {
      const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body || {});
      event = JSON.parse(raw || "{}");
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data && event.data.object ? event.data.object : {};
      const bookingRef =
        clean(session.metadata?.booking_reference) ||
        clean(session.client_reference_id) ||
        clean(session.metadata?.bookingRef);

      const result = markBookingPaidFromStripe(bookingRef, {
        stripeSessionId: session.id,
        stripePaymentIntent: session.payment_intent,
        stripePaymentStatus: session.payment_status,
        paymentReference: session.payment_intent || session.id
      });

      return res.json({ ok: true, handled: true, event: event.type, result });
    }

    return res.json({ ok: true, handled: false, event: event.type || "unknown" });
  } catch (err) {
    recordActivity("stripe_webhook_error", {}, { error: err.message, stack: err.stack });
    return res.status(500).json({ ok: false, message: "Stripe webhook could not be processed." });
  }
});

app.post("/api/internal/stripe-webhook-test-paid", (req, res) => {
  const bookingRef = clean(req.body.bookingRef || req.body.booking_reference);

  if (!bookingRef) {
    return res.status(400).json({ ok: false, message: "bookingRef is required." });
  }

  const result = markBookingPaidFromStripe(bookingRef, {
    stripeSessionId: clean(req.body.stripeSessionId || "LOCAL-TEST-SESSION"),
    stripePaymentIntent: clean(req.body.stripePaymentIntent || "LOCAL-TEST-PI"),
    stripePaymentStatus: "paid",
    paymentReference: clean(req.body.paymentReference || "LOCAL-TEST-PAYMENT")
  });

  res.json({ ok: true, result });
});
// MSH STRIPE WEBHOOK AFFILIATE PAID END

// MSH AFFILIATE TEST BOOKING MODE START
app.post("/api/internal/affiliate-test-booking-checkout", async (req, res) => {
  try {
    const affiliateCode = clean(req.body.affiliateCode || req.body.ref || "LUKAKA-91F16B").toUpperCase();
    const customerEmail = clean(req.body.customerEmail || "reservations@myspace-hotel.com");
    const customerName = clean(req.body.customerName || "Affiliate Test Guest");

    const affiliates = readAffiliates();
    const affiliate = affiliates.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

    if (!affiliate || clean(affiliate.status).toUpperCase() !== "APPROVED") {
      return res.status(400).json({
        ok: false,
        message: "Approved affiliate code was not found."
      });
    }

    const bookingRef = `AFF-TEST-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const amount = 0.5;
    const currency = "GBP";
    const commissionRate = 3;
    const commissionAmount = money(amount * commissionRate / 100);

    const booking = {
      id: crypto.randomUUID(),
      bookingRef,
      confirmationReference: `TEST-${Date.now()}`,
      status: "PENDING_PAYMENT",
      createdAt: nowISO(),
      hotelId: "AFFILIATE-TEST-HOTEL",
      hotelName: "Affiliate Test Booking",
      country: "United Kingdom",
      city: "London",
      customerName,
      customerEmail,
      amount,
      currency,
      affiliateCode,
      testMode: true,
      note: "Internal low-value affiliate test booking."
    };

    const bookings = readJSON(BOOKINGS_FILE, []);
    bookings.unshift(booking);
    writeJSON(BOOKINGS_FILE, bookings);

    const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
    conversions.unshift({
      id: crypto.randomUUID(),
      createdAt: nowISO(),
      affiliateCode,
      affiliateFound: true,
      affiliateStatus: "APPROVED",
      bookingRef,
      hotelName: booking.hotelName,
      customerEmail,
      amount,
      currency,
      commissionRate,
      commissionAmount,
      status: "PENDING_PAYMENT",
      testMode: true
    });
    writeJSON(AFFILIATE_CONVERSIONS_FILE, conversions);

    req.body = {
      bookingRef,
      hotelName: booking.hotelName,
      customerEmail,
      amount,
      currency,
      affiliateCode,
      testMode: true
    };

    return createStripeCheckout(req, res);
  } catch (err) {
    console.error("Affiliate test checkout error:", err);
    return res.status(500).json({
      ok: false,
      message: "Affiliate test checkout could not be created."
    });
  }
});
// MSH AFFILIATE TEST BOOKING MODE END

app.post("/api/create-checkout-session", createStripeCheckout);
app.post("/api/stripe/checkout", createStripeCheckout);
app.post("/create-checkout-session", createStripeCheckout);

app.get("/api/bookings", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  res.json({ ok: true, total: bookings.length, bookings });
});

app.get("/api/bookings/:reference", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.bookingRef === req.params.reference);

  if (!booking) return res.status(404).json({ ok: false, message: "We could not find a booking with that reference." });

  res.json({ ok: true, booking });
});

app.get("/api/internal/supplier-audit", (req, res) => {
  const rows = readJSON(SUPPLIER_AUDIT_FILE, []);
  res.json({ ok: true, total: rows.length, audit: rows });
});

app.post("/api/cancel-booking", async (req, res) => {
  const bookingRef = clean(req.body.bookingRef || req.body.booking_reference);
  const bookings = readJSON(BOOKINGS_FILE, []);
  const booking = bookings.find((b) => b.bookingRef === bookingRef);

  if (!booking) return res.status(404).json({ ok: false, message: "We could not find a booking with that reference." });

  booking.status = "CANCELLED";
  booking.cancelledAt = nowISO();
  booking.cancellationReason = clean(req.body.reason || "Customer request");

  writeJSON(BOOKINGS_FILE, bookings);

  recordSupplierAudit("booking_cancelled_supplier_source", {
    bookingRef,
    hotelName: booking.hotelName,
    supplier_name: booking.internalSupplierTracking?.supplier_name || "",
    supplier_code: booking.internalSupplierTracking?.supplier_code || "",
    supplier_hotel_id: booking.internalSupplierTracking?.supplier_hotel_id || "",
    supplier_rate_id: booking.internalSupplierTracking?.supplier_rate_id || "",
    supplier_booking_reference: booking.internalSupplierTracking?.supplier_booking_reference || "",
    cancelledAt: booking.cancelledAt,
    reason: booking.cancellationReason
  });

  await sendEmailNotification("Booking cancelled - MySpace Hotel", [
    ["Booking reference", booking.bookingRef],
    ["Hotel", booking.hotelName],
    ["Customer", booking.customerName],
    ["Customer email", booking.customerEmail],
    ["Reason", booking.cancellationReason],
    ["Cancelled at", booking.cancelledAt],
    ["Internal supplier", booking.internalSupplierTracking?.supplier_name || ""],
    ["Supplier hotel ID", booking.internalSupplierTracking?.supplier_hotel_id || ""],
    ["Supplier rate ID", booking.internalSupplierTracking?.supplier_rate_id || ""]
  ]);

  res.json({ ok: true, bookingRef, status: "CANCELLED", message: "Your booking has been cancelled." });
});

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

  const reference = `PARTNER-${row.id.slice(0, 8).toUpperCase()}`;

  const emailResult = await sendEmailNotification("New partnership enquiry - MySpace Hotel", [
    ["Reference", reference],
    ["Partner type", row.partner_type],
    ["Business name", row.business_name],
    ["Contact name", row.contact_name],
    ["Contact email", row.contact_email],
    ["Phone", row.phone],
    ["Country", row.country],
    ["City", row.city],
    ["Website", row.website],
    ["Message", row.message],
    ["Received", row.created_at]
  ]);

  res.json({
    ok: true,
    emailSent: Boolean(emailResult.ok),
    message: "Thank you. Your partnership enquiry has been received by MySpace Hotel.",
    reference
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

  const emailResult = await sendEmailNotification("New guest review - MySpace Hotel", [
    ["Name", row.name],
    ["Email", row.email],
    ["Message", row.message],
    ["Received", row.created_at]
  ]);

  res.json({
    ok: true,
    emailSent: Boolean(emailResult.ok),
    message: "Thank you. Your message has been received by MySpace Hotel."
  });
});

// MSH SUPPLIER REGISTRY START
const SUPPLIER_REGISTRY_FILE = path.join(DATA_DIR, "supplier_registry.json");

ensureFile(SUPPLIER_REGISTRY_FILE, [
  {
    supplier_code: "HOTELBEDS",
    supplier_name: "Hotelbeds",
    supplier_type: "bedbank",
    status: "active",
    priority: 1,
    customer_visible: false,
    notes: "Primary hotel inventory and rate source."
  },
  {
    supplier_code: "WEBBEDS",
    supplier_name: "WebBeds",
    supplier_type: "bedbank",
    status: "contracted_pending_integration",
    priority: 2,
    customer_visible: false,
    notes: "Contract signed. Integration pending."
  },
  {
    supplier_code: "HYPERGUEST",
    supplier_name: "HyperGuest",
    supplier_type: "direct_connectivity",
    status: "contracted_pending_integration",
    priority: 3,
    customer_visible: false,
    notes: "Direct hotel connectivity partner."
  },
  {
    supplier_code: "HOTELRUNNER",
    supplier_name: "HotelRunner",
    supplier_type: "channel_connectivity",
    status: "onboarding",
    priority: 4,
    customer_visible: false,
    notes: "Partner onboarding requested."
  },
  {
    supplier_code: "SITEMINDER",
    supplier_name: "SiteMinder",
    supplier_type: "channel_manager",
    status: "onboarding",
    priority: 5,
    customer_visible: false,
    notes: "Channel manager partnership in progress."
  },
  {
    supplier_code: "DIRECT_CONTRACT",
    supplier_name: "Direct Hotel Contract",
    supplier_type: "direct_contract",
    status: "planned",
    priority: 6,
    customer_visible: false,
    notes: "For direct hotel agreements."
  },
  {
    supplier_code: "MYSPACE_INTERNAL",
    supplier_name: "MySpace Internal",
    supplier_type: "internal",
    status: "active",
    priority: 99,
    customer_visible: false,
    notes: "Internal fallback or manually controlled inventory."
  }
]);

function readSupplierRegistry() {
  const rows = readJSON(SUPPLIER_REGISTRY_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function supplierRegistryMap() {
  const map = new Map();
  for (const supplier of readSupplierRegistry()) {
    const code = clean(supplier.supplier_code).toUpperCase();
    if (code) map.set(code, supplier);
  }
  return map;
}

function resolveSupplierForAdmin(tracking) {
  const registry = supplierRegistryMap();
  const code = clean(
    tracking?.supplier_code ||
    tracking?.supplier_name ||
    "HOTELBEDS"
  ).toUpperCase();

  const supplier = registry.get(code) || registry.get("HOTELBEDS") || {
    supplier_code: code || "HOTELBEDS",
    supplier_name: code || "Hotelbeds",
    supplier_type: "unknown",
    status: "unknown",
    priority: 99,
    customer_visible: false
  };

  return {
    supplier_code: clean(supplier.supplier_code || code).toUpperCase(),
    supplier_name: clean(supplier.supplier_name || supplier.supplier_code || code),
    supplier_type: clean(supplier.supplier_type || "unknown"),
    status: clean(supplier.status || "unknown"),
    priority: number(supplier.priority || 99),
    customer_visible: Boolean(supplier.customer_visible),
    notes: clean(supplier.notes)
  };
}

app.get("/api/internal/supplier-registry", (req, res) => {
  const suppliers = readSupplierRegistry().sort((a, b) => number(a.priority) - number(b.priority));
  res.json({
    ok: true,
    total: suppliers.length,
    suppliers
  });
});

app.post("/api/internal/supplier-registry", (req, res) => {
  const rows = readSupplierRegistry();
  const supplierCode = clean(req.body.supplier_code || req.body.supplierCode).toUpperCase();

  if (!supplierCode) {
    return res.status(400).json({
      ok: false,
      message: "supplier_code is required."
    });
  }

  const incoming = {
    supplier_code: supplierCode,
    supplier_name: clean(req.body.supplier_name || req.body.supplierName || supplierCode),
    supplier_type: clean(req.body.supplier_type || req.body.supplierType || "unknown"),
    status: clean(req.body.status || "active"),
    priority: number(req.body.priority || 99),
    customer_visible: Boolean(req.body.customer_visible),
    notes: clean(req.body.notes)
  };

  const index = rows.findIndex((x) => clean(x.supplier_code).toUpperCase() === supplierCode);

  if (index >= 0) rows[index] = { ...rows[index], ...incoming, updated_at: nowISO() };
  else rows.unshift({ ...incoming, created_at: nowISO() });

  writeJSON(SUPPLIER_REGISTRY_FILE, rows);

  res.json({
    ok: true,
    supplier: index >= 0 ? rows[index] : rows[0],
    message: "Supplier registry updated."
  });
});

// MSH MULTI SUPPLIER COMPARE START
function mshComparableHotelName(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function mshBuildSupplierCompareOffers(query) {
  const country = clean(query.country);
  const city = clean(query.city);
  const currency = clean(query.currency || "GBP").toUpperCase();
  const requestedHotelId = clean(query.hotelId || query.hotel_id);
  const requestedHotelName = mshComparableHotelName(query.hotelName || query.hotel_name);

  const hotels = searchHotels({ country, city, currency });

  const selected =
    hotels.find((h) => clean(h.hotelId) === requestedHotelId || clean(h.hotel_id) === requestedHotelId) ||
    hotels.find((h) => mshComparableHotelName(h.name || h.hotel_name) === requestedHotelName) ||
    hotels[0];

  if (!selected) {
    return {
      selected_hotel: null,
      winning_offer: null,
      competing_offers: [],
      customer_offer: null
    };
  }

  const selectedName = mshComparableHotelName(selected.name || selected.hotel_name);

  const sameHotelOffers = hotels
    .filter((hotel) => {
      const nameMatch = mshComparableHotelName(hotel.name || hotel.hotel_name) === selectedName;
      const idMatch = clean(hotel.hotelId) === clean(selected.hotelId) || clean(hotel.hotel_id) === clean(selected.hotel_id);
      return nameMatch || idMatch;
    })
    .flatMap((hotel) => {
      const rooms = Array.isArray(hotel.rooms) && hotel.rooms.length ? hotel.rooms : [{}];

      return rooms.map((room, index) => {
        const price = money(room.convertedPrice || room.price || hotel.price);
        const rateSourceId = clean(room.rate_source_id || hotel.rate_source_id || makeRef("RATE"));
        const timestamp = clean(room.rate_source_timestamp || hotel.rate_source_timestamp || nowISO());

        const tracking = mshSupplierTrackingFromPayload({
          ...query,
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          roomCode: room.roomCode || `ROOM-${index + 1}`,
          roomName: room.roomName || "Available room",
          rate_source_id: rateSourceId,
          rate_source_timestamp: timestamp,
          source_health: room.source_health || hotel.source_health || "verified"
        });

        const supplier = resolveSupplierForAdmin(tracking);

        return {
          compare_offer_id: makeRef("OFFER"),
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          country: hotel.country,
          city: hotel.city,
          roomCode: room.roomCode || `ROOM-${index + 1}`,
          roomName: room.roomName || "Available room",
          board: room.board || "Room only",
          amount: price,
          currency: clean(room.displayCurrency || hotel.currency || currency).toUpperCase(),
          cancellation: room.cancellation || "",
          taxes: room.taxes || "",
          rate_source_id: rateSourceId,
          rate_source_timestamp: timestamp,
          source_health: room.source_health || hotel.source_health || "verified",
          supplier,
          internal_supplier_tracking: {
            supplier_code: supplier.supplier_code,
            supplier_name: supplier.supplier_name,
            supplier_hotel_id: tracking.supplier_hotel_id,
            supplier_rate_id: tracking.supplier_rate_id,
            rate_source_id: tracking.rate_source_id,
            rate_source_timestamp: tracking.rate_source_timestamp
          }
        };
      });
    })
    .filter((offer) => offer.amount > 0)
    .sort((a, b) => a.amount - b.amount);

  const winning = sameHotelOffers[0] || null;

  const customerOffer = winning
    ? {
        hotelId: winning.hotelId,
        hotelName: winning.hotelName,
        country: winning.country,
        city: winning.city,
        roomCode: winning.roomCode,
        roomName: winning.roomName,
        board: winning.board,
        amount: winning.amount,
        currency: winning.currency,
        rate_source_id: winning.rate_source_id,
        rate_source_timestamp: winning.rate_source_timestamp,
        source_health: winning.source_health,
        message: "Best available stay option selected for review."
      }
    : null;

  return {
    selected_hotel: {
      hotelId: selected.hotelId || selected.hotel_id,
      hotelName: selected.name || selected.hotel_name,
      country: selected.country,
      city: selected.city
    },
    winning_offer: winning,
    competing_offers: sameHotelOffers,
    customer_offer: customerOffer
  };
}

app.get("/api/internal/compare-supplier-rates", (req, res) => {
  const result = mshBuildSupplierCompareOffers(req.query);

  if (!result.selected_hotel) {
    return res.status(404).json({
      ok: false,
      message: "No comparable hotel offers were found."
    });
  }

  mshAppendSupplierAudit("supplier_rate_comparison_requested", {
    country: clean(req.query.country),
    city: clean(req.query.city),
    hotelId: result.selected_hotel.hotelId,
    hotelName: result.selected_hotel.hotelName,
    winning_supplier_code: result.winning_offer?.supplier?.supplier_code || "",
    winning_supplier_name: result.winning_offer?.supplier?.supplier_name || "",
    winning_amount: result.winning_offer?.amount || 0,
    winning_currency: result.winning_offer?.currency || "",
    competing_offer_count: result.competing_offers.length,
    rate_source_id: result.winning_offer?.rate_source_id || "",
    rate_source_timestamp: result.winning_offer?.rate_source_timestamp || ""
  });

  res.json({
    ok: true,
    generated_at: nowISO(),
    selected_hotel: result.selected_hotel,
    winning_offer: result.winning_offer,
    competing_offers: result.competing_offers,
    customer_offer: result.customer_offer
  });
});

app.get("/api/compare-prices", (req, res) => {
  const result = mshBuildSupplierCompareOffers(req.query);

  if (!result.selected_hotel) {
    return res.status(404).json({
      ok: false,
      message: "No comparable hotel offers were found."
    });
  }

  res.json({
    ok: true,
    selected_hotel: result.selected_hotel,
    customer_offer: result.customer_offer,
    comparison_summary: {
      compared_options: result.competing_offers.length,
      best_amount: result.customer_offer?.amount || 0,
      currency: result.customer_offer?.currency || clean(req.query.currency || "GBP").toUpperCase(),
      message: "Best available stay option selected for review."
    }
  });
});
// MSH MULTI SUPPLIER COMPARE END

app.get("/api/internal/supplier-dashboard", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const audit = readJSON(SUPPLIER_AUDIT_FILE, []);
  const suppliers = readSupplierRegistry();
  const supplierStats = new Map();

  for (const supplier of suppliers) {
    const code = clean(supplier.supplier_code).toUpperCase();
    if (!code) continue;

    supplierStats.set(code, {
      ...supplier,
      supplier_code: code,
      searches: 0,
      bookings: 0,
      pending_payment: 0,
      cancelled: 0,
      total_amount: 0,
      currencies: {}
    });
  }

  function ensureSupplierStat(code, tracking) {
    const resolved = resolveSupplierForAdmin({
      supplier_code: code,
      supplier_name: tracking?.supplier_name
    });

    const finalCode = resolved.supplier_code || "UNKNOWN";

    if (!supplierStats.has(finalCode)) {
      supplierStats.set(finalCode, {
        ...resolved,
        searches: 0,
        bookings: 0,
        pending_payment: 0,
        cancelled: 0,
        total_amount: 0,
        currencies: {}
      });
    }

    return supplierStats.get(finalCode);
  }

  for (const item of audit) {
    const code = clean(item.supplier_code || item.supplier_name || "HOTELBEDS").toUpperCase();
    const stat = ensureSupplierStat(code, item);
    if (String(item.action || "").includes("rate_returned")) stat.searches += 1;
  }

  for (const booking of bookings) {
    const tracking = booking.internalSupplierTracking || {};
    const code = clean(tracking.supplier_code || tracking.supplier_name || "HOTELBEDS").toUpperCase();
    const stat = ensureSupplierStat(code, tracking);

    stat.bookings += 1;
    if (booking.status === "PENDING_PAYMENT") stat.pending_payment += 1;
    if (booking.status === "CANCELLED") stat.cancelled += 1;

    const amount = money(booking.amount);
    const currency = clean(booking.currency || "GBP").toUpperCase();

    stat.total_amount += amount;
    stat.currencies[currency] = money((stat.currencies[currency] || 0) + amount);
  }

  const newestBookings = bookings.slice(0, 50).map((booking) => {
    const tracking = booking.internalSupplierTracking || {};
    const supplier = resolveSupplierForAdmin(tracking);

    return {
      bookingRef: booking.bookingRef,
      confirmationReference: booking.confirmationReference,
      status: booking.status,
      createdAt: booking.createdAt,
      hotelId: booking.hotelId,
      hotelName: booking.hotelName,
      roomCode: booking.roomCode,
      roomName: booking.roomName,
      country: booking.country,
      city: booking.city,
      amount: booking.amount,
      currency: booking.currency,
      customerEmail: booking.customerEmail,
      rate_source_id: booking.rate_source_id || tracking.rate_source_id,
      rate_source_timestamp: booking.rate_source_timestamp || tracking.rate_source_timestamp,
      supplier
    };
  });

  res.json({
    ok: true,
    generated_at: nowISO(),
    totals: {
      suppliers: suppliers.length,
      bookings: bookings.length,
      audit_records: audit.length
    },
    supplier_stats: Array.from(supplierStats.values()).sort((a, b) => number(a.priority) - number(b.priority)),
    newest_bookings: newestBookings
  });
});
// MSH SUPPLIER REGISTRY END

// MSH AFFILIATE NETWORK START
const AFFILIATES_FILE = path.join(DATA_DIR, "affiliates.json");
const AFFILIATE_CLICKS_FILE = path.join(DATA_DIR, "affiliate_clicks.json");
const AFFILIATE_CONVERSIONS_FILE = path.join(DATA_DIR, "affiliate_conversions.json");

ensureFile(AFFILIATES_FILE, []);
ensureFile(AFFILIATE_CLICKS_FILE, []);
ensureFile(AFFILIATE_CONVERSIONS_FILE, []);

function makeAffiliateCode(name) {
  const base = clean(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10) || "AFFILIATE";

  return `${base}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function readAffiliates() {
  const rows = readJSON(AFFILIATES_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function publicAffiliate(row) {
  return {
    affiliateCode: row.affiliateCode,
    status: row.status,
    businessName: row.businessName,
    contactName: row.contactName,
    website: row.website,
    referralLink: row.referralLink,
    commissionRate: row.commissionRate,
    createdAt: row.createdAt
  };
}

app.post("/api/affiliates/apply", async (req, res) => {
  const businessName = clean(req.body.businessName || req.body.business_name);
  const contactName = clean(req.body.contactName || req.body.contact_name);
  const email = clean(req.body.email || req.body.contactEmail || req.body.contact_email);
  const phone = clean(req.body.phone);
  const website = clean(req.body.website);
  const audience = clean(req.body.audience);
  const promotionPlan = clean(req.body.promotionPlan || req.body.promotion_plan);

  if (!businessName || !contactName || !email) {
    return res.status(400).json({
      ok: false,
      message: "Please provide business name, contact name and email address."
    });
  }

  const rows = readAffiliates();
  const affiliateCode = makeAffiliateCode(businessName);
  const frontendBase = clean(process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || "http://localhost:5173").replace(/\/$/, "");

  const row = {
    id: crypto.randomUUID(),
    affiliateCode,
    status: "PENDING_REVIEW",
    businessName,
    contactName,
    email,
    phone,
    website,
    audience,
    promotionPlan,
    commissionRate: 5,
    referralLink: `${frontendBase}/?ref=${encodeURIComponent(affiliateCode)}`,
    createdAt: nowISO(),
    approvedAt: "",
    notes: ""
  };

  rows.unshift(row);
  writeJSON(AFFILIATES_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New affiliate application - MySpace Hotel", [
    ["Affiliate code", affiliateCode],
    ["Business name", businessName],
    ["Contact name", contactName],
    ["Email", email],
    ["Phone", phone],
    ["Website", website],
    ["Audience", audience],
    ["Promotion plan", promotionPlan],
    ["Status", row.status],
    ["Referral link", row.referralLink],
    ["Received", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Thank you. Your affiliate application has been received by MySpace Hotel.",
    affiliate: publicAffiliate(row)
  });
});

app.get("/api/affiliates/validate/:code", (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate code was not found." });
  }

  res.json({
    ok: true,
    affiliate: publicAffiliate(affiliate)
  });
});

app.get("/r/:code", (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const rows = readAffiliates();
  const affiliate = rows.find((x) => clean(x.affiliateCode).toUpperCase() === code);

  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  clicks.unshift({
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode: code,
    foundAffiliate: Boolean(affiliate),
    ip: req.headers["x-forwarded-for"] || req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
    referrer: req.headers.referer || ""
  });
  writeJSON(AFFILIATE_CLICKS_FILE, clicks.slice(0, 20000));

  const frontendBase = clean(process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.PUBLIC_SITE_URL || "http://localhost:5173").replace(/\/$/, "");
  res.redirect(`${frontendBase}/?ref=${encodeURIComponent(code)}`);
});

function recordAffiliateConversionIfPresent(booking) {
  const affiliateCode = clean(booking.affiliateCode || booking.affiliate_code || booking.ref || "").toUpperCase();
  if (!affiliateCode) return null;

  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);
  const commissionRate = number(affiliate?.commissionRate || 5);
  const amount = money(booking.amount);
  const commissionAmount = money((amount * commissionRate) / 100);

  const conversion = {
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode,
    affiliateFound: Boolean(affiliate),
    affiliateStatus: affiliate?.status || "UNKNOWN",
    bookingRef: booking.bookingRef,
    hotelName: booking.hotelName,
    customerEmail: booking.customerEmail,
    amount,
    currency: booking.currency,
    commissionRate,
    commissionAmount,
    status: "PENDING_PAYMENT"
  };

  const rows = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  rows.unshift(conversion);
  writeJSON(AFFILIATE_CONVERSIONS_FILE, rows.slice(0, 20000));

  return conversion;
}

// MSH AFFILIATE APPROVAL EMAIL START
app.post("/api/internal/affiliates/:code/approve", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliates = readAffiliates();
  const index = affiliates.findIndex((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  affiliates[index] = {
    ...affiliates[index],
    status: "APPROVED",
    approvedAt: nowISO(),
    notes: clean(req.body.notes || affiliates[index].notes || "")
  };

  writeJSON(AFFILIATES_FILE, affiliates);

  const affiliate = affiliates[index];

  await sendEmailNotification(
    "Affiliate approved - MySpace Hotel",
    [
      ["Business name", affiliate.businessName],
      ["Contact name", affiliate.contactName],
      ["Email", affiliate.email],
      ["Affiliate code", affiliate.affiliateCode],
      ["Referral link", affiliate.referralLink],
      ["Status", affiliate.status],
      ["Approved", affiliate.approvedAt]
    ],
    affiliate.email
  );

  res.json({
    ok: true,
    message: "Affiliate approved and approval email sent.",
    affiliate: publicAffiliate(affiliate)
  });
});

app.post("/api/internal/affiliates/:code/reject", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliates = readAffiliates();
  const index = affiliates.findIndex((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  affiliates[index] = {
    ...affiliates[index],
    status: "REJECTED",
    rejectedAt: nowISO(),
    notes: clean(req.body.notes || affiliates[index].notes || "")
  };

  writeJSON(AFFILIATES_FILE, affiliates);

  res.json({
    ok: true,
    message: "Affiliate application rejected.",
    affiliate: publicAffiliate(affiliates[index])
  });
});

app.post("/api/internal/affiliates/:code/resend-welcome", async (req, res) => {
  const code = clean(req.params.code).toUpperCase();
  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === code);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate was not found." });
  }

  await sendEmailNotification(
    "Welcome to the MySpace Hotel Affiliate Network",
    [
      ["Hello", affiliate.contactName],
      ["Status", affiliate.status],
      ["Affiliate code", affiliate.affiliateCode],
      ["Your referral link", affiliate.referralLink],
      ["How to use it", "Share your referral link with customers, followers, travel groups, businesses, communities and social media audiences."],
      ["Commission", `${affiliate.commissionRate || 5}% on qualifying completed stays, subject to approval and programme terms.`],
      ["Support", "reservations@myspace-hotel.com"],
      ["Website", "myspace-hotel.com"]
    ],
    affiliate.email
  );

  res.json({
    ok: true,
    message: "Affiliate welcome email sent.",
    affiliate: publicAffiliate(affiliate)
  });
});
// MSH AFFILIATE APPROVAL EMAIL END

// MSH AFFILIATE DIRECT CONVERSION START
app.post("/api/internal/affiliate-conversion-test", (req, res) => {
  const affiliateCode = clean(req.body.affiliateCode || req.body.affiliate_code || req.body.ref).toUpperCase();

  if (!affiliateCode) {
    return res.status(400).json({
      ok: false,
      message: "affiliateCode is required."
    });
  }

  const conversion = recordAffiliateConversionIfPresent({
    affiliateCode,
    bookingRef: clean(req.body.bookingRef || makeRef("AFFTEST")),
    hotelName: clean(req.body.hotelName || "Affiliate Test Booking"),
    customerEmail: clean(req.body.customerEmail || "test@example.com"),
    amount: money(req.body.amount || 100),
    currency: clean(req.body.currency || "GBP").toUpperCase()
  });

  res.json({
    ok: true,
    conversion
  });
});
// MSH AFFILIATE DIRECT CONVERSION END

// MSH PAID AFFILIATE COMMISSION OVERRIDE START
app.post("/api/internal/affiliate-conversions/:bookingRef/confirm-paid", (req, res) => {
  const bookingRef = clean(req.params.bookingRef);
  const paymentReference = clean(req.body.paymentReference || req.body.stripePaymentIntent || req.body.stripeSessionId || "");

  const rows = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const index = rows.findIndex((x) => clean(x.bookingRef) === bookingRef);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Affiliate conversion was not found." });
  }

  rows[index] = {
    ...rows[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference
  };

  writeJSON(AFFILIATE_CONVERSIONS_FILE, rows);

  res.json({
    ok: true,
    message: "Affiliate conversion marked as paid.",
    conversion: rows[index]
  });
});

app.get("/api/internal/affiliate-dashboard-paid", (req, res) => {
  const affiliates = readAffiliates();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const stats = affiliates.map((affiliate) => {
    const code = clean(affiliate.affiliateCode).toUpperCase();
    const affiliateClicks = clicks.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const affiliateConversions = conversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const paidConversions = affiliateConversions.filter((x) => clean(x.status).toUpperCase() === "PAID");
    const pendingConversions = affiliateConversions.filter((x) => clean(x.status).toUpperCase() !== "PAID");

    return {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      clicks: affiliateClicks.length,

      conversions: paidConversions.length,
      pendingConversions: pendingConversions.length,

      paidBookingValue: money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      payableCommission: money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),

      pendingBookingValue: money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      pendingCommission: money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),

      currency: affiliateConversions[0]?.currency || "GBP",
      createdAt: affiliate.createdAt
    };
  });

  res.json({
    ok: true,
    generatedAt: nowISO(),
    rule: "Only PAID affiliate conversions count as payable commission.",
    totals: {
      affiliates: affiliates.length,
      clicks: clicks.length,
      paidConversions: conversions.filter((x) => clean(x.status).toUpperCase() === "PAID").length,
      pendingConversions: conversions.filter((x) => clean(x.status).toUpperCase() !== "PAID").length,
      pendingApplications: affiliates.filter((x) => x.status === "PENDING_REVIEW").length
    },
    stats,
    recentPaidConversions: conversions.filter((x) => clean(x.status).toUpperCase() === "PAID").slice(0, 50),
    recentPendingConversions: conversions.filter((x) => clean(x.status).toUpperCase() !== "PAID").slice(0, 50)
  });
});
// MSH PAID AFFILIATE COMMISSION OVERRIDE END

// MSH AFFILIATE PORTAL API START
function affiliatePublicCommissionRate(affiliate) {
  const custom = number(affiliate.commissionRate);
  if (custom > 0 && custom < 3) return custom;
  if (custom > 3 && clean(affiliate.tier).toUpperCase() === "STRATEGIC") return custom;
  return 3;
}

app.post("/api/affiliate-portal/login", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();

  const affiliates = readAffiliates();
  const affiliate = affiliates.find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({
      ok: false,
      message: "We could not find an approved affiliate account with those details."
    });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({
      ok: false,
      message: "Your affiliate account is not approved yet."
    });
  }

  res.json({
    ok: true,
    message: "Affiliate login successful.",
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: affiliatePublicCommissionRate(affiliate),
      minimumPayout: 50,
      payoutSchedule: "Monthly"
    }
  });
});

app.get("/api/affiliate-portal/dashboard", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliates = readAffiliates();
  const affiliate = affiliates.find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({
      ok: false,
      message: "Affiliate account not found."
    });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({
      ok: false,
      message: "Affiliate account is not approved yet."
    });
  }

  const code = clean(affiliate.affiliateCode).toUpperCase();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);

  const allConversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);
  const conversions = allConversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);

  const paidConversions = conversions.filter((x) => clean(x.status).toUpperCase() === "PAID");
  const pendingConversions = conversions.filter((x) => {
    const status = clean(x.status).toUpperCase();
    return status !== "PAID" && status !== "CANCELLED" && status !== "REFUNDED";
  });

  const payableCommission = money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const pendingCommission = money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const paidBookingValue = money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const pendingBookingValue = money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const conversionRate = clicks.length > 0 ? money((paidConversions.length / clicks.length) * 100) : 0;
  const minimumPayout = 50;

  res.json({
    ok: true,
    generatedAt: nowISO(),
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: affiliatePublicCommissionRate(affiliate),
      minimumPayout,
      payoutSchedule: "Monthly",
      createdAt: affiliate.createdAt
    },
    summary: {
      clicks: clicks.length,
      paidBookings: paidConversions.length,
      pendingBookings: pendingConversions.length,
      conversionRatePercent: conversionRate,
      paidBookingValue,
      pendingBookingValue,
      payableCommission,
      pendingCommission,
      lifetimeCommission: money(payableCommission + pendingCommission),
      nextPayoutThreshold: minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - payableCommission))
    },
    recentClicks: clicks.slice(0, 25),
    bookings: conversions.slice(0, 100).map((x) => ({
      createdAt: x.createdAt,
      bookingRef: x.bookingRef,
      hotelName: x.hotelName,
      customerEmail: x.customerEmail,
      amount: money(x.amount),
      currency: x.currency || "GBP",
      commissionRate: number(x.commissionRate || affiliatePublicCommissionRate(affiliate)),
      commissionAmount: money(x.commissionAmount),
      status: x.status,
      paidAt: x.paidAt || ""
    }))
  });
});
// MSH AFFILIATE PORTAL API END

// MSH AFFILIATE PORTAL BOOKING FALLBACK START
function buildAffiliatePortalDashboard(affiliate) {
  const code = clean(affiliate.affiliateCode).toUpperCase();
  const rate = 3;
  const minimumPayout = 50;

  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const conversionRows = readJSON(AFFILIATE_CONVERSIONS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const bookingRows = readJSON(BOOKINGS_FILE, []).filter((booking) => {
    const bookingAffiliate =
      clean(booking.affiliateCode) ||
      clean(booking.affiliate_code) ||
      clean(booking.ref) ||
      clean(booking.referralCode) ||
      clean(booking.referral_code);

    return bookingAffiliate.toUpperCase() === code;
  });

  const merged = [];

  for (const x of conversionRows) {
    merged.push({
      source: "conversion",
      createdAt: x.createdAt || "",
      bookingRef: clean(x.bookingRef),
      hotelName: clean(x.hotelName),
      customerEmail: clean(x.customerEmail),
      amount: money(x.amount),
      currency: clean(x.currency || "GBP").toUpperCase(),
      commissionRate: number(x.commissionRate || rate),
      commissionAmount: money(x.commissionAmount || (number(x.amount) * rate / 100)),
      status: clean(x.status || "PENDING_PAYMENT").toUpperCase(),
      paidAt: x.paidAt || ""
    });
  }

  for (const booking of bookingRows) {
    const existing = merged.find((x) => clean(x.bookingRef) === clean(booking.bookingRef));
    if (existing) continue;

    const status = clean(booking.status || "PENDING_PAYMENT").toUpperCase();
    const amount = money(booking.amount);
    merged.push({
      source: "booking",
      createdAt: booking.createdAt || "",
      bookingRef: clean(booking.bookingRef),
      hotelName: clean(booking.hotelName),
      customerEmail: clean(booking.customerEmail),
      amount,
      currency: clean(booking.currency || "GBP").toUpperCase(),
      commissionRate: rate,
      commissionAmount: money(amount * rate / 100),
      status,
      paidAt: booking.paidAt || ""
    });
  }

  const paidConversions = merged.filter((x) => clean(x.status).toUpperCase() === "PAID");
  const pendingConversions = merged.filter((x) => {
    const status = clean(x.status).toUpperCase();
    return status !== "PAID" && status !== "CANCELLED" && status !== "REFUNDED";
  });

  const payableCommission = money(paidConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const pendingCommission = money(pendingConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0));
  const paidBookingValue = money(paidConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const pendingBookingValue = money(pendingConversions.reduce((sum, x) => sum + number(x.amount), 0));
  const conversionRate = clicks.length > 0 ? money((paidConversions.length / clicks.length) * 100) : 0;

  return {
    affiliate: {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      commissionRate: rate,
      minimumPayout,
      payoutSchedule: "Monthly",
      createdAt: affiliate.createdAt
    },
    summary: {
      clicks: clicks.length,
      paidBookings: paidConversions.length,
      pendingBookings: pendingConversions.length,
      conversionRatePercent: conversionRate,
      paidBookingValue,
      pendingBookingValue,
      payableCommission,
      pendingCommission,
      lifetimeCommission: money(payableCommission + pendingCommission),
      nextPayoutThreshold: minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - payableCommission))
    },
    recentClicks: clicks.slice(0, 25),
    bookings: merged.slice(0, 100)
  };
}

app.get("/api/affiliate-portal/dashboard-v2", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Affiliate account not found." });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({ ok: false, message: "Affiliate account is not approved yet." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);

  res.json({
    ok: true,
    generatedAt: nowISO(),
    ...dashboard
  });
});
// MSH AFFILIATE PORTAL BOOKING FALLBACK END

// MSH AFFILIATE PAYOUT CENTRE START
const AFFILIATE_PAYOUTS_FILE = path.join(DATA_DIR, "affiliate_payouts.json");
ensureFile(AFFILIATE_PAYOUTS_FILE, []);

function affiliatePayoutSummary(affiliateCode) {
  const code = clean(affiliateCode).toUpperCase();
  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []).filter((x) => clean(x.affiliateCode).toUpperCase() === code);
  const paidTotal = money(payouts.filter((x) => clean(x.status).toUpperCase() === "PAID").reduce((sum, x) => sum + number(x.amount), 0));
  const pendingPayoutTotal = money(payouts.filter((x) => clean(x.status).toUpperCase() !== "PAID").reduce((sum, x) => sum + number(x.amount), 0));

  return {
    paidTotal,
    pendingPayoutTotal,
    payouts: payouts.slice(0, 100)
  };
}

app.get("/api/affiliate-portal/payout-centre", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === email &&
    clean(x.affiliateCode).toUpperCase() === affiliateCode
  );

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Affiliate account not found." });
  }

  if (clean(affiliate.status).toUpperCase() !== "APPROVED") {
    return res.status(403).json({ ok: false, message: "Affiliate account is not approved yet." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);
  const payout = affiliatePayoutSummary(affiliateCode);
  const available = money(dashboard.summary.payableCommission - payout.pendingPayoutTotal - payout.paidTotal);
  const minimumPayout = 50;

  res.json({
    ok: true,
    generatedAt: nowISO(),
    affiliate: dashboard.affiliate,
    payoutCentre: {
      availableCommission: available,
      minimumPayout,
      amountNeededForPayout: money(Math.max(0, minimumPayout - available)),
      eligibleForPayout: available >= minimumPayout,
      nextScheduledPayout: "Monthly payout review",
      paymentMethod: "Bank transfer after approval",
      paidTotal: payout.paidTotal,
      pendingPayoutTotal: payout.pendingPayoutTotal,
      payoutHistory: payout.payouts
    }
  });
});

app.post("/api/internal/affiliate-payouts/create", (req, res) => {
  const affiliateCode = clean(req.body.affiliateCode).toUpperCase();
  const amount = money(req.body.amount);
  const currency = clean(req.body.currency || "GBP").toUpperCase();
  const note = clean(req.body.note || "Affiliate payout review");

  if (!affiliateCode || amount <= 0) {
    return res.status(400).json({ ok: false, message: "affiliateCode and amount are required." });
  }

  const affiliate = readAffiliates().find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  if (!affiliate) {
    return res.status(404).json({ ok: false, message: "Affiliate not found." });
  }

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  const payout = {
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    amount,
    currency,
    status: "PENDING_REVIEW",
    note
  };

  payouts.unshift(payout);
  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts);

  res.json({ ok: true, payout });
});

app.post("/api/internal/affiliate-payouts/mark-paid", (req, res) => {
  const payoutId = clean(req.body.payoutId);
  const paymentReference = clean(req.body.paymentReference || "MANUAL-PAYOUT");

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  const index = payouts.findIndex((x) => clean(x.id) === payoutId);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout not found." });
  }

  payouts[index] = {
    ...payouts[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference
  };

  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts);

  res.json({ ok: true, payout: payouts[index] });
});
// MSH AFFILIATE PAYOUT CENTRE END

// MSH AFFILIATE PHASE 2 START
const AFFILIATE_PAYMENT_DETAILS_FILE = path.join(DATA_DIR, "affiliate_payment_details.json");
const AFFILIATE_PAYOUT_REQUESTS_FILE = path.join(DATA_DIR, "affiliate_payout_requests.json");

ensureFile(AFFILIATE_PAYMENT_DETAILS_FILE, []);
ensureFile(AFFILIATE_PAYOUT_REQUESTS_FILE, []);

function findApprovedAffiliateByLogin(email, affiliateCode) {
  const mail = clean(email).toLowerCase();
  const code = clean(affiliateCode).toUpperCase();

  const affiliate = readAffiliates().find((x) =>
    clean(x.email).toLowerCase() === mail &&
    clean(x.affiliateCode).toUpperCase() === code
  );

  if (!affiliate) return null;
  if (clean(affiliate.status).toUpperCase() !== "APPROVED") return null;

  return affiliate;
}

app.get("/api/affiliate-portal/payment-details", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const rows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const details = rows.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode) || null;

  res.json({
    ok: true,
    affiliateCode,
    paymentDetails: details
      ? {
          paymentMethod: details.paymentMethod,
          accountName: details.accountName,
          bankName: details.bankName,
          sortCodeLast2: clean(details.sortCode).slice(-2),
          accountNumberLast4: clean(details.accountNumber).slice(-4),
          paypalEmail: details.paypalEmail,
          updatedAt: details.updatedAt || details.createdAt
        }
      : null
  });
});

app.post("/api/affiliate-portal/payment-details", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const paymentMethod = clean(req.body.paymentMethod || "BANK_TRANSFER").toUpperCase();
  const accountName = clean(req.body.accountName);
  const bankName = clean(req.body.bankName);
  const sortCode = clean(req.body.sortCode);
  const accountNumber = clean(req.body.accountNumber);
  const paypalEmail = clean(req.body.paypalEmail);

  if (paymentMethod === "BANK_TRANSFER" && (!accountName || !bankName || !sortCode || !accountNumber)) {
    return res.status(400).json({
      ok: false,
      message: "Please provide account name, bank name, sort code and account number."
    });
  }

  if (paymentMethod === "PAYPAL" && !paypalEmail) {
    return res.status(400).json({
      ok: false,
      message: "Please provide PayPal email address."
    });
  }

  const rows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const index = rows.findIndex((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  const row = {
    id: index >= 0 ? rows[index].id : crypto.randomUUID(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    paymentMethod,
    accountName,
    bankName,
    sortCode,
    accountNumber,
    paypalEmail,
    updatedAt: nowISO(),
    createdAt: index >= 0 ? rows[index].createdAt : nowISO()
  };

  if (index >= 0) rows[index] = row;
  else rows.unshift(row);

  writeJSON(AFFILIATE_PAYMENT_DETAILS_FILE, rows.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payment details saved.",
    paymentDetails: {
      paymentMethod: row.paymentMethod,
      accountName: row.accountName,
      bankName: row.bankName,
      sortCodeLast2: row.sortCode.slice(-2),
      accountNumberLast4: row.accountNumber.slice(-4),
      paypalEmail: row.paypalEmail,
      updatedAt: row.updatedAt
    }
  });
});

app.post("/api/affiliate-portal/request-payout", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const affiliateCode = clean(req.body.affiliateCode || req.body.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const dashboard = buildAffiliatePortalDashboard(affiliate);
  const payout = affiliatePayoutSummary(affiliateCode);
  const availableCommission = money(dashboard.summary.payableCommission - payout.pendingPayoutTotal - payout.paidTotal);
  const minimumPayout = 50;

  if (availableCommission < minimumPayout) {
    return res.status(400).json({
      ok: false,
      message: `Payout can be requested once available commission reaches GBP ${minimumPayout}.`,
      availableCommission,
      minimumPayout
    });
  }

  const paymentRows = readJSON(AFFILIATE_PAYMENT_DETAILS_FILE, []);
  const paymentDetails = paymentRows.find((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode);

  if (!paymentDetails) {
    return res.status(400).json({
      ok: false,
      message: "Please save payment details before requesting payout."
    });
  }

  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const openRequest = requests.find((x) =>
    clean(x.affiliateCode).toUpperCase() === affiliateCode &&
    ["PENDING_REVIEW", "APPROVED"].includes(clean(x.status).toUpperCase())
  );

  if (openRequest) {
    return res.status(400).json({
      ok: false,
      message: "You already have an open payout request.",
      payoutRequest: openRequest
    });
  }

  const payoutRequest = {
    id: crypto.randomUUID(),
    requestReference: makeRef("PAYOUT"),
    createdAt: nowISO(),
    affiliateCode,
    businessName: affiliate.businessName,
    contactName: affiliate.contactName,
    email: affiliate.email,
    amount: availableCommission,
    currency: "GBP",
    status: "PENDING_REVIEW",
    paymentMethod: paymentDetails.paymentMethod,
    note: clean(req.body.note || "Affiliate payout requested from portal.")
  };

  requests.unshift(payoutRequest);
  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payout request submitted for review.",
    payoutRequest
  });
});

app.get("/api/affiliate-portal/payout-requests", (req, res) => {
  const email = clean(req.query.email).toLowerCase();
  const affiliateCode = clean(req.query.affiliateCode || req.query.code).toUpperCase();
  const affiliate = findApprovedAffiliateByLogin(email, affiliateCode);

  if (!affiliate) {
    return res.status(401).json({ ok: false, message: "Approved affiliate account not found." });
  }

  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, [])
    .filter((x) => clean(x.affiliateCode).toUpperCase() === affiliateCode)
    .slice(0, 100);

  res.json({
    ok: true,
    affiliateCode,
    payoutRequests: requests
  });
});

app.get("/api/internal/affiliate-payout-requests", (req, res) => {
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  res.json({
    ok: true,
    generatedAt: nowISO(),
    total: requests.length,
    pending: requests.filter((x) => clean(x.status).toUpperCase() === "PENDING_REVIEW").length,
    approved: requests.filter((x) => clean(x.status).toUpperCase() === "APPROVED").length,
    paid: requests.filter((x) => clean(x.status).toUpperCase() === "PAID").length,
    rejected: requests.filter((x) => clean(x.status).toUpperCase() === "REJECTED").length,
    payoutRequests: requests.slice(0, 300)
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/approve", (req, res) => {
  const id = clean(req.params.id);
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "APPROVED",
    approvedAt: nowISO(),
    adminNote: clean(req.body.note || "")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  res.json({
    ok: true,
    message: "Payout request approved.",
    payoutRequest: requests[index]
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/mark-paid", (req, res) => {
  const id = clean(req.params.id);
  const paymentReference = clean(req.body.paymentReference || "MANUAL-PAYOUT");
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "PAID",
    paidAt: nowISO(),
    paymentReference,
    adminNote: clean(req.body.note || requests[index].adminNote || "")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  const payouts = readJSON(AFFILIATE_PAYOUTS_FILE, []);
  payouts.unshift({
    id: crypto.randomUUID(),
    createdAt: nowISO(),
    affiliateCode: requests[index].affiliateCode,
    businessName: requests[index].businessName,
    contactName: requests[index].contactName,
    email: requests[index].email,
    amount: money(requests[index].amount),
    currency: requests[index].currency || "GBP",
    status: "PAID",
    paidAt: nowISO(),
    paymentReference,
    sourceRequestId: requests[index].id,
    sourceRequestReference: requests[index].requestReference,
    note: "Paid from affiliate payout request."
  });
  writeJSON(AFFILIATE_PAYOUTS_FILE, payouts.slice(0, 5000));

  res.json({
    ok: true,
    message: "Payout request marked as paid.",
    payoutRequest: requests[index]
  });
});

app.post("/api/internal/affiliate-payout-requests/:id/reject", (req, res) => {
  const id = clean(req.params.id);
  const requests = readJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, []);
  const index = requests.findIndex((x) => clean(x.id) === id || clean(x.requestReference) === id);

  if (index < 0) {
    return res.status(404).json({ ok: false, message: "Payout request not found." });
  }

  requests[index] = {
    ...requests[index],
    status: "REJECTED",
    rejectedAt: nowISO(),
    adminNote: clean(req.body.note || "Rejected after review.")
  };

  writeJSON(AFFILIATE_PAYOUT_REQUESTS_FILE, requests);

  res.json({
    ok: true,
    message: "Payout request rejected.",
    payoutRequest: requests[index]
  });
});
// MSH AFFILIATE PHASE 2 END

app.get("/api/internal/affiliate-dashboard", (req, res) => {
  const affiliates = readAffiliates();
  const clicks = readJSON(AFFILIATE_CLICKS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const stats = affiliates.map((affiliate) => {
    const code = clean(affiliate.affiliateCode).toUpperCase();
    const affiliateClicks = clicks.filter((x) => clean(x.affiliateCode).toUpperCase() === code);
    const affiliateConversions = conversions.filter((x) => clean(x.affiliateCode).toUpperCase() === code);

    return {
      affiliateCode: affiliate.affiliateCode,
      businessName: affiliate.businessName,
      contactName: affiliate.contactName,
      email: affiliate.email,
      status: affiliate.status,
      referralLink: affiliate.referralLink,
      clicks: affiliateClicks.length,
      conversions: affiliateConversions.length,
      totalBookingValue: money(affiliateConversions.reduce((sum, x) => sum + number(x.amount), 0)),
      totalCommission: money(affiliateConversions.reduce((sum, x) => sum + number(x.commissionAmount), 0)),
      currency: affiliateConversions[0]?.currency || "GBP",
      createdAt: affiliate.createdAt
    };
  });

  res.json({
    ok: true,
    generatedAt: nowISO(),
    totals: {
      affiliates: affiliates.length,
      clicks: clicks.length,
      conversions: conversions.length,
      pendingApplications: affiliates.filter((x) => x.status === "PENDING_REVIEW").length
    },
    stats,
    recentClicks: clicks.slice(0, 50),
    recentConversions: conversions.slice(0, 50)
  });
});
// MSH AFFILIATE NETWORK END

// MSH BOOKING FINANCE DASHBOARD START
function estimateStripeFee(amount, currency) {
  const value = money(amount);
  const ccy = clean(currency || "GBP").toUpperCase();

  const percent = ccy === "GBP" ? 0.015 : 0.025;
  const fixed = ccy === "GBP" ? 0.20 : 0.25;

  return money((value * percent) + fixed);
}

function estimateSupplierCost(booking) {
  const customerAmount = money(booking.amount);
  const supplierCost = money(customerAmount * 0.85);
  return supplierCost;
}

function affiliateCommissionForBooking(booking, conversions) {
  const ref = clean(booking.bookingRef);
  const conversion = conversions.find((x) => clean(x.bookingRef) === ref);

  if (!conversion) {
    return {
      affiliateCode: "",
      status: "NONE",
      commissionRate: 0,
      commissionAmount: 0,
      payableCommission: 0,
      pendingCommission: 0
    };
  }

  const status = clean(conversion.status).toUpperCase();
  const amount = money(conversion.commissionAmount);

  return {
    affiliateCode: clean(conversion.affiliateCode),
    status,
    commissionRate: number(conversion.commissionRate),
    commissionAmount: amount,
    payableCommission: status === "PAID" ? amount : 0,
    pendingCommission: status === "PAID" ? 0 : amount
  };
}

function supplierForBooking(booking) {
  const tracking = booking.internalSupplierTracking || {};
  const supplier = typeof resolveSupplierForAdmin === "function"
    ? resolveSupplierForAdmin(tracking)
    : {
        supplier_code: clean(tracking.supplier_code || tracking.supplier_name || "UNKNOWN"),
        supplier_name: clean(tracking.supplier_name || tracking.supplier_code || "Unknown"),
        supplier_type: "unknown",
        status: "unknown"
      };

  return supplier;
}

app.get("/api/internal/booking-finance-dashboard", (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE, []);
  const conversions = readJSON(AFFILIATE_CONVERSIONS_FILE, []);

  const rows = bookings.map((booking) => {
    const customerPaid = money(booking.amount);
    const currency = clean(booking.currency || "GBP").toUpperCase();
    const supplierCost = estimateSupplierCost(booking);
    const stripeFee = estimateStripeFee(customerPaid, currency);
    const affiliate = affiliateCommissionForBooking(booking, conversions);
    const payableAffiliate = money(affiliate.payableCommission);
    const estimatedMargin = money(customerPaid - supplierCost - stripeFee - payableAffiliate);
    const supplier = supplierForBooking(booking);

    return {
      bookingRef: booking.bookingRef,
      confirmationReference: booking.confirmationReference,
      status: booking.status,
      createdAt: booking.createdAt,
      paidAt: booking.paidAt || "",
      hotelId: booking.hotelId,
      hotelName: booking.hotelName,
      country: booking.country,
      city: booking.city,
      customerEmail: booking.customerEmail,

      currency,
      customerPaid,
      supplierCostEstimate: supplierCost,
      stripeFeeEstimate: stripeFee,

      affiliateCode: affiliate.affiliateCode,
      affiliateStatus: affiliate.status,
      affiliateCommissionRate: affiliate.commissionRate,
      affiliateCommissionTotal: affiliate.commissionAmount,
      affiliateCommissionPayable: affiliate.payableCommission,
      affiliateCommissionPending: affiliate.pendingCommission,

      myspaceEstimatedMargin: estimatedMargin,
      myspaceEstimatedMarginPercent: customerPaid > 0 ? money((estimatedMargin / customerPaid) * 100) : 0,

      supplier,
      rate_source_id: booking.rate_source_id || booking.internalSupplierTracking?.rate_source_id || "",
      rate_source_timestamp: booking.rate_source_timestamp || booking.internalSupplierTracking?.rate_source_timestamp || ""
    };
  });

  const totals = rows.reduce((acc, row) => {
    acc.bookings += 1;
    acc.customerPaid += row.customerPaid;
    acc.supplierCostEstimate += row.supplierCostEstimate;
    acc.stripeFeeEstimate += row.stripeFeeEstimate;
    acc.affiliateCommissionPayable += row.affiliateCommissionPayable;
    acc.affiliateCommissionPending += row.affiliateCommissionPending;
    acc.myspaceEstimatedMargin += row.myspaceEstimatedMargin;
    if (row.status === "PAID") acc.paidBookings += 1;
    if (row.status === "PENDING_PAYMENT") acc.pendingBookings += 1;
    if (row.status === "CANCELLED") acc.cancelledBookings += 1;
    return acc;
  }, {
    bookings: 0,
    paidBookings: 0,
    pendingBookings: 0,
    cancelledBookings: 0,
    customerPaid: 0,
    supplierCostEstimate: 0,
    stripeFeeEstimate: 0,
    affiliateCommissionPayable: 0,
    affiliateCommissionPending: 0,
    myspaceEstimatedMargin: 0
  });

  for (const key of Object.keys(totals)) {
    if (typeof totals[key] === "number") totals[key] = money(totals[key]);
  }

  res.json({
    ok: true,
    generatedAt: nowISO(),
    rule: "Finance dashboard estimates margin. Replace supplier cost and Stripe fee with exact settlement values when available.",
    totals,
    bookings: rows.slice(0, 200)
  });
});
// MSH BOOKING FINANCE DASHBOARD END

app.get("/api/certification/logs", (req, res) => {
  res.json({
    ok: true,
    message: "Service activity records are available.",
    logs: readJSON(SERVICE_ACTIVITY_FILE, [])
  });
});

// MSH ANCILLARY REVENUE STREAMS START
const INSURANCE_BOOKINGS_FILE = path.join(DATA_DIR, "travel_insurance_bookings.json");
const TRANSFER_BOOKINGS_FILE = path.join(DATA_DIR, "airport_transfer_bookings.json");
const ATTRACTION_BOOKINGS_FILE = path.join(DATA_DIR, "attraction_bookings.json");
const FEATURED_HOTELS_FILE = path.join(DATA_DIR, "featured_hotel_advertising.json");

ensureFile(INSURANCE_BOOKINGS_FILE, []);
ensureFile(TRANSFER_BOOKINGS_FILE, []);
ensureFile(ATTRACTION_BOOKINGS_FILE, []);
ensureFile(FEATURED_HOTELS_FILE, []);

function ancillaryRef(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function ancillaryCommission(amount, rate) {
  return money(number(amount) * number(rate) / 100);
}

app.get("/api/insurance/options", (req, res) => {
  const destination = clean(req.query.destination || req.query.city || "your trip");
  const tripTotal = money(req.query.tripTotal || req.query.total || 0);
  const base = tripTotal > 0 ? Math.max(12, tripTotal * 0.06) : 24;

  res.json({
    ok: true,
    destination,
    options: [
      {
        id: "single-trip-standard",
        name: "Single Trip Standard",
        description: "Trip cancellation, travel disruption and emergency support cover.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: true
      },
      {
        id: "family-trip-cover",
        name: "Family Trip Cover",
        description: "Flexible travel protection for families travelling together.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: false
      },
      {
        id: "business-travel-cover",
        name: "Business Travel Cover",
        description: "Travel protection designed for business and corporate trips.",
        price: 0,
        currency: "GBP",
        commissionRate: 25,
        recommended: false
      }
    ]
  });
});

app.post("/api/insurance/book", async (req, res) => {
  const rows = readJSON(INSURANCE_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 25);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("INS"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    destination: clean(req.body.destination || req.body.city),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    productId: clean(req.body.productId),
    productName: clean(req.body.productName || "Travel Insurance"),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(INSURANCE_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New travel insurance request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", row.destination],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Product", row.productName],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Travel insurance request received.",
    insurance: row
  });
});

app.get("/api/transfers/search", (req, res) => {
  const city = clean(req.query.city || "Destination");
  const currency = clean(req.query.currency || "GBP").toUpperCase();

  res.json({
    ok: true,
    city,
    currency,
    options: [
      {
        id: "airport-standard",
        name: "Standard Airport Transfer",
        description: `Private transfer between the airport and your hotel in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "1-3"
      },
      {
        id: "airport-family",
        name: "Family / Group Transfer",
        description: `Larger vehicle for families, groups and luggage in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "4-7"
      },
      {
        id: "airport-executive",
        name: "Executive Transfer",
        description: `Premium transfer option for business and comfort travel in ${city}.`,
        price: 0,
        currency,
        commissionRate: 18,
        passengers: "1-3"
      }
    ]
  });
});

app.post("/api/transfers/book", async (req, res) => {
  const rows = readJSON(TRANSFER_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 18);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("TRF"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    city: clean(req.body.city),
    country: clean(req.body.country),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    transferType: clean(req.body.transferType || req.body.productName || "Airport Transfer"),
    pickup: clean(req.body.pickup || "Airport"),
    dropoff: clean(req.body.dropoff || req.body.hotelName || "Hotel"),
    travelDate: clean(req.body.travelDate),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(TRANSFER_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New airport transfer request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Transfer", row.transferType],
    ["Route", `${row.pickup} to ${row.dropoff}`],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Airport transfer request received.",
    transfer: row
  });
});

app.get("/api/attractions", (req, res) => {
  const city = clean(req.query.city || "Destination");
  const currency = clean(req.query.currency || "GBP").toUpperCase();

  res.json({
    ok: true,
    city,
    currency,
    attractions: [
      {
        id: "city-tour",
        name: `${city} City Tour`,
        category: "Sightseeing",
        description: "A customer-friendly city tour option for discovering the destination.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "museum-culture-pass",
        name: "Museums and Culture Pass",
        category: "Culture",
        description: "A useful option for museums, galleries and cultural attractions.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "family-attractions",
        name: "Family Attractions",
        category: "Family",
        description: "Family-friendly attractions such as parks, zoos and visitor experiences.",
        price: 0,
        currency,
        commissionRate: 15
      },
      {
        id: "evening-experience",
        name: "Evening Experience",
        category: "Experience",
        description: "Evening activity suggestions for customers who want more from their trip.",
        price: 0,
        currency,
        commissionRate: 15
      }
    ]
  });
});

app.post("/api/attractions/book", async (req, res) => {
  const rows = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  const amount = money(req.body.amount || req.body.price || 0);
  const commissionRate = number(req.body.commissionRate || 15);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("ACT"),
    createdAt: nowISO(),
    bookingRef: clean(req.body.bookingRef),
    hotelName: clean(req.body.hotelName),
    city: clean(req.body.city),
    country: clean(req.body.country),
    customerName: clean(req.body.customerName),
    customerEmail: clean(req.body.customerEmail),
    attractionId: clean(req.body.attractionId),
    attractionName: clean(req.body.attractionName || "Tours and Attractions"),
    category: clean(req.body.category),
    travelDate: clean(req.body.travelDate),
    guests: number(req.body.guests || 1),
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    commissionRate,
    commissionAmount: ancillaryCommission(amount, commissionRate),
    status: "REQUESTED"
  };

  rows.unshift(row);
  writeJSON(ATTRACTION_BOOKINGS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New tours and attractions request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel booking", row.bookingRef],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Customer", row.customerName],
    ["Email", row.customerEmail],
    ["Attraction", row.attractionName],
    ["Guests", String(row.guests)],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Commission estimate", `${row.currency} ${row.commissionAmount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Tours and attractions request received.",
    attractionBooking: row
  });
});

app.post("/api/hotels/feature", async (req, res) => {
  const rows = readJSON(FEATURED_HOTELS_FILE, []);
  const packageName = clean(req.body.packageName || "Bronze").toUpperCase();
  const amountMap = { BRONZE: 49, SILVER: 99, GOLD: 199, PLATINUM: 499 };
  const amount = money(req.body.amount || amountMap[packageName] || 49);

  const row = {
    id: crypto.randomUUID(),
    reference: ancillaryRef("AD"),
    createdAt: nowISO(),
    hotelName: clean(req.body.hotelName),
    country: clean(req.body.country),
    city: clean(req.body.city),
    contactName: clean(req.body.contactName),
    contactEmail: clean(req.body.contactEmail),
    phone: clean(req.body.phone),
    website: clean(req.body.website),
    packageName,
    amount,
    currency: clean(req.body.currency || "GBP").toUpperCase(),
    status: "PENDING_REVIEW",
    notes: clean(req.body.notes)
  };

  rows.unshift(row);
  writeJSON(FEATURED_HOTELS_FILE, rows.slice(0, 5000));

  await sendEmailNotification("New featured hotel advertising request - MySpace Hotel", [
    ["Reference", row.reference],
    ["Hotel", row.hotelName],
    ["Destination", `${row.city}, ${row.country}`],
    ["Contact", row.contactName],
    ["Email", row.contactEmail],
    ["Package", row.packageName],
    ["Amount", `${row.currency} ${row.amount}`],
    ["Created", row.createdAt]
  ]);

  res.json({
    ok: true,
    message: "Featured hotel advertising request received.",
    featuredHotel: row
  });
});

app.get("/api/internal/ancillary-dashboard", (req, res) => {
  const insurance = readJSON(INSURANCE_BOOKINGS_FILE, []);
  const transfers = readJSON(TRANSFER_BOOKINGS_FILE, []);
  const attractions = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  const featured = readJSON(FEATURED_HOTELS_FILE, []);

  function totals(rows) {
    return rows.reduce((acc, x) => {
      acc.count += 1;
      acc.revenue += money(x.amount);
      acc.commission += money(x.commissionAmount || x.amount);
      return acc;
    }, { count: 0, revenue: 0, commission: 0 });
  }

  const data = {
    insurance: totals(insurance),
    transfers: totals(transfers),
    attractions: totals(attractions),
    featuredHotels: totals(featured)
  };

  const totalRevenue = money(data.insurance.revenue + data.transfers.revenue + data.attractions.revenue + data.featuredHotels.revenue);
  const totalCommission = money(data.insurance.commission + data.transfers.commission + data.attractions.commission + data.featuredHotels.commission);

  res.json({
    ok: true,
    generatedAt: nowISO(),
    totals: {
      totalRevenue,
      totalCommission,
      requests: data.insurance.count + data.transfers.count + data.attractions.count + data.featuredHotels.count
    },
    streams: data,
    latest: {
      insurance: insurance.slice(0, 25),
      transfers: transfers.slice(0, 25),
      attractions: attractions.slice(0, 25),
      featuredHotels: featured.slice(0, 25)
    }
  });
});

app.get("/api/internal/insurance-dashboard", (req, res) => {
  const rows = readJSON(INSURANCE_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, insuranceBookings: rows });
});

app.get("/api/internal/transfer-dashboard", (req, res) => {
  const rows = readJSON(TRANSFER_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, transferBookings: rows });
});

app.get("/api/internal/attraction-dashboard", (req, res) => {
  const rows = readJSON(ATTRACTION_BOOKINGS_FILE, []);
  res.json({ ok: true, total: rows.length, attractionBookings: rows });
});

app.get("/api/internal/advertising-dashboard", (req, res) => {
  const rows = readJSON(FEATURED_HOTELS_FILE, []);
  res.json({ ok: true, total: rows.length, featuredHotels: rows });
});
// MSH ANCILLARY REVENUE STREAMS END

// MSH REAL ANCILLARY EMAIL ROUTES START
const MSH_ANCILLARY_DIR = path.join(__dirname, "data");
const MSH_ANCILLARY_INSURANCE_FILE = path.join(MSH_ANCILLARY_DIR, "travel_insurance_leads.json");
const MSH_ANCILLARY_TRANSFER_FILE = path.join(MSH_ANCILLARY_DIR, "airport_transfer_leads.json");
const MSH_ANCILLARY_ATTRACTION_FILE = path.join(MSH_ANCILLARY_DIR, "attraction_leads.json");
const MSH_ANCILLARY_FEATURED_FILE = path.join(MSH_ANCILLARY_DIR, "hotel_partner_visibility_leads.json");

function mshEnsureJson(file, fallback) {
  try {
    if (!fs.existsSync(MSH_ANCILLARY_DIR)) fs.mkdirSync(MSH_ANCILLARY_DIR, { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2), "utf8");
  } catch (err) {
    console.error("MSH ensure json failed:", err.message);
  }
}

function mshReadJson(file, fallback) {
  try {
    mshEnsureJson(file, fallback);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function mshWriteJson(file, data) {
  mshEnsureJson(file, []);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function mshClean(v) {
  return String(v || "").trim();
}

function mshLeadRef(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
}

async function mshSendAncillaryEmail(subject, lead) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM ||
    process.env.SMTP_FROM ||
    process.env.RESERVATIONS_EMAIL ||
    "reservations@myspace-hotel.com";

  const to =
    process.env.RESERVATIONS_EMAIL ||
    process.env.EMAIL_TO ||
    process.env.SMTP_FROM ||
    "reservations@myspace-hotel.com";

  const rows = Object.entries(lead)
    .map(([key, value]) => `<tr><td style="padding:8px;border:1px solid #ddd;font-weight:bold;">${key}</td><td style="padding:8px;border:1px solid #ddd;">${String(value || "")}</td></tr>`)
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0b1d51;">
      <h2>${subject}</h2>
      <p>A new MySpace Hotel customer or partner request has been received.</p>
      <table style="border-collapse:collapse;width:100%;max-width:800px;">${rows}</table>
    </div>
  `;

  if (!apiKey) {
    console.error("MSH ancillary email not sent: RESEND_API_KEY missing.");
    return { sent: false, reason: "RESEND_API_KEY missing" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html
    })
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("MSH ancillary email failed:", response.status, text);
    return { sent: false, reason: text };
  }

  return { sent: true, provider: "resend" };
}

app.post("/api/ancillary/insurance/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_INSURANCE_FILE, []);
  const lead = {
    reference: mshLeadRef("INS"),
    createdAt: new Date().toISOString(),
    type: "Trip Protection Quote Request",
    hotelName: mshClean(req.body.hotelName),
    destination: mshClean(req.body.destination),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    productName: mshClean(req.body.productName),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_INSURANCE_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Trip Protection Quote Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Trip protection request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/transfers/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_TRANSFER_FILE, []);
  const lead = {
    reference: mshLeadRef("TRF"),
    createdAt: new Date().toISOString(),
    type: "Airport Transfer Quote Request",
    hotelName: mshClean(req.body.hotelName),
    city: mshClean(req.body.city),
    country: mshClean(req.body.country),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    transferType: mshClean(req.body.transferType),
    pickup: mshClean(req.body.pickup),
    dropoff: mshClean(req.body.dropoff),
    travelDate: mshClean(req.body.travelDate),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_TRANSFER_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Airport Transfer Quote Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Airport transfer request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/attractions/book", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_ATTRACTION_FILE, []);
  const lead = {
    reference: mshLeadRef("ACT"),
    createdAt: new Date().toISOString(),
    type: "Things To Do Availability Request",
    hotelName: mshClean(req.body.hotelName),
    city: mshClean(req.body.city),
    country: mshClean(req.body.country),
    customerName: mshClean(req.body.customerName),
    customerEmail: mshClean(req.body.customerEmail),
    attractionName: mshClean(req.body.attractionName),
    category: mshClean(req.body.category),
    travelDate: mshClean(req.body.travelDate),
    guests: mshClean(req.body.guests),
    status: "REQUEST_RECEIVED_PRICE_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_ATTRACTION_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Things To Do Availability Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Things to do request received.", lead, emailSent: email.sent });
});

app.post("/api/ancillary/hotels/feature", async (req, res) => {
  const leads = mshReadJson(MSH_ANCILLARY_FEATURED_FILE, []);
  const lead = {
    reference: mshLeadRef("HOTEL"),
    createdAt: new Date().toISOString(),
    type: "Hotel Partner Visibility Request",
    hotelName: mshClean(req.body.hotelName),
    country: mshClean(req.body.country),
    city: mshClean(req.body.city),
    contactName: mshClean(req.body.contactName),
    contactEmail: mshClean(req.body.contactEmail),
    phone: mshClean(req.body.phone),
    website: mshClean(req.body.website),
    packageName: mshClean(req.body.packageName),
    status: "REQUEST_RECEIVED_COMMERCIAL_TERMS_NOT_CONFIRMED"
  };

  leads.unshift(lead);
  mshWriteJson(MSH_ANCILLARY_FEATURED_FILE, leads.slice(0, 5000));

  const email = await mshSendAncillaryEmail("New Hotel Partner Visibility Request - MySpace Hotel", lead);
  res.json({ ok: true, message: "Hotel partner request received.", lead, emailSent: email.sent });
});
// MSH REAL ANCILLARY EMAIL ROUTES END

// MSH RATEHAWK SANDBOX CONNECTOR (REPLACEMENT)
function ratehawkConfig() {
  const enabled = String(process.env.RATEHAWK_ENABLED || "").toLowerCase() === "true";
  const baseUrl = clean(process.env.RATEHAWK_BASE_URL || "https://api-sandbox.worldota.net").replace(/\/$/, "");
  const keyId = clean(process.env.RATEHAWK_KEY_ID);
  const keyToken = clean(process.env.RATEHAWK_KEY_TOKEN);
  const userAgent = clean(process.env.RATEHAWK_USER_AGENT || "MySpaceHotel/1.0");
  const env = clean(process.env.RATEHAWK_ENV || "sandbox");

  return {
    enabled,
    env,
    baseUrl,
    keyId,
    keyToken,
    userAgent,
    ready: Boolean(enabled && baseUrl && keyId && keyToken)
  };
}

function ratehawkAuthHeader() {
  const cfg = ratehawkConfig();
  return `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keyToken}`).toString("base64")}`;
}

async function ratehawkPost(pathname, body) {
  const cfg = ratehawkConfig();

  if (!cfg.ready) {
    return {
      ok: false,
      status: 400,
      data: {
        message: "RateHawk is not configured. Check RATEHAWK_ENABLED, RATEHAWK_BASE_URL, RATEHAWK_KEY_ID and RATEHAWK_KEY_TOKEN."
      }
    };
  }

  const url = `${cfg.baseUrl}${pathname}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: ratehawkAuthHeader(),
      "Content-Type": "application/json",
      "User-Agent": cfg.userAgent
    },
    body: JSON.stringify(body || {})
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 1000) };
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

async function ratehawkGet(pathname) {
  const cfg = ratehawkConfig();

  if (!cfg.ready) {
    return {
      ok: false,
      status: 400,
      data: { message: "RateHawk is not configured." }
    };
  }

  const url = `${cfg.baseUrl}${pathname}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: ratehawkAuthHeader(),
      Accept: "application/json",
      "User-Agent": cfg.userAgent
    }
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 1000) };
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

const MSH_RATEHAWK_REGION_CACHE = new Map();

function mshRatehawkRegionFromEnvMap(city) {
  const raw = clean(process.env.RATEHAWK_REGION_MAP || "");
  if (!raw) return 0;

  const key = clean(city).toLowerCase();

  // Try to find the exact city name in the raw string using regex (bypasses JSON.parse entirely)
  // Matches: "los angeles": 2438 OR los angeles: 2438
  const regex = new RegExp(`["']?(?:[a-z\\s]+\\|)?${key}["']?\\s*:\\s*(\\d+)`, "i");
  const match = raw.match(regex);

  if (match && match[1]) {
    return Number(match[1]);
  }

  return 0;
}

async function mshRatehawkResolveRegionId(query) {
  const direct = Number(
    query.ratehawkRegionId ||
    query.region_id ||
    query.regionId ||
    process.env.RATEHAWK_DEFAULT_REGION_ID ||
    0
  );
  if (direct > 0) return direct;

  const city = clean(query.city || "");
  if (!city) return 0;

  const envMapped = mshRatehawkRegionFromEnvMap(city);
  if (envMapped > 0) return envMapped;

  const cacheKey = city.toLowerCase();
  if (MSH_RATEHAWK_REGION_CACHE.has(cacheKey)) return MSH_RATEHAWK_REGION_CACHE.get(cacheKey);

  const cfg = ratehawkConfig();
  if (!cfg.ready) return 0;

  const attempt = async (pathname, payload) => {
    try {
      const res = await fetch(`${cfg.baseUrl}${pathname}`, {
        method: "POST",
        headers: {
          Authorization: ratehawkAuthHeader(),
          "Content-Type": "application/json",
          "User-Agent": cfg.userAgent
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        console.log(`[RATEHAWK-REGION] ${pathname} -> HTTP ${res.status}`);
        return null;
      }
      const data = await res.json().catch(() => ({}));
      return data;
    } catch (e) {
      console.log(`[RATEHAWK-REGION] ${pathname} error: ${e.message}`);
      return null;
    }
  };

  const wantedNorm = city.toLowerCase();

  const extractRegions = (data) => {
    if (!data) return [];
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.regions)) return data.regions;
    if (data.data && Array.isArray(data.data.regions)) return data.data.regions;
    if (Array.isArray(data.data?.data)) return data.data.data;
    return [];
  };

  const pickRegion = (regions) => {
    if (!Array.isArray(regions) || !regions.length) return 0;
    const normed = regions.map((r) => ({
      id: Number(r.region_id || r.id || 0),
      name: clean(r.name || r.title || r.label || "").toLowerCase()
    })).filter((r) => r.id > 0);

    const exact = normed.find((r) => r.name === wantedNorm);
    if (exact) return exact.id;

    const starts = normed.find((r) => r.name.startsWith(wantedNorm + " ") || r.name.startsWith(wantedNorm + ","));
    if (starts) return starts.id;

    const contains = normed.find((r) => r.name.includes(wantedNorm));
    if (contains) return contains.id;

    return normed[0] ? normed[0].id : 0;
  };

  let regionId = 0;

  const suggestPaths = [
    "/api/b2b/v3/hotel/region/suggest",
    "/api/b2b/v3/serp/regions/"
  ];

  for (const p of suggestPaths) {
    const data = await attempt(p, {
      language: "en",
      query: city,
      residency: clean(query.residency || "gb").toLowerCase(),
      region_types: ["City", "Region", "Country", "MultiCity"]
    });
    const regions = extractRegions(data);
    regionId = pickRegion(regions);
    if (regionId > 0) break;
  }

  console.log(`[RATEHAWK-REGION] "${city}" -> ${regionId || "none"}`);
  MSH_RATEHAWK_REGION_CACHE.set(cacheKey, regionId);
  return regionId;
}

app.get("/api/ratehawk/status", (req, res) => {
  const cfg = ratehawkConfig();

  res.json({
    ok: true,
    enabled: cfg.enabled,
    env: cfg.env,
    baseUrl: cfg.baseUrl,
    hasKeyId: Boolean(cfg.keyId),
    hasKeyToken: Boolean(cfg.keyToken),
    userAgent: cfg.userAgent,
    ready: cfg.ready,
    message: cfg.ready ? "RateHawk connector is configured." : "RateHawk connector is not ready."
  });
});

app.get("/api/ratehawk/test", async (req, res) => {
  try {
    const checkin = clean(req.query.checkin || req.query.checkIn || tomorrowISOForRatehawk(14));
    const checkout = clean(req.query.checkout || req.query.checkOut || tomorrowISOForRatehawk(15));
    const residency = clean(req.query.residency || "gb").toLowerCase();
    const language = clean(req.query.language || "en");
    const regionId = Number(req.query.region_id || req.query.regionId || process.env.RATEHAWK_DEFAULT_REGION_ID || 2011);

    const payload = {
      checkin,
      checkout,
      residency,
      language,
      guests: [
        {
          adults: 2,
          children: []
        }
      ],
      region_id: regionId,
      currency: "USD"
    };

    const result = await ratehawkPost("/api/b2b/v3/search/serp/region/", payload);

    try {
      recordActivity("ratehawk_test", {
        region_id: regionId,
        checkin,
        checkout,
        residency,
        language
      }, {
        ok: result.ok,
        status: result.status
      });
    } catch {}

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      status: result.status,
      request: {
        region_id: regionId,
        checkin,
        checkout,
        residency,
        language,
        currency: "USD"
      },
      result: result.data
    });
  } catch (err) {
    try { recordActivity("ratehawk_test_error", {}, { error: err.message, stack: err.stack }); } catch {}

    res.status(500).json({
      ok: false,
      message: "RateHawk test failed.",
      error: err.message, stack: err.stack
    });
  }
});

app.get("/api/ratehawk/region-lookup", async (req, res) => {
  try {
    const city = clean(req.query.city || "");
    if (!city) {
      return res.status(400).json({ ok: false, message: "city query parameter is required." });
    }
    const regionId = await mshRatehawkResolveRegionId({ city, residency: req.query.residency || "gb" });
    res.json({
      ok: true,
      city,
      regionId,
      found: regionId > 0,
      message: regionId > 0 ? "Region ID resolved." : "Could not resolve region. Check logs or set RATEHAWK_DEFAULT_REGION_ID / RATEHAWK_REGION_MAP."
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Region lookup failed.", error: err.message });
  }
});

function tomorrowISOForRatehawk(daysAhead) {
  const d = new Date(Date.now() + Number(daysAhead || 1) * 86400000);
  return d.toISOString().slice(0, 10);
}
// MSH RATEHAWK SANDBOX CONNECTOR END

// MSH WEBBEDS DOTW XML CONNECTOR START
function webbedsConfig() {
  const enabled = String(process.env.WEBBEDS_ENABLED || "true").toLowerCase() === "true";
  const baseUrl = clean(process.env.WEBBEDS_BASE_URL || "https://xmldev.dotwconnect.com/gatewayV4.dotw");
  const username = clean(process.env.WEBBEDS_USERNAME || process.env.WEBBEDS_USER);
  const password = clean(process.env.WEBBEDS_PASSWORD || process.env.WEBBEDS_PASS);
  const companyId = clean(process.env.WEBBEDS_COMPANY_ID || process.env.WEBBEDS_COMPANY_CODE);
  const source = clean(process.env.WEBBEDS_SOURCE || "1");

  return {
    enabled,
    env: clean(process.env.WEBBEDS_ENV || "sandbox"),
    baseUrl,
    username,
    password,
    companyId,
    source,
    userAgent: clean(process.env.WEBBEDS_USER_AGENT || "MySpaceHotel/1.0"),
    ready: Boolean(baseUrl && username && password && companyId)
  };
}

function webbedsMd5Password() {
  return crypto.createHash("md5").update(webbedsConfig().password).digest("hex");
}

function xmlEscapeValue(v) {
  return clean(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function webbedsDateISO(daysAhead) {
  const d = new Date(Date.now() + Number(daysAhead || 1) * 86400000);
  return d.toISOString().slice(0, 10);
}

function webbedsCustomerXml(innerXml) {
  const cfg = webbedsConfig();

  return `<customer>
  <username>${xmlEscapeValue(cfg.username)}</username>
  <password>${webbedsMd5Password()}</password>
  <id>${xmlEscapeValue(cfg.companyId)}</id>
  <source>${xmlEscapeValue(cfg.source)}</source>
  <product>hotel</product>
  ${innerXml}
</customer>`;
}

async function webbedsPostXml(xml) {
  const cfg = webbedsConfig();

  if (!cfg.ready) {
    return {
      ok: false,
      status: 400,
      text: "WebBeds is not configured. Check WEBBEDS_ENABLED, WEBBEDS_BASE_URL, WEBBEDS_USERNAME, WEBBEDS_PASSWORD and WEBBEDS_COMPANY_ID."
    };
  }

  const response = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "Accept-Encoding": "gzip",
      "Connection": "close",
      "User-Agent": cfg.userAgent
    },
    body: xml
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    text
  };
}

function buildWebbedsInternalCodeXml(command) {
  return webbedsCustomerXml(`<request command="${xmlEscapeValue(command)}"></request>`);
}

function positiveIntegerOrBlank(v) {
  const value = clean(v);
  return /^[1-9][0-9]*$/.test(value) ? value : "";
}

function buildWebbedsSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const cityId = positiveIntegerOrBlank(query.cityId || query.city_id || query.city);
  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id || query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id || query.passengerNationality);
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id || query.passengerCountryOfResidence);
  const adults = positiveIntegerOrBlank(query.adults || 2) || "2";

  if (!cityId || !currencyId || !nationalityId || !residenceId) {
    return {
      ok: false,
      message: "DOTW/WebBeds search requires numeric internal IDs, not names. Use /api/webbeds/internal-code/getallcities, /api/webbeds/internal-code/getcurrenciesids and /api/webbeds/internal-code/getallcountries first.",
      required: {
        cityId: "numeric DOTW city ID",
        currencyId: "numeric DOTW currency ID",
        nationalityId: "numeric DOTW country/nationality ID",
        residenceId: "numeric DOTW country/residence ID"
      },
      received: {
        city: clean(query.city || query.cityId || ""),
        currency: clean(query.currency || query.currencyId || ""),
        nationality: clean(query.nationality || query.nationalityId || query.passengerNationality || ""),
        residence: clean(query.residence || query.residenceId || query.passengerCountryOfResidence || "")
      }
    };
  }

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>${adults}</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:c="http://us.dotwconnect.com/xsd/complexCondition" xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition">
        <city>${cityId}</city>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/status", (req, res) => {
  const cfg = webbedsConfig();

  res.json({
    ok: true,
    enabled: cfg.enabled,
    env: cfg.env,
    baseUrl: cfg.baseUrl,
    hasUsername: Boolean(cfg.username),
    hasPassword: Boolean(cfg.password),
    hasCompanyId: Boolean(cfg.companyId),
    source: cfg.source,
    ready: cfg.ready,
    message: cfg.ready ? "WebBeds connector is configured." : "WebBeds connector is not ready."
  });
});

app.get("/api/webbeds/internal-code/:command", async (req, res) => {
  try {
    const allowed = new Set([
      "getallcities",
      "getallcountries",
      "getservingcities",
      "getservingcountries",
      "getcurrenciesids",
      "getlanguageids",
      "getleisureids",
      "getbusinessids",
      "getamenitieids",
      "getroomamenitieids",
      "getsalutationsids",
      "getspecialrequestsids",
      "gethotelchainsids",
      "gethotelclassificationids",
      "getratebasisids",
      "getlocationids"
    ]);

    const command = clean(req.params.command).toLowerCase();

    if (!allowed.has(command)) {
      return res.status(400).json({
        ok: false,
        message: "Unsupported WebBeds internal-code command.",
        allowed: Array.from(allowed).sort()
      });
    }

    const xml = buildWebbedsInternalCodeXml(command);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_internal_code", { command }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      command,
      status: result.status,
      responsePreview: result.text
    });
  } catch (err) {
    recordActivity("webbeds_internal_code_error", { command: req.params.command }, { error: err.message, stack: err.stack });
    res.status(500).json({ ok: false, message: "WebBeds internal-code request failed.", error: err.message, stack: err.stack });
  }
});

app.get("/api/webbeds/test-search", async (req, res) => {
  try {
    const built = buildWebbedsSearchXml(req.query);

    if (!built.ok) {
      return res.status(400).json(built);
    }

    const result = await webbedsPostXml(built.xml);

    recordActivity("webbeds_test_search", {
      cityId: clean(req.query.cityId || req.query.city || ""),
      currencyId: clean(req.query.currencyId || req.query.currency || ""),
      nationalityId: clean(req.query.nationalityId || req.query.passengerNationality || ""),
      residenceId: clean(req.query.residenceId || req.query.passengerCountryOfResidence || "")
    }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      status: result.status,
      responsePreview: result.text
    });
  } catch (err) {
    recordActivity("webbeds_test_search_error", {}, { error: err.message, stack: err.stack });
    res.status(500).json({ ok: false, message: "WebBeds test search failed.", error: err.message, stack: err.stack });
  }
});

// MSH WEBBEDS JSON SEARCH NORMALIZER
function extractXmlTag(block, tag) {
  const match = String(block || "").match(new RegExp("<" + tag + ">([\\s\\S]*?)<\\/" + tag + ">", "i"));
  return match ? clean(match[1]) : "";
}

function extractXmlAttr(block, attr) {
  const match = String(block || "").match(new RegExp(attr + "=\"([^\"]*)\"", "i"));
  return match ? clean(match[1]) : "";
}

function parseWebbedsHotels(xml, currencyCode) {
  const hotels = [];
  const hotelBlocks = String(xml || "").match(/<hotel[\s\S]*?<\/hotel>/gi) || [];

  for (const hotelBlock of hotelBlocks.slice(0, 500)) {
    const hotelId = extractXmlAttr(hotelBlock, "hotelid");
    const hotelName = extractXmlAttr(hotelBlock, "name") || extractXmlTag(hotelBlock, "hotelName") || extractXmlTag(hotelBlock, "hotelname") || (hotelId ? `WebBeds hotel ${hotelId}` : "WebBeds hotel");
    const roomBlocks = hotelBlock.match(/<roomType[\s\S]*?<\/roomType>/gi) || [];

    const rooms = [];

    for (const roomBlock of roomBlocks.slice(0, 10)) {
      const roomTypeCode = extractXmlAttr(roomBlock, "roomtypecode");
      const roomName = extractXmlTag(roomBlock, "name") || "Available room";
      const rateBlocks = roomBlock.match(/<rateBasis[\s\S]*?<\/rateBasis>/gi) || [];

      for (const rateBlock of rateBlocks.slice(0, 4)) {
        const rateBasisId = extractXmlAttr(rateBlock, "id");
        const total = money(extractXmlTag(rateBlock, "total"));

        if (total <= 0) continue;

        rooms.push({
          roomCode: roomTypeCode,
          roomName,
          board: `Rate basis ${rateBasisId || "standard"}`,
          price: total,
          convertedPrice: total,
          displayCurrency: currencyCode || "USD",
          cancellation: "Cancellation details are confirmed before booking.",
          taxes: "Taxes and fees are confirmed before booking.",
          rate_source_id: `WEBBEDS-${hotelId}-${roomTypeCode}-${rateBasisId}`,
          rate_source_timestamp: nowISO(),
          source_health: "verified",
          supplier_private: {
            supplier_code: "WEBBEDS",
            supplier_hotel_id: hotelId,
            room_type_code: roomTypeCode,
            rate_basis_id: rateBasisId
          }
        });
      }
    }

    rooms.sort((a, b) => number(a.price) - number(b.price));

    if (hotelId && rooms.length) {
      hotels.push({
        hotelId: `WEBBEDS-${hotelId}`,
        hotel_id: `WEBBEDS-${hotelId}`,
        name: hotelName,
        hotel_name: hotelName,
        country: "",
        city: "",
        area: "",
        address: "",
        stars: "",
        image: "",
        facilities: [],
        availableToBook: true,
        price: rooms[0].price,
        currency: rooms[0].displayCurrency,
        rooms: rooms.slice(0, 8),
        rate_source_id: rooms[0].rate_source_id,
        rate_source_timestamp: rooms[0].rate_source_timestamp,
        source_health: "verified"
      });
    }
  }

  hotels.sort((a, b) => number(a.price) - number(b.price));
  return hotels;
}

function webbedsCurrencyIdFromCode(code) {
  const c = clean(code || "USD").toUpperCase();
  if (c === "GBP") return "416";
  if (c === "EUR") return "413";
  return "520";
}

function webbedsCountryIdFromCode(code) {
  const c = clean(code || "GB").toUpperCase();
  if (c === "AE" || c === "UAE" || c === "UNITED ARAB EMIRATES") return "6";
  if (c === "US" || c === "USA" || c === "UNITED STATES") return "102";
  return "88";
}




app.get("/api/webbeds/search", async (req, res) => {
  try {
    const cityId = positiveIntegerOrBlank(req.query.cityId || req.query.city_id) || findWebbedsCityCodeFromCache(req.query.city) || webbedsCityIdFromName(req.query.city);
    const currencyId = positiveIntegerOrBlank(req.query.currencyId || req.query.currency_id) || webbedsCurrencyIdFromCode(req.query.currency);
    const nationalityId = positiveIntegerOrBlank(req.query.nationalityId || req.query.nationality_id) || webbedsCountryIdFromCode(req.query.nationality || "GB");
    const residenceId = positiveIntegerOrBlank(req.query.residenceId || req.query.residence_id) || webbedsCountryIdFromCode(req.query.residence || "GB");

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        message: "This WebBeds city is not mapped yet. Use cityId directly or add the city to the WebBeds city map.",
        example: "/api/webbeds/search?cityId=334&currency=USD&nationality=GB&residence=GB"
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId,
      nationalityId,
      residenceId
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    recordActivity("webbeds_json_search", {
      cityId,
      currencyId,
      nationalityId,
      residenceId,
      count: hotels.length
    }, {
      ok: result.ok,
      status: result.status
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live",
      count: hotels.length,
      hotels
    });
  } catch (err) {
    recordActivity("webbeds_json_search_error", {}, { error: err.message, stack: err.stack });
    res.status(500).json({
      ok: false,
      message: "WebBeds JSON search failed.",
      error: err.message, stack: err.stack
    });
  }
});

// MSH WEBBEDS CITY MAP CACHE (REPLACEMENT)
function mshXmlDecode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function mshNormCity(v) {
  return String(v || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\s+-\s+[a-z ]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWebbedsCityMap(xml) {
  const map = {};
  const cities = [];
  const cityBlocks = String(xml || "").match(/<city\b[^>]*>[\s\S]*?<\/city>/gi) || [];

  for (const block of cityBlocks) {
    const nameMatch = block.match(/<name\b[^>]*>([\s\S]*?)<\/name>/i);
    const codeMatch = block.match(/<code\b[^>]*>([\s\S]*?)<\/code>/i);
    if (!nameMatch || !codeMatch) continue;

    const name = mshXmlDecode(nameMatch[1]).trim();
    const code = mshXmlDecode(codeMatch[1]).trim();
    if (!name || !code) continue;

    const key = name.toUpperCase();
    map[key] = code;
    cities.push({ name, key, code });
  }

  cities.sort((a, b) => a.name.localeCompare(b.name));

  return {
    generated_at: nowISO(),
    source_command: "getallcities",
    count: cities.length,
    map,
    cities
  };
}

function webbedsCityMapFile() {
  return path.join(DATA_DIR, "webbeds-city-map.json");
}

function loadWebbedsCityMap() {
  try {
    const file = webbedsCityMapFile();
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveWebbedsCityMap(data) {
  try {
    fs.writeFileSync(webbedsCityMapFile(), JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("[WEBBEDS] saveWebbedsCityMap failed:", err.message);
  }
}

function findWebbedsCityCodeFromCache(city, country = "") {
  const wantedCity = mshNormCity(city);
  const wantedCountry = mshNormCity(country);
  if (!wantedCity) return "";

  const cityMap = loadWebbedsCityMap();
  if (!cityMap) return "";

  const candidates = [];
  if (cityMap.map && typeof cityMap.map === "object") {
    for (const [name, code] of Object.entries(cityMap.map)) {
      candidates.push({ name, key: name, city: name, code });
    }
  }
  if (Array.isArray(cityMap.cities)) candidates.push(...cityMap.cities);
  if (Array.isArray(cityMap.destinations)) candidates.push(...cityMap.destinations);

  let best = null;

  for (const x of candidates) {
    const code = clean(x.code || x.cityCode || x.city_code || x.cityId || x.city_id || x.destinationCode || x.destination_code || x.id || "");
    const name = clean(x.city || x.name || x.cityName || x.city_name || x.destination || x.destinationName || x.key || "");
    if (!code || !name) continue;

    const n = mshNormCity(name);
    const c = mshNormCity(x.country || x.countryName || x.country_name || x.destinationCountry || "");

    let score = 0;
    if (n === wantedCity) score += 1000;
    else if (n.startsWith(wantedCity + " ")) score += 700;
    else if (n.includes(" " + wantedCity + " ")) score += 500;
    else if (n.includes(wantedCity)) score += 300;
    else continue;

    if (wantedCountry && c && c === wantedCountry) score += 250;

    if (!best || score > best.score) best = { code, score, name };
  }

  return best ? clean(best.code) : "";
}

function webbedsCityIdFromName(city) {
  const c = clean(city).toUpperCase();
  const fallback = {
    "ABU DHABI": "334"
  };
  return fallback[c] || "";
}

app.get("/api/webbeds/build-city-map", async (req, res) => {
  try {
    const command = clean(req.query.command || "getallcities").toLowerCase();
    if (!["getallcities", "getservingcities"].includes(command)) {
      return res.status(400).json({
        ok: false,
        message: "command must be getallcities or getservingcities"
      });
    }

    const xml = buildWebbedsInternalCodeXml(command);
    const result = await webbedsPostXml(xml);

    if (!result.ok) {
      return res.status(502).json({
        ok: false,
        message: `Could not download WebBeds cities (${command}).`,
        status: result.status,
        responsePreview: result.text.slice(0, 2000)
      });
    }

    const parsed = parseWebbedsCityMap(result.text);
    parsed.source_command = command;

    if (!parsed.count) {
      return res.status(502).json({
        ok: false,
        message: "Parser produced 0 cities. Inspect responsePreview.",
        responsePreview: result.text.slice(0, 2000)
      });
    }

    saveWebbedsCityMap(parsed);

    try {
      recordActivity("webbeds_build_city_map", { command }, { ok: true, cities: parsed.count });
    } catch {}

    res.json({
      ok: true,
      file: "backend/data/webbeds-city-map.json",
      command,
      count: parsed.count,
      generated_at: parsed.generated_at,
      examples: parsed.cities.slice(0, 20)
    });
  } catch (err) {
    try { recordActivity("webbeds_build_city_map_error", {}, { error: err.message, stack: err.stack }); } catch {}
    res.status(500).json({
      ok: false,
      message: "WebBeds city map build failed.",
      error: err.message, stack: err.stack
    });
  }
});

app.get("/api/webbeds/city-code", (req, res) => {
  const city = clean(req.query.city || req.query.q || "");
  const cityMap = loadWebbedsCityMap();

  if (!cityMap) {
    return res.status(404).json({
      ok: false,
      message: "WebBeds city map has not been built yet. Run /api/webbeds/build-city-map?command=getallcities first."
    });
  }

  const code = findWebbedsCityCodeFromCache(city) || webbedsCityIdFromName(city);

  res.json({
    ok: Boolean(code),
    city,
    code,
    cache_loaded: true,
    cache_count: cityMap.count || 0,
    cache_generated_at: cityMap.generated_at || null,
    message: code ? "City code found." : "City is not mapped yet."
  });
});

app.get("/api/webbeds/debug-city", (req, res) => {
  const city = clean(req.query.city || "");
  const map = loadWebbedsCityMap();
  res.json({
    ok: true,
    city,
    cache_loaded: !!map,
    cache_count: map ? map.count : 0,
    cache_generated_at: map ? map.generated_at : null,
    from_cache: findWebbedsCityCodeFromCache(city),
    from_hardcode: webbedsCityIdFromName(city),
    effective: findWebbedsCityCodeFromCache(city) || webbedsCityIdFromName(city)
  });
});

// MSH CUSTOMER LIVE HOTEL SEARCH VIA WEBBEDS
app.get("/api/live-webbeds-hotels", async (req, res) => {
  try {
    const city = clean(req.query.city || req.query.destination || "DUBAI");
    const currency = clean(req.query.currency || "USD").toUpperCase();
    const nationality = clean(req.query.nationality || "GB");
    const residence = clean(req.query.residence || "GB");

    const cityId =
      positiveIntegerOrBlank(req.query.cityId || req.query.city_id) ||
      findWebbedsCityCodeFromCache(city) ||
      webbedsCityIdFromName(city);

    if (!cityId) {
      return res.status(400).json({
        ok: false,
        source: "live",
        message: "Live hotel rates are not available for this city yet.",
        city
      });
    }

    const built = buildWebbedsSearchXml({
      ...req.query,
      cityId,
      currencyId: webbedsCurrencyIdFromCode(currency),
      nationalityId: webbedsCountryIdFromCode(nationality),
      residenceId: webbedsCountryIdFromCode(residence)
    });

    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
      ...hotel,
      city,
      country: clean(req.query.country || "") || hotel.country,
      source: "live",
      supplier: "configured_private_supplier"
    }));

    return res.json({
      ok: result.ok,
      source: "live",
      city,
      cityId,
      currency,
      count: hotels.length,
      hotels
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Live hotel search failed.",
      error: err.message, stack: err.stack
    });
  }
});

// MSH WEBBEDS HOTEL DETAILS
function buildWebbedsHotelDetailsXml(hotelId) {
  return webbedsCustomerXml(`<request command="gethoteldetails">
    <hotelId>${xmlEscapeValue(hotelId)}</hotelId>
  </request>`);
}

app.get("/api/webbeds/hotel-details", async (req, res) => {
  try {
    const hotelId = clean(req.query.hotelId || req.query.hotelid || req.query.id || "");

    if (!hotelId) {
      return res.status(400).json({
        ok: false,
        message: "hotelId is required.",
        example: "/api/webbeds/hotel-details?hotelId=313455"
      });
    }

    const xml = buildWebbedsHotelDetailsXml(hotelId);
    const result = await webbedsPostXml(xml);

    recordActivity("webbeds_hotel_details", { hotelId }, {
      ok: result.ok,
      status: result.status,
      preview: result.text.slice(0, 500)
    });

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      hotelId,
      status: result.status,
      responsePreview: result.text.slice(0, 12000)
    });
  } catch (err) {
    recordActivity("webbeds_hotel_details_error", {}, { error: err.message, stack: err.stack });

    res.status(500).json({
      ok: false,
      message: "WebBeds hotel details request failed.",
      error: err.message, stack: err.stack
    });
  }
});

// MSH WEBBEDS HOTEL ID BATCH SEARCH
function buildWebbedsHotelIdSearchXml(query) {
  const fromDate = xmlEscapeValue(query.fromDate || query.checkIn || query.checkin || webbedsDateISO(14));
  const toDate = xmlEscapeValue(query.toDate || query.checkOut || query.checkout || webbedsDateISO(15));

  const currencyId = positiveIntegerOrBlank(query.currencyId || query.currency_id) || webbedsCurrencyIdFromCode(query.currency);
  const nationalityId = positiveIntegerOrBlank(query.nationalityId || query.nationality_id) || webbedsCountryIdFromCode(query.nationality || "GB");
  const residenceId = positiveIntegerOrBlank(query.residenceId || query.residence_id) || webbedsCountryIdFromCode(query.residence || "GB");

  const hotelIds = clean(query.hotelIds || query.hotelids || query.ids || "")
    .split(",")
    .map((x) => clean(x))
    .filter((x) => /^[0-9]+$/.test(x))
    .slice(0, 50);

  if (!hotelIds.length) {
    return { ok: false, message: "hotelIds is required. Example: hotelIds=31354,31064,1073078" };
  }

  const fieldValues = hotelIds.map((id) => `<fieldValue>${xmlEscapeValue(id)}</fieldValue>`).join("");

  return {
    ok: true,
    xml: webbedsCustomerXml(`<request command="searchhotels">
    <bookingDetails>
      <fromDate>${fromDate}</fromDate>
      <toDate>${toDate}</toDate>
      <currency>${currencyId}</currency>
      <rooms no="1">
        <room runno="0">
          <adultsCode>2</adultsCode>
          <children no="0"></children>
          <rateBasis>-1</rateBasis>
          <passengerNationality>${nationalityId}</passengerNationality>
          <passengerCountryOfResidence>${residenceId}</passengerCountryOfResidence>
        </room>
      </rooms>
    </bookingDetails>
    <return>
      <filters xmlns:a="http://us.dotwconnect.com/xsd/atomicCondition" xmlns:c="http://us.dotwconnect.com/xsd/complexCondition">
        <c:condition>
          <a:condition>
            <fieldName>hotelId</fieldName>
            <fieldTest>in</fieldTest>
            <fieldValues>${fieldValues}</fieldValues>
          </a:condition>
        </c:condition>
      </filters>
    </return>
  </request>`)
  };
}

app.get("/api/webbeds/search-by-hotel-ids", async (req, res) => {
  try {
    const built = buildWebbedsHotelIdSearchXml(req.query);
    if (!built.ok) return res.status(400).json(built);

    const result = await webbedsPostXml(built.xml);
    const hotels = parseWebbedsHotels(result.text, clean(req.query.currency || "USD").toUpperCase());

    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      supplier: "configured_private_supplier",
      source: "live_hotel_id_batch",
      status: result.status,
      count: hotels.length,
      hotels,
      responsePreview: result.text.slice(0, 15000)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "WebBeds hotel ID batch search failed.",
      error: err.message, stack: err.stack
    });
  }
});
// MSH WEBBEDS DOTW XML CONNECTOR END

// MSH HOTELBEDS LIVE CONNECTOR START
function hotelbedsConfig() {
  const baseUrl = clean(process.env.HOTELBEDS_BASE_URL || "https://api.test.hotelbeds.com").replace(/\/$/, "");
  const apiKey = clean(process.env.HOTELBEDS_API_KEY);
  const secret = clean(process.env.HOTELBEDS_SECRET);
  const defaultDestination = clean(process.env.HOTELBEDS_DEFAULT_DESTINATION || "");
  return {
    baseUrl,
    apiKey,
    secret,
    defaultDestination,
    ready: Boolean(apiKey && secret)
  };
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
    const keys = [
      `${wantedCountry}|${wantedCity}`,
      wantedCity,
      clean(city),
      clean(country)
    ];

    for (const key of keys) {
      if (map[key]) return clean(map[key]).toUpperCase();
    }
  } catch {}

  const fallback = {
    "united kingdom|london": "LON",
    "london": "LON",
    "united states|los angeles": "LAX",
    "los angeles": "LAX",
    "united states|new york": "NYC",
    "new york": "NYC",
    "france|paris": "PAR",
    "paris": "PAR",
    "united arab emirates|dubai": "DXB",
    "dubai": "DXB",
    "united arab emirates|abu dhabi": "AUH",
    "abu dhabi": "AUH"
  };

  return clean(fallback[`${wantedCountry}|${wantedCity}`] || fallback[wantedCity] || hotelbedsConfig().defaultDestination).toUpperCase();
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
// MSH GOOGLE PLACES HOTEL IMAGE START
const MSH_GOOGLE_IMAGE_CACHE_FILE = path.join(DATA_DIR, "google_places_cache.json");

function mshGoogleImageCacheRead() {
  try {
    if (!fs.existsSync(MSH_GOOGLE_IMAGE_CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(MSH_GOOGLE_IMAGE_CACHE_FILE, "utf8")) || {};
  } catch {
    return {};
  }
}

function mshGoogleImageCacheWrite(cache) {
  try {
    fs.writeFileSync(MSH_GOOGLE_IMAGE_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch {}
}

async function mshGooglePlacesHotelImage(hotelName, city, country) { console.log("[GOOGLE-IMAGE] lookup for:", hotelName, city, country);
  const apiKey = clean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "");
  if (!apiKey) return "";
  if (!hotelName) return "";

  const cacheKey = clean([hotelName, city, country].filter(Boolean).join("|")).toLowerCase();
  const cache = mshGoogleImageCacheRead();

  if (cache[cacheKey] && typeof cache[cacheKey] === "string") {
    return cache[cacheKey];
  }

  const query = encodeURIComponent([hotelName, city, country].filter(Boolean).join(", "));

  try {
    const findUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=place_id&key=${apiKey}`;
    const findRes = await fetch(findUrl).then((r) => r.json()).catch(() => ({}));
    const placeId = findRes?.candidates?.[0]?.place_id || "";
    if (!placeId) {
      cache[cacheKey] = "";
      mshGoogleImageCacheWrite(cache);
      return "";
    }

    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=photos&key=${apiKey}`;
    const detailsRes = await fetch(detailsUrl).then((r) => r.json()).catch(() => ({}));
    const photoRef = detailsRes?.result?.photos?.[0]?.photo_reference || "";

    if (!photoRef) {
      cache[cacheKey] = "";
      mshGoogleImageCacheWrite(cache);
      return "";
    }

    const finalUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(photoRef)}&key=${apiKey}`;
    cache[cacheKey] = finalUrl;
    mshGoogleImageCacheWrite(cache);
    return finalUrl;
  } catch (err) {
    console.log(`[GOOGLE-IMAGE] error for "${hotelName}": ${err.message}`);
    return "";
  }
}
// MSH GOOGLE PLACES HOTEL IMAGE END
// NOTE: Duplicate mshGooglePlacesHotelImage definition removed to prevent bugs.

function hotelbedsImageUrl(hotel) {
  const image = Array.isArray(hotel?.images) && hotel.images.length ? hotel.images[0] : null;
  const pathValue = clean(image?.path || image?.url || "");
  if (!pathValue) return "";
  if (/^https?:\/\//i.test(pathValue)) return pathValue;
  return `https://photos.hotelbeds.com/giata/original/${pathValue.replace(/^\/+/, "")}`;
}

function hotelbedsCatalogueImage(hotel, country, city) {
  try {
    const supplierId = clean(hotel?.code || hotel?.id || "");
    const hotelName = clean(hotel?.name || hotel?.hotelName || "").toLowerCase();
    const rows = readHotels();

    const matched = rows.find((h) => {
      const hName = clean(h.name || h.hotel_name || "").toLowerCase();
      const hCountry = clean(h.country || "").toLowerCase();
      const hCity = clean(h.city || h.destination || "").toLowerCase();
      const ids = [
        h.hotelId,
        h.hotel_id,
        h.id,
        h.code,
        h.supplier_hotel_id,
        h.supplierHotelId
      ].map((x) => clean(x).replace(/^HOTELBEDS-/i, ""));

      const idMatch = supplierId && ids.some((x) => x && x === supplierId);
      const nameMatch = hotelName && hName && hName === hotelName;
      const locationMatch =
        (!country || !hCountry || hCountry === clean(country).toLowerCase()) &&
        (!city || !hCity || hCity.includes(clean(city).toLowerCase()) || clean(city).toLowerCase().includes(hCity));

      return locationMatch && (idMatch || nameMatch);
    });

    if (!matched) return "";

    const candidates = [
      matched.image,
      matched.image_url,
      matched.photo,
      matched.thumbnail,
      ...(Array.isArray(matched.images) ? matched.images : [])
    ];

    return clean(candidates.find((x) => typeof x === "string" && /^https?:\/\//i.test(x)) || "");
  } catch {
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

  const hotels = (await Promise.all(rawHotels.map(async (hotel) => {
    const best = hotelbedsBestRoom(hotel);
    if (!best) return null;

    const hotelName = clean(hotel?.name || hotel?.hotelName || "");
    if (!hotelName) return null;

    // Use the official Hotelbeds image URL if available, otherwise use a clean static placeholder
    let image = hotelbedsImageUrl(hotel); 
    if (!image) {
      const label = encodeURIComponent((hotelName || "Hotel").slice(0, 24));
      image = `https://placehold.co/600x400/0b1d51/ffffff/png?text=${label}`;
    }
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
      image,
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
  }))).filter(Boolean);

  return { ok: true, source: "hotelbeds_live_supplier", destination, count: hotels.length, hotels, rawCount: rawHotels.length };
}

async function hotelbedsSearchHotelsFromRequest(req) {
  const result = await hotelbedsAvailabilitySearch(req.query || {});
  return Array.isArray(result.hotels) ? result.hotels : [];
}

app.get("/api/hotelbeds/status", (req, res) => {
  const cfg = hotelbedsConfig();
  res.json({
    ok: true,
    configured: cfg.ready,
    hasApiKey: Boolean(cfg.apiKey),
    hasSecret: Boolean(cfg.secret),
    baseUrl: cfg.baseUrl,
    defaultDestination: cfg.defaultDestination,
    message: cfg.ready ? "Hotelbeds connector is configured." : "Hotelbeds connector is not ready."
  });
});

app.get("/api/hotelbeds/search", async (req, res) => {
  try {
    const result = await hotelbedsAvailabilitySearch(req.query || {});
    res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, source: "hotelbeds_live_supplier", message: "Hotelbeds search failed.", error: err.message, stack: err.stack });
  }
});

app.get("/api/hotelbeds/availability", async (req, res) => {
  try {
    const result = await hotelbedsAvailabilitySearch(req.query || {});
    res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (err) {
    res.status(500).json({ ok: false, source: "hotelbeds_live_supplier", message: "Hotelbeds availability failed.", error: err.message, stack: err.stack });
  }
});
// MSH HOTELBEDS LIVE CONNECTOR END

// MSH FAST CUSTOMER LIVE SEARCH CACHE START
const MSH_FAST_LIVE_CACHE_FILE = path.join(DATA_DIR, "fast_live_rate_cache.json");
ensureFile(MSH_FAST_LIVE_CACHE_FILE, {});

function mshFastNormText(value) {
  return clean(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function mshFastCanonicalCountry(value) {
  const v = mshFastNormText(value);
  if (["uk", "gb", "great britain", "england", "united kingdom"].includes(v)) return "United Kingdom";
  if (["us", "usa", "america", "united states", "united states of america"].includes(v)) return "United States";
  if (["uae", "united arab emirates"].includes(v)) return "United Arab Emirates";
  return clean(value);
}

function mshFastCanonicalCity(value) {
  const v = mshFastNormText(value);
  if (["greater london", "city of london", "london uk", "london england", "london"].includes(v)) return "London";
  if (["la", "los angeles", "los angeles ca"].includes(v)) return "Los Angeles";
  if (["nyc", "new york city", "new york"].includes(v)) return "New York";
  if (["dubai"].includes(v)) return "Dubai";
  if (["abu dhabi", "abudhabi"].includes(v)) return "Abu Dhabi";
  return clean(value);
}

function mshFastCacheKey(query, includeDates = true) {
  const parts = [
    mshFastCanonicalCountry(query.country || "").toLowerCase(),
    mshFastCanonicalCity(query.city || query.destination || "").toLowerCase(),
    clean(query.currency || "GBP").toUpperCase(),
    clean(query.guests || "2"),
    clean(query.rooms || "1")
  ];
  if (includeDates) {
    parts.splice(2, 0,
      clean(query.checkIn || query.checkin || query.check_in || ""),
      clean(query.checkOut || query.checkout || query.check_out || "")
    );
  }
  return parts.join("|");
}

function mshFastReadCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MSH_FAST_LIVE_CACHE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function mshFastWriteCache(cache) {
  try {
    fs.writeFileSync(MSH_FAST_LIVE_CACHE_FILE, JSON.stringify(cache, null, 2), "utf8");
  } catch {}
}

function mshFastCleanHotels(hotels, query) {
  const wantedCountry = mshFastCanonicalCountry(query.country || "");
  const wantedCity = mshFastCanonicalCity(query.city || query.destination || "");
  const seen = new Set();

  return (Array.isArray(hotels) ? hotels : [])
    .filter(Boolean)
    .map((hotel) => ({
      ...hotel,
      country: clean(hotel.country || wantedCountry),
      city: clean(hotel.city || hotel.destination || wantedCity),
      image: clean(hotel.image || hotel.image_url || hotel.photo || hotel.thumbnail || ""),
      images: Array.isArray(hotel.images) ? hotel.images : (hotel.image ? [hotel.image] : [])
    }))
    .filter((hotel) => {
      const price = number(hotel.price || hotel.convertedPrice || hotel.displayPrice || hotel.total || 0);
      const name = clean(hotel.name || hotel.hotel_name || "");
      const source = clean([hotel.source, hotel.supplierLabel, hotel.supplier_private?.supplier_code].join(" ")).toLowerCase();
      if (!(price > 0)) return false;
      if (!name || /^hotel\s+\d+$/i.test(name) || /^webbeds property\s+\d+$/i.test(name) || /placeholder|sample|demo|fake|test hotel/i.test(name)) return false;
      if (!(source.includes("hotelbeds") || source.includes("webbeds") || source.includes("ratehawk") || source.includes("live"))) return false;
      const key = clean(hotel.hotelId || hotel.hotel_id || hotel.id || hotel.code || `${name}-${hotel.city}-${hotel.country}`).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => number(a.price || a.convertedPrice || 0) - number(b.price || b.convertedPrice || 0))
    .slice(0, Math.max(1, Math.min(Number(query.limit || 60), 120)));
}

async function mshFastSupplierSearch(query) {
  const normalizedQuery = {
    ...query,
    country: mshFastCanonicalCountry(query.country || ""),
    city: mshFastCanonicalCity(query.city || query.destination || "")
  };

  let hotelbedsHotels = [];
  try {
    const hb = await hotelbedsAvailabilitySearch({ ...normalizedQuery, limit: Math.max(20, Math.min(Number(query.limit || 60), 120)) });
    hotelbedsHotels = Array.isArray(hb.hotels) ? hb.hotels : [];
  } catch {}

  let webbedsHotels = [];
  try {
    const cityId = findWebbedsCityCodeFromCache(normalizedQuery.city) || webbedsCityIdFromName(normalizedQuery.city);
    if (cityId && typeof buildWebbedsSearchXml === "function") {
      const currency = clean(normalizedQuery.currency || "GBP").toUpperCase();
      const built = buildWebbedsSearchXml({
        ...normalizedQuery,
        cityId,
        currencyId: webbedsCurrencyIdFromCode(currency),
        nationalityId: webbedsCountryIdFromCode(normalizedQuery.nationality || "GB"),
        residenceId: webbedsCountryIdFromCode(normalizedQuery.residence || "GB")
      });
      if (built.ok) {
        const result = await webbedsPostXml(built.xml);
        webbedsHotels = parseWebbedsHotels(result.text, currency).map((hotel) => ({
          ...hotel,
          city: normalizedQuery.city,
          country: normalizedQuery.country,
          source: "webbeds_live_supplier",
          supplierLabel: "WebBeds live rate",
          supplier_private: { ...(hotel.supplier_private || {}), supplier_code: "WEBBEDS" }
        }));
      }
    }
  } catch {}

  return mshFastCleanHotels([...hotelbedsHotels, ...webbedsHotels], normalizedQuery);
}

async function mshFastRefreshHotelCache(query) {
  const exactKey = mshFastCacheKey(query, true);
  const cityKey = mshFastCacheKey(query, false);
  const hotels = await mshFastSupplierSearch(query);
  if (!hotels.length) return hotels;
  const cache = mshFastReadCache();
  const row = { timestamp: Date.now(), generated_at: nowISO(), hotels };
  cache[exactKey] = row;
  cache[cityKey] = row;
  mshFastWriteCache(cache);
  return hotels;
}

app.get("/api/instant-live-hotels", async (req, res) => {
  const query = req.query || {};
  const exactKey = mshFastCacheKey(query, true);
  const cityKey = mshFastCacheKey(query, false);
  const cache = mshFastReadCache();
  const maxExactAge = 15 * 60 * 1000;
  const maxCityAge = 45 * 60 * 1000;
  const exact = cache[exactKey];
  const cityCached = cache[cityKey];

  if (exact && Array.isArray(exact.hotels) && exact.hotels.length && Date.now() - Number(exact.timestamp || 0) < maxExactAge) {
    setImmediate(() => mshFastRefreshHotelCache(query).catch(() => {}));
    return res.json({ ok: true, source: "instant_live_cache", cached: true, count: exact.hotels.length, hotels: exact.hotels });
  }

  if (cityCached && Array.isArray(cityCached.hotels) && cityCached.hotels.length && Date.now() - Number(cityCached.timestamp || 0) < maxCityAge) {
    setImmediate(() => mshFastRefreshHotelCache(query).catch(() => {}));
    return res.json({ ok: true, source: "instant_city_cache_background_refresh", cached: true, count: cityCached.hotels.length, hotels: cityCached.hotels });
  }

  const liveOrTimeout = await Promise.race([
    mshFastRefreshHotelCache(query).catch(() => []),
    new Promise((resolve) => setTimeout(() => resolve([]), 3500))
  ]);

  if (Array.isArray(liveOrTimeout) && liveOrTimeout.length) {
    return res.json({ ok: true, source: "instant_live_supplier", cached: false, count: liveOrTimeout.length, hotels: liveOrTimeout });
  }

  return res.json({
    ok: true,
    source: "instant_live_refreshing",
    cached: false,
    count: 0,
    hotels: [],
    message: "Live rates are being refreshed for this destination. Please search again shortly."
  });
});
// MSH FAST CUSTOMER LIVE SEARCH CACHE END

// ============================================================
// BOOKING.COM STYLE HIGH-SPEED SEARCH ENGINE
// ============================================================
const MSH_SEARCH_CACHE = new Map();
const MSH_CACHE_TTL = 15 * 60 * 1000; // 15 Minutes

function mshGetCacheKey(query) {
  const city = clean(query.city || "").toLowerCase();
  const country = clean(query.country || "").toLowerCase();
  const checkIn = clean(query.checkIn || query.checkin || query.check_in || "");
  const checkOut = clean(query.checkOut || query.checkout || query.check_out || "");
  const guests = clean(query.guests || "2");
  const rooms = clean(query.rooms || "1");
  const currency = clean(query.currency || "GBP").toUpperCase();
  return `${city}|${country}|${checkIn}|${checkOut}|${guests}|${rooms}|${currency}`;
}

app.get("/api/multi-supplier-hotels", async (req, res) => {
  const startTime = Date.now();
  const cacheKey = mshGetCacheKey(req.query);

  // 1. INSTANT CACHE CHECK
  if (MSH_SEARCH_CACHE.has(cacheKey)) {
    const cachedData = MSH_SEARCH_CACHE.get(cacheKey);
    if (Date.now() - cachedData.timestamp < MSH_CACHE_TTL) {
      console.log(`[FAST-SEARCH] Cache HIT for ${req.query.city} in ${Date.now() - startTime}ms`);
      return res.json({ ok: true, source: "cache", ...cachedData.data });
    } else {
      MSH_SEARCH_CACHE.delete(cacheKey);
    }
  }

  try {
    // 2. PURE LOCAL CHUNK FETCH (No supplier calls)
    const params = new URLSearchParams(req.query).toString();
    // Direct function call used below
    
    const localHotels = searchHotels(req.query);

    // 3. Format response
    const finalResponse = {
      ok: true,
      source: "local_chunks_only",
      suppliers: {
        existing: localHotels.length,
        hotelbeds: 0,
        webbeds: 0,
        ratehawk: 0
      },
      count: localHotels.length,
      hotels: localHotels
    };

    // 4. Save to cache
    MSH_SEARCH_CACHE.set(cacheKey, { data: finalResponse, timestamp: Date.now() });

    console.log(`[FAST-SEARCH] Served ${localHotels.length} local chunks for ${req.query.city} in ${Date.now() - startTime}ms`);
    res.json(finalResponse);
    
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Local chunk search failed.",
      error: err.message, stack: err.stack
    });
  }
});
app.get("/api/live-rate-engine-hotels", async (req, res) => {
  const query = {
    ...req.query,
    country: MSH_LIVE2_TEXT(req.query.country),
    city: MSH_LIVE2_TEXT(req.query.city),
    currency: MSH_LIVE2_TEXT(req.query.currency || "GBP").toUpperCase(),
    checkIn: MSH_LIVE2_TEXT(req.query.checkIn || req.query.checkin || req.query.check_in),
    checkOut: MSH_LIVE2_TEXT(req.query.checkOut || req.query.checkout || req.query.check_out),
    guests: MSH_LIVE2_TEXT(req.query.guests || "2"),
    rooms: MSH_LIVE2_TEXT(req.query.rooms || "1")
  };
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 1000));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const started = Date.now();
  try {
    const all = await MSH_LIVE2_COLLECT({ ...query, limit: Math.max(limit, 100) });
    const hotels = all.slice(offset, offset + limit);
    recordActivity("live_rate_engine_hotels_v2", query, { count: hotels.length, totalAvailable: all.length, ms: Date.now() - started });
    return res.json({
      ok: true,
      success: true,
      source: "live_rate_engine_v2",
      accommodationMode: "hotel_only",
      supplierScope: "current_suppliers_and_harvested_rates",
      count: hotels.length,
      totalAvailable: all.length,
      hasMore: offset + hotels.length < all.length,
      hotels,
      customerMessage: hotels.length ? "Hotels found for your search." : "We could not find available hotels for this destination right now. Please try another city or date."
    });
  } catch (err) {
    recordActivity("live_rate_engine_hotels_v2_error", query, { error: err.message, stack: err.stack });
    return res.json({ ok: true, success: true, source: "live_rate_engine_v2", count: 0, totalAvailable: 0, hasMore: false, hotels: [], customerMessage: "We could not find available hotels for this destination right now. Please try another city or date." });
  }
});

app.get("/api/live-rate-engine-selected", async (req, res) => {
  const query = {
    ...req.query,
    country: MSH_LIVE2_TEXT(req.query.country),
    city: MSH_LIVE2_TEXT(req.query.city),
    currency: MSH_LIVE2_TEXT(req.query.currency || "GBP").toUpperCase(),
    limit: 1000
  };
  try {
    const all = await MSH_LIVE2_COLLECT(query);
    const ranked = all.map((hotel) => ({ hotel, score: MSH_LIVE2_MATCH_SCORE(hotel, query) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    const selected = ranked[0]?.hotel || all.find((h) => MSH_LIVE2_PRICE(h) > 0) || all[0] || null;
    if (!selected) return res.json({ ok: true, found: false, customer_offer: null, message: "Today's price is still being checked. Please choose another hotel or try again shortly." });
    const price = MSH_LIVE2_PRICE(selected);
    if (price <= 0) return res.json({ ok: true, found: false, selected_hotel: selected, customer_offer: null, message: "Today's price is still being checked. Please choose another hotel or try again shortly." });
    const room = MSH_LIVE2_ROOM(selected);
    const currency = MSH_LIVE2_CURRENCY(selected, query.currency);
    const offer = {
      hotelId: selected.hotelId || selected.hotel_id,
      hotelName: selected.name || selected.hotel_name,
      country: selected.country || query.country,
      city: selected.city || query.city,
      roomCode: room.roomCode || room.room_code || "STANDARD",
      roomName: room.roomName || room.room_name || "Available room",
      board: room.board || "Room details before checkout",
      cancellation: room.cancellation || "Cancellation information is shown before you complete your booking.",
      amount: price,
      price,
      currency,
      rate_source_id: room.rate_source_id || selected.rate_source_id || makeRef("RATE"),
      rate_source_timestamp: room.rate_source_timestamp || selected.rate_source_timestamp || nowISO(),
      source_health: "verified"
    };
    recordSupplierAudit("live_rate_engine_v2_selected_offer", { hotelId: offer.hotelId, hotelName: offer.hotelName, country: offer.country, city: offer.city, amount: offer.amount, currency: offer.currency, rate_source_id: offer.rate_source_id, rate_source_timestamp: offer.rate_source_timestamp, supplier_name: selected.supplierLabel || selected.source || "current_supplier" });
    return res.json({ ok: true, found: true, source: "live_rate_engine_v2", selected_hotel: selected, customer_offer: offer, best_offer: offer, offer, hotels_compared: all.length, message: "Current price found." });
  } catch (err) {
    recordActivity("live_rate_engine_selected_v2_error", query, { error: err.message, stack: err.stack });
    return res.json({ ok: true, found: false, customer_offer: null, message: "Today's price could not be checked. Please try again shortly." });
  }
});

function MSH_AUTO_RATE_QUERY(req) {
  return {
    ...req.query,
    country: MSH_LIVE2_TEXT(req.query.country),
    city: MSH_LIVE2_TEXT(req.query.city),
    currency: MSH_LIVE2_TEXT(req.query.currency || "GBP").toUpperCase(),
    checkIn: MSH_LIVE2_TEXT(req.query.checkIn || req.query.checkin || req.query.check_in),
    checkOut: MSH_LIVE2_TEXT(req.query.checkOut || req.query.checkout || req.query.check_out),
    guests: MSH_LIVE2_TEXT(req.query.guests || "2"),
    rooms: MSH_LIVE2_TEXT(req.query.rooms || "1"),
    supplierScope: "current_app_suppliers"
  };
}

async function MSH_AUTO_RATE_SUPPLIER_AND_HARVESTED(query) {
  const requestedLimit = Math.max(25, Math.min(Number(query.limit || 500), 1200));
  const supplierRows = await MSH_LIVE2_SUPPLIER_HOTELS({ ...query, limit: requestedLimit });
  const harvestedRows = MSH_LIVE2_CATALOGUE_HOTELS(query);
  const merged = MSH_LIVE2_DEDUPE([
    ...supplierRows.map((h) => ({ ...h, source: h.source || "current_supplier_live_search", supplierLabel: h.supplierLabel || "Supplier live rate" })),
    ...harvestedRows.map((h) => ({ ...h, source: h.source || "harvested_current_supplier_rate", supplierLabel: h.supplierLabel || "Current hotel rate" }))
  ], query);

  merged.sort((a, b) => {
    const ap = MSH_LIVE2_PRICE(a), bp = MSH_LIVE2_PRICE(b);
    const al = MSH_LIVE2_NORM(a.source || a.supplierLabel).includes("live") ? 1 : 0;
    const bl = MSH_LIVE2_NORM(b.source || b.supplierLabel).includes("live") ? 1 : 0;
    if (bp > 0 && ap <= 0) return 1;
    if (ap > 0 && bp <= 0) return -1;
    if (bl !== al) return bl - al;
    return MSH_LIVE2_NAME(a).localeCompare(MSH_LIVE2_NAME(b));
  });

  return merged;
}

app.get("/api/auto-live-rate-search", async (req, res) => {
  const started = Date.now();
  const query = MSH_AUTO_RATE_QUERY(req);
  const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 1000));
  const offset = Math.max(0, Number(req.query.offset || 0));

  try {
    const all = await MSH_AUTO_RATE_SUPPLIER_AND_HARVESTED({ ...query, limit: Math.max(limit, 300) });
    const hotels = all.slice(offset, offset + limit);

    recordActivity("auto_live_rate_search", query, {
      count: hotels.length,
      totalAvailable: all.length,
      priced: hotels.filter((h) => MSH_LIVE2_PRICE(h) > 0).length,
      ms: Date.now() - started
    });

    return res.json({
      ok: true,
      success: true,
      source: "auto_live_rate_supplier_engine",
      supplierScope: "current_app_suppliers_and_harvested_live_rates",
      accommodationMode: "hotel_only",
      count: hotels.length,
      totalAvailable: all.length,
      hasMore: offset + hotels.length < all.length,
      hotels,
      customerMessage: hotels.length ? "Hotels found for your search." : "We could not find available hotels for this destination right now. Please try another city or date."
    });
  } catch (err) {
    recordActivity("auto_live_rate_search_error", query, { error: err.message, stack: err.stack });
    return res.json({ ok: true, success: true, source: "auto_live_rate_supplier_engine", count: 0, totalAvailable: 0, hasMore: false, hotels: [], customerMessage: "We could not find available hotels for this destination right now. Please try another city or date." });
  }
});

app.get("/api/auto-live-rate-selected", async (req, res) => {
  const query = MSH_AUTO_RATE_QUERY(req);
  try {
    const all = await MSH_AUTO_RATE_SUPPLIER_AND_HARVESTED({ ...query, limit: 1000 });
    const ranked = all
      .map((hotel) => ({ hotel, score: MSH_LIVE2_MATCH_SCORE(hotel, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    const selected = ranked[0]?.hotel || all.find((h) => MSH_LIVE2_PRICE(h) > 0) || null;
    if (!selected || MSH_LIVE2_PRICE(selected) <= 0) {
      return res.json({ ok: true, found: false, customer_offer: null, message: "Today's price is still being checked. Please choose another hotel or try again shortly." });
    }

    const room = MSH_LIVE2_ROOM(selected);
    const price = MSH_LIVE2_PRICE(selected);
    const currency = MSH_LIVE2_CURRENCY(selected, query.currency);
    const offer = {
      hotelId: selected.hotelId || selected.hotel_id,
      hotelName: selected.name || selected.hotel_name,
      country: selected.country || query.country,
      city: selected.city || query.city,
      roomCode: room.roomCode || room.room_code || "STANDARD",
      roomName: room.roomName || room.room_name || "Available room",
      board: room.board || "Room details before checkout",
      cancellation: room.cancellation || "Cancellation information is shown before you complete your booking.",
      amount: price,
      price,
      currency,
      rate_source_id: room.rate_source_id || selected.rate_source_id || makeRef("RATE"),
      rate_source_timestamp: room.rate_source_timestamp || selected.rate_source_timestamp || nowISO(),
      source_health: "verified"
    };

    recordSupplierAudit("auto_live_rate_selected_offer", {
      hotelId: offer.hotelId,
      hotelName: offer.hotelName,
      country: offer.country,
      city: offer.city,
      amount: offer.amount,
      currency: offer.currency,
      rate_source_id: offer.rate_source_id,
      rate_source_timestamp: offer.rate_source_timestamp,
      supplier_name: selected.supplierLabel || selected.source || "current_supplier"
    });

    return res.json({
      ok: true,
      found: true,
      source: "auto_live_rate_supplier_engine",
      selected_hotel: selected,
      customer_offer: offer,
      best_offer: offer,
      offer,
      hotels_compared: all.length,
      message: "Current price found."
    });
  } catch (err) {
    recordActivity("auto_live_rate_selected_error", query, { error: err.message, stack: err.stack });
    return res.json({ ok: true, found: false, customer_offer: null, message: "Today's price could not be checked. Please try again shortly." });
  }
});
// MSH SEPARATE AUTO LIVE RATE SEARCH ENGINE END

// MSH ALL CURRENT SUPPLIER HOTEL + SECOND LIVE RATE ENGINE START
function MSH_ALLSUP_TEXT(v) { return String(v || "").trim(); }
function MSH_ALLSUP_NORM(v) { return MSH_ALLSUP_TEXT(v).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function MSH_ALLSUP_NUM(v) { const n = Number(String(v || "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0; }
function MSH_ALLSUP_ARRAY(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== "object") return [];
  for (const key of ["hotels", "data", "results", "items", "rows", "rates", "properties", "accommodations"]) {
    if (Array.isArray(v[key])) return v[key];
    if (v[key] && typeof v[key] === "object") {
      const nested = MSH_ALLSUP_ARRAY(v[key]);
      if (nested.length) return nested;
    }
  }
  return [];
}
function MSH_ALLSUP_SUPPLIER_TEXT(h) {
  return MSH_ALLSUP_NORM([
    h && h.supplier, h && h.provider, h && h.source, h && h.supplierLabel,
    h && h.supplier_name, h && h.supplier_code, h && h.source_code,
    h && h.inventory_source, h && h.partner,
    h && h.supplier_private && h.supplier_private.supplier_code,
    h && h.internalSupplierTracking && h.internalSupplierTracking.supplier_code,
    h && h.internalSupplierSettlement && h.internalSupplierSettlement.supplier
  ].filter(Boolean).join(" "));
}
function MSH_ALLSUP_SUPPLIER_CODE(h) {
  const text = MSH_ALLSUP_SUPPLIER_TEXT(h);
  if (text.includes("webbeds") || text.includes("dotw")) return "WEBBEDS";
  if (text.includes("hotelbeds")) return "HOTELBEDS";
  if (text.includes("ratehawk") || text.includes("worldota")) return "RATEHAWK";
  if (text.includes("hyperguest")) return "HYPERGUEST";
  return MSH_ALLSUP_TEXT(h && (h.supplier_code || h.supplier || h.source || "MYSPACE_INTERNAL")).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "MYSPACE_INTERNAL";
}
function MSH_ALLSUP_NAME(h) { return MSH_ALLSUP_TEXT(h && (h.name || h.hotel_name || h.hotelName || h.property_name || h.title || "Hotel")); }
function MSH_ALLSUP_CITY(h, fallback) { return MSH_ALLSUP_TEXT(h && (h.city || h.cityName || h.destination || h.destinationCity || (h.location && h.location.city) || (h.address && h.address.city)) || fallback || ""); }
function MSH_ALLSUP_COUNTRY(h, fallback) { return MSH_ALLSUP_TEXT(h && (h.country || h.countryName || h.destinationCountry || (h.location && h.location.country) || (h.address && h.address.country)) || fallback || ""); }
function MSH_ALLSUP_ID(h) { return MSH_ALLSUP_TEXT(h && (h.hotelId || h.hotel_id || h.id || h.code || h.hotel_code || h.supplier_hotel_id || h.supplierHotelId || h.property_id || MSH_ALLSUP_NAME(h))); }
function MSH_ALLSUP_ROOM(h) { return Array.isArray(h && h.rooms) && h.rooms.length ? h.rooms[0] : (Array.isArray(h && h.rates) && h.rates.length ? h.rates[0] : {}); }
function MSH_ALLSUP_PRICE(h) {
  const room = MSH_ALLSUP_ROOM(h);
  const values = [
    h && h.price, h && h.convertedPrice, h && h.displayPrice, h && h.amount, h && h.total, h && h.nightly_rate, h && h.rate, h && h.minRate, h && h.min_rate,
    room && room.price, room && room.convertedPrice, room && room.displayPrice, room && room.amount, room && room.total, room && room.nightly_rate, room && room.rate
  ];
  for (const value of values) { const n = MSH_ALLSUP_NUM(value); if (n > 0) return n; }
  return 0;
}
function MSH_ALLSUP_CURRENCY(h, fallback) {
  const room = MSH_ALLSUP_ROOM(h);
  return MSH_ALLSUP_TEXT((h && (h.currency || h.displayCurrency)) || (room && (room.displayCurrency || room.currency)) || fallback || "GBP").toUpperCase();
}
function MSH_ALLSUP_IMAGE(h) {
  const code = MSH_ALLSUP_SUPPLIER_CODE(h);
  const direct = h && (h.image || h.image_url || h.main_image || h.direct_image_url || h.photo || h.thumbnail);
  const arr = Array.isArray(h && h.images) ? h.images : (Array.isArray(h && h.photos) ? h.photos : []);

  const tryUrl = (item) => {
    if (!item) return "";
    if (typeof item === "string") {
      const s = item.trim();
      if (!s) return "";
      if (/^https?:\/\//i.test(s)) return s;
      if (code === "HOTELBEDS") return `https://photos.hotelbeds.com/giata/original/${s.replace(/^\/+/, "")}`;
      if (code === "WEBBEDS") return `https://photos.webbeds.com/${s.replace(/^\/+/, "")}`;
      return "";
    }
    return tryUrl(item.url || item.image_url || item.path || "");
  };

  try { const fi = typeof firstImage === "function" ? firstImage(h || {}) : ""; if (fi) return fi; } catch {}
  return tryUrl(direct) || arr.map(tryUrl).find(Boolean) || "";
}
function MSH_ALLSUP_HOTEL_ONLY(h) {
  try { if (typeof isStrictHotelOnly === "function" && !isStrictHotelOnly(h)) return false; } catch {}
  const text = MSH_ALLSUP_NORM([
    MSH_ALLSUP_NAME(h), h && h.propertyType, h && h.property_type, h && h.type, h && h.category,
    h && h.categoryName, h && h.accommodationType, h && h.accommodation_type, h && h.description
  ].filter(Boolean).join(" "));
  if (!text || /(test|demo|placeholder|sample|fake|dummy|example)/.test(text)) return false;
  if (/(apartment|apartments|serviced apartment|service apartment|aparthotel|apart hotel|studio|residence|villa|holiday home|vacation rental|condo|penthouse|loft|hostel|camp|caravan|farm stay|cottage|guest house|guesthouse|bed and breakfast|\bb\s*b\b|rental|for rent|for sale)/.test(text)) return false;
  return /(hotel|inn|motel|resort|lodge|suites|marriott|hilton|hyatt|radisson|novotel|ibis|mercure|sheraton|doubletree|crowne plaza|intercontinental|fairmont|ritz|waldorf|sofitel|westin|travelodge|premier inn|holiday inn|park plaza|apex|citizenm|moxy)/.test(text);
}
function MSH_ALLSUP_COUNTRY_OK(actual, wanted) {
  if (!MSH_ALLSUP_TEXT(wanted)) return true;
  try { if (typeof mshSameCountryForCustomer === "function") return mshSameCountryForCustomer(actual, wanted); } catch {}
  const a = MSH_ALLSUP_NORM(actual), b = MSH_ALLSUP_NORM(wanted);
  if (!a || !b) return true;
  if (a === b) return true;
  const uk = new Set(["united kingdom", "uk", "gb", "great britain", "england", "scotland", "wales", "northern ireland"]);
  return uk.has(a) && uk.has(b);
}
function MSH_ALLSUP_CITY_ALIASES(v) {
  const n = MSH_ALLSUP_NORM(v);
  const set = new Set([n]);
  if (!n) return set;
  const compact = n.replace(/\b(city|town|municipality|metropolitan|metro|district|region|province|county|state|emirate|prefecture|borough)\b/g, "").replace(/\s+/g, " ").trim();
  if (compact) set.add(compact);
  const manual = {
    "new york": ["new york city", "nyc", "manhattan", "brooklyn", "queens"],
    "new york city": ["new york", "nyc", "manhattan", "brooklyn", "queens"],
    "london": ["greater london", "city of london", "westminster", "kensington", "chelsea", "camden", "shoreditch"],
    "brighton": ["brighton and hove", "hove"],
    "brighton and hove": ["brighton", "hove"],
    "orlando": ["lake buena vista", "kissimmee", "winter park", "international drive", "maingate"],
    "dubai": ["deira", "bur dubai", "downtown dubai", "jumeirah"],
    "paris": ["ile de france", "la defense"],
    "rome": ["roma"],
    "florence": ["firenze"],
    "venice": ["venezia"],
    "munich": ["munchen", "muenchen"],
    "cologne": ["koln", "koeln"],
    "vienna": ["wien"],
    "prague": ["praha"],
    "lisbon": ["lisboa"],
    "athens": ["athina"],
    "montreal": ["montrÃ©al"],
    "sao paulo": ["sÃ£o paulo"],
    "mexico city": ["ciudad de mexico", "cdmx"],
    "bangkok": ["krung thep"],
    "tokyo": ["tokyo to"],
    "beijing": ["peking"],
    "mumbai": ["bombay"],
    "cape town": ["capetown"]
  };
  for (const x of manual[n] || []) set.add(MSH_ALLSUP_NORM(x));
  for (const [k, vals] of Object.entries(manual)) if (vals.map(MSH_ALLSUP_NORM).includes(n)) set.add(k);
  return set;
}
function MSH_ALLSUP_CITY_OK(actual, wanted, country) {
  if (!MSH_ALLSUP_TEXT(wanted)) return true;
  try { if (typeof mshSameCityForCustomer === "function" && mshSameCityForCustomer(actual, wanted, country)) return true; } catch {}
  const a = MSH_ALLSUP_NORM(actual), b = MSH_ALLSUP_NORM(wanted);
  if (!b) return true;
  if (!a) return false;
  if (a === b) return true;
  const aa = MSH_ALLSUP_CITY_ALIASES(a), bb = MSH_ALLSUP_CITY_ALIASES(b);
  for (const x of aa) if (bb.has(x)) return true;
  for (const x of aa) for (const y of bb) {
    if (x && y && (x === y || x.startsWith(y + " ") || y.startsWith(x + " ") || x.includes(" " + y + " ") || y.includes(" " + x + " "))) return true;
  }
  return false;
}
function MSH_ALLSUP_PUBLIC(h, query, sourceLabel) {
  let row = h || {};
  try { if (typeof normalizeHotel === "function") row = normalizeHotel({ ...row }, query.currency || row.currency || "GBP"); } catch {}
  try { if (typeof publicHotel === "function") row = publicHotel(row); } catch {}
  const room = MSH_ALLSUP_ROOM(row);
  const price = MSH_ALLSUP_PRICE(row);
  const currency = MSH_ALLSUP_CURRENCY(row, query.currency);
  const supplierCode = MSH_ALLSUP_SUPPLIER_CODE({ ...h, ...row });
  const supplierName = supplierCode === "WEBBEDS" ? "WebBeds" : supplierCode === "HOTELBEDS" ? "Hotelbeds" : supplierCode === "RATEHAWK" ? "RateHawk" : supplierCode === "HYPERGUEST" ? "HyperGuest" : "Current supplier";
  const id = MSH_ALLSUP_ID(row);
  const rateId = MSH_ALLSUP_TEXT(room.rate_source_id || row.rate_source_id || row.supplier_rate_id || row.rateKey || row.rate_key || makeRef("RATE"));
  const ts = MSH_ALLSUP_TEXT(room.rate_source_timestamp || row.rate_source_timestamp || row.updated_at || row.created_at || nowISO());
  return {
    ...row,
    hotelId: id,
    hotel_id: id,
    id,
    name: MSH_ALLSUP_NAME(row),
    hotel_name: MSH_ALLSUP_NAME(row),
    country: MSH_ALLSUP_COUNTRY(row, query.country),
    city: MSH_ALLSUP_CITY(row, query.city),
    image: MSH_ALLSUP_IMAGE(row),
    image_url: MSH_ALLSUP_IMAGE(row),
    price,
    convertedPrice: price,
    displayPrice: price,
    currency,
    displayCurrency: currency,
    availableToBook: price > 0,
    live_rate_ready: price > 0,
    availabilityMode: price > 0 ? "current_supplier_rate" : "check_current_rate",
    accommodationMode: "hotel_only",
    propertyType: "hotel",
    source: sourceLabel || row.source || `${supplierCode.toLowerCase()}_current_supplier`,
    supplierLabel: supplierName,
    supplier_code: supplierCode,
    supplier_name: supplierName,
    rate_source_id: rateId,
    rate_source_timestamp: ts,
    source_health: price > 0 ? "verified" : "checking",
    rooms: [{
      roomCode: room.roomCode || room.room_code || room.rate_id || room.rate_key || "STANDARD",
      roomName: room.roomName || room.room_name || room.rate_name || "Available room",
      board: room.board || room.boardName || room.board_name || "Room details before checkout",
      cancellation: room.cancellation || room.cancellationPolicy || "Cancellation information is shown before you complete your booking.",
      taxes: room.taxes || "Applicable taxes and fees are shown before you complete your booking.",
      price,
      convertedPrice: price,
      displayCurrency: currency,
      currency,
      rate_source_id: rateId,
      rate_source_timestamp: ts,
      source_health: price > 0 ? "verified" : "checking"
    }]
  };
}
function MSH_ALLSUP_DATA_FILES() {
  const base = typeof DATA_DIR !== "undefined" ? DATA_DIR : path.join(__dirname, "data");
  const names = new Set([
    typeof HOTELS_FILE !== "undefined" ? HOTELS_FILE : "",
    path.join(base, "live_hotels.json"), path.join(base, "hotels.json"), path.join(base, "hotelbeds_hotels.json"),
    path.join(base, "webbeds_hotels.json"), path.join(base, "ratehawk_hotels.json"), path.join(base, "hyperguest_hotels.json"),
    path.join(base, "hotelbeds_rates.json"), path.join(base, "webbeds_rates.json"), path.join(base, "ratehawk_rates.json"), path.join(base, "hyperguest_rates.json")
  ].filter(Boolean));
  try {
    if (fs.existsSync(base)) {
      for (const file of fs.readdirSync(base)) {
        if (!/\.json$/i.test(file)) continue;
        if (/(hotel|rate|supplier|webbeds|hotelbeds|ratehawk|hyperguest)/i.test(file)) names.add(path.join(base, file));
      }
    }
  } catch {}
  return [...names];
}
function MSH_ALLSUP_HARVESTED(query) {
    const rows = [];
    
    // 1. Load from global chunk cache (memory)
    if (global.mshChunkCache) {
        rows.push(...Object.values(global.mshChunkCache));
    }

    // 2. Load from data files on disk (fallback)
    for (const file of MSH_ALLSUP_DATA_FILES()) {
        try {
            const parsed = typeof readJSON === "function" ? readJSON(file, []) : JSON.parse(fs.readFileSync(file, "utf8"));
            const arr = MSH_ALLSUP_ARRAY(parsed);
            const sourceFile = path.basename(file).replace(/\.json$/i, "");
            rows.push(...arr.map((h) => ({ ...h, source: h.source || `${sourceFile}_harvested_current_rate` })));
        } catch {}
    }
    return rows;
}

async function MSH_ALLSUP_LIVE_CONNECTORS(query) {
  const limit = Math.max(50, Math.min(Number(query.limit || 300), 1000));
  const tasks = [];
  if (typeof hotelbedsAvailabilitySearch === "function") {
    tasks.push(Promise.race([
      hotelbedsAvailabilitySearch({ ...query, limit }).then((r) => (Array.isArray(r && r.hotels) ? r.hotels : [])).catch(() => []),
      new Promise((resolve) => setTimeout(() => resolve([]), 7500))
    ]).then((rows) => rows.map((h) => ({ ...h, source: "hotelbeds_live_supplier", supplier_code: "HOTELBEDS", supplierLabel: "Hotelbeds" }))));
  }
  if (typeof findWebbedsCityCodeFromCache === "function" && typeof buildWebbedsSearchXml === "function" && typeof webbedsPostXml === "function" && typeof parseWebbedsHotels === "function") {
    tasks.push((async () => {
      try {
        const cityId = findWebbedsCityCodeFromCache(query.city, query.country) || (typeof webbedsCityIdFromName === "function" ? webbedsCityIdFromName(query.city) : "");
        if (!cityId) return [];
        const built = buildWebbedsSearchXml({
          ...query,
          cityId,
          currencyId: typeof webbedsCurrencyIdFromCode === "function" ? webbedsCurrencyIdFromCode(query.currency || "GBP") : query.currency || "GBP",
          nationalityId: typeof webbedsCountryIdFromCode === "function" ? webbedsCountryIdFromCode(query.nationality || "GB") : "",
          residenceId: typeof webbedsCountryIdFromCode === "function" ? webbedsCountryIdFromCode(query.residence || "GB") : ""
        });
        if (!built || !built.ok) return [];
        const wb = await Promise.race([
          webbedsPostXml(built.xml).catch(() => ({ text: "" })),
          new Promise((resolve) => setTimeout(() => resolve({ text: "" }), 7500))
        ]);
        return parseWebbedsHotels(wb.text || "", query.currency || "GBP").map((h) => ({ ...h, country: query.country || h.country, city: query.city || h.city, source: "webbeds_live_supplier", supplier_code: "WEBBEDS", supplierLabel: "WebBeds" }));
      } catch { return []; }
    })());
  }
  if (typeof ratehawkHotels === "function") {
    tasks.push(Promise.race([
      ratehawkHotels({ ...query, limit }).catch(() => []),
      new Promise((resolve) => setTimeout(() => resolve([]), 7500))
    ]).then((rows) => (Array.isArray(rows) ? rows : []).map((h) => ({ ...h, source: "ratehawk_live_supplier", supplier_code: "RATEHAWK", supplierLabel: "RateHawk" }))));
  }
  if (typeof hyperguestHotels === "function") {
    tasks.push(Promise.race([
      hyperguestHotels({ ...query, limit }).catch(() => []),
      new Promise((resolve) => setTimeout(() => resolve([]), 7500))
    ]).then((rows) => (Array.isArray(rows) ? rows : []).map((h) => ({ ...h, source: "hyperguest_live_supplier", supplier_code: "HYPERGUEST", supplierLabel: "HyperGuest" }))));
  }
  const settled = await Promise.allSettled(tasks);
  return settled.flatMap((x) => x.status === "fulfilled" && Array.isArray(x.value) ? x.value : []);
}
function MSH_ALLSUP_DEDUPE(rows, query) {
  const seen = new Set();
  const out = [];
  
  // Normalize the requested city for a loose match
  const reqCity = MSH_ALLSUP_NORM(query.city);
  const reqCountry = MSH_ALLSUP_NORM(query.country);

  for (const item of Array.isArray(rows) ? rows : []) {
    if (!item) continue;
    
    // 1. Basic checks
    if (!MSH_ALLSUP_HOTEL_ONLY(item)) continue;
    if (typeof isBlockedCountry === "function" && isBlockedCountry(MSH_ALLSUP_COUNTRY(item, query.country))) continue;
    
    // 2. LOOSE MATCHING FOR CHUNKS & WEBBEDS
    // We add 'webbeds' to this list so it bypasses strict city/country string matching
    const src = String(item.source || item.supplierLabel || "").toLowerCase();
    const isLooseSource = src.includes('local_chunk_cache') || 
                          src.includes('harvested_current_rates') || 
                          src.includes('webbeds');
    
    if (!isLooseSource) {
        // Strict matching for other live suppliers
        if (!MSH_ALLSUP_COUNTRY_OK(MSH_ALLSUP_COUNTRY(item, query.country), query.country)) continue;
        if (!MSH_ALLSUP_CITY_OK(MSH_ALLSUP_CITY(item, query.city), query.city, query.country)) continue;
    } else {
        // For chunks and WebBeds, only ensure there is some text overlap if the query has a city
        const itemCity = MSH_ALLSUP_NORM(MSH_ALLSUP_CITY(item));
        const itemCountry = MSH_ALLSUP_NORM(MSH_ALLSUP_COUNTRY(item));
        
        // If we have a requested city, check if it loosely matches
        if (reqCity && reqCity.length > 2) {
            const cityMatch = itemCity.includes(reqCity) || reqCity.includes(itemCity);
            
            // If it doesn't match, check the country as a fallback
            if (!cityMatch) {
                if (reqCountry && reqCountry.length > 2) {
                    const countryMatch = itemCountry.includes(reqCountry) || reqCountry.includes(itemCountry);
                    if (!countryMatch) continue; // Skip if neither city nor country matches
                } else {
                    continue; // Skip if city doesn't match and we have no country to fallback on
                }
            }
        }
        
        // If we have a requested country but no requested city, check country
        if (reqCountry && reqCountry.length > 2 && (!reqCity || reqCity.length <= 2)) {
            const countryMatch = itemCountry.includes(reqCountry) || reqCountry.includes(itemCountry);
            if (!countryMatch) continue;
        }
    }

    const hotel = MSH_ALLSUP_PUBLIC(item, query, item.source || item.supplierLabel);
    const key = MSH_ALLSUP_NORM(`${hotel.supplier_code}|${hotel.hotelId}|${hotel.name}|${hotel.city}|${hotel.country}`);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(hotel);
  }
  
  out.sort((a, b) => {
    // 1. Chunks first â€” they have real images and are already in RAM
    const aIsChunk = MSH_ALLSUP_NORM(a.source).includes("chunk") ? 1 : 0;
    const bIsChunk = MSH_ALLSUP_NORM(b.source).includes("chunk") ? 1 : 0;
    if (aIsChunk !== bIsChunk) return bIsChunk - aIsChunk;
    
    // 2. Then live suppliers with real prices
    const ap = MSH_ALLSUP_PRICE(a), bp = MSH_ALLSUP_PRICE(b);
    const al = MSH_ALLSUP_NORM(a.source).includes("live") ? 1 : 0;
    const bl = MSH_ALLSUP_NORM(b.source).includes("live") ? 1 : 0;
    if (bp > 0 && ap <= 0) return 1;
    if (ap > 0 && bp <= 0) return -1;
    if (bl !== al) return bl - al;
    return MSH_ALLSUP_NAME(a).localeCompare(MSH_ALLSUP_NAME(b));
  });
  
  return out;
}
async function MSH_ALLSUP_COLLECT(query) {
  const started = Date.now();
  const target = Math.max(97, Math.min(Number(query.limit || 300), 1000));
  const collected = [];
  const supplierStats = [];

  async function addSupplier(label, code, fn) {
    const t = Date.now();
    try {
      console.log(`[SUPPLIER GLOBAL] ${label} search started`);
      const rows = await Promise.race([
        Promise.resolve(fn(query)).catch((err) => ({ __error: err })),
        new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 12000))
      ]);
      if (rows && rows.__timeout) {
        supplierStats.push({ supplier: code, count: 0, ms: Date.now() - t, status: "timeout" });
        console.log(`[SUPPLIER GLOBAL] ${label} timeout in ${Date.now() - t} ms`);
        return 0;
      }
      if (rows && rows.__error) {
        supplierStats.push({ supplier: code, count: 0, ms: Date.now() - t, status: "error", error: rows.__error.message });
        console.log(`[SUPPLIER GLOBAL] ${label} failed: ${rows.__error.message}`);
        return 0;
      }
      const clean = (Array.isArray(rows) ? rows : []).map((h) => ({
        ...h,
        country: MSH_ALLSUP_COUNTRY(h, query.country) || query.country,
        city: MSH_ALLSUP_CITY(h, query.city) || query.city,
        source: h.source || `${code.toLowerCase()}_live_supplier`,
        supplier_code: h.supplier_code || code,
        supplierLabel: h.supplierLabel || label,
        supplier_name: h.supplier_name || label
      }));
      collected.push(...clean);
      supplierStats.push({ supplier: code, count: clean.length, ms: Date.now() - t, status: "ok" });
      console.log(`[SUPPLIER GLOBAL] ${label} returned ${clean.length} hotels in ${Date.now() - t} ms`);
      return clean.length;
    } catch (err) {
      supplierStats.push({ supplier: code, count: 0, ms: Date.now() - t, status: "error", error: err.message, stack: err.stack });
      console.log(`[SUPPLIER GLOBAL] ${label} failed: ${err.message}`);
      return 0;
    }
  }

  await Promise.allSettled([
    addSupplier("WebBeds", "WEBBEDS", MSH_SU_WEBBEDS),
    addSupplier("RateHawk", "RATEHAWK", MSH_SU_RATEHAWK),
    addSupplier("HyperGuest", "HYPERGUEST", MSH_SU_HYPERGUEST),
    addSupplier("Hotelbeds", "HOTELBEDS", MSH_SU_HOTELBEDS)
  ]);
  const liveDedupe = MSH_ALLSUP_DEDUPE(collected, query);
  
  // MSH CHUNK INJECTION: Pull from the in-memory chunk cache (loaded at startup)
  // This is the Booking.com-style fast path â€” 106k+ hotels already in RAM.
  let harvested = [];
  if (global.mshChunkCache) {
      const wantedCity = MSH_ALLSUP_NORM(query.city);
      const wantedCountry = MSH_ALLSUP_NORM(query.country);
      for (const h of Object.values(global.mshChunkCache)) {
          const hCity = MSH_ALLSUP_NORM(h.city || h.destination || h.cityName || "");
          const hCountry = MSH_ALLSUP_NORM(h.country || h.countryName || "");
          const cityOk = !wantedCity || hCity.includes(wantedCity) || wantedCity.includes(hCity);
          const countryOk = !wantedCountry || hCountry.includes(wantedCountry) || wantedCountry.includes(hCountry);
          if (cityOk && countryOk) {
              harvested.push({ ...h, source: "local_chunk_cache", supplier_code: h.supplier_code || "CHUNK" });
          }
      }
      console.log(`[SUPPLIER GLOBAL] chunks matched ${harvested.length} for ${query.city}`);
  }

  const harvestedDedupe = MSH_ALLSUP_DEDUPE(harvested, query);
  const merged = MSH_ALLSUP_DEDUPE([...liveDedupe, ...harvestedDedupe], query);

  try {
    recordActivity("global_supplier_destination_engine", query, {
      target,
      live: liveDedupe.length,
      harvested: harvestedDedupe.length,
      total: merged.length,
      suppliers: supplierStats,
      ms: Date.now() - started
    });
  } catch {}

  console.log(`[SUPPLIER GLOBAL] final live=${liveDedupe.length} harvested=${harvestedDedupe.length} total=${merged.length} in ${Date.now() - started} ms`);
  return merged;
}
function MSH_ALLSUP_QUERY(req) {
  const q = req.query || {};
  return {
    ...q,
    country: MSH_ALLSUP_TEXT(q.country || q.destinationCountry || q.destination_country || "United Kingdom"),
    city: MSH_ALLSUP_TEXT(q.city || q.destinationCity || q.destination_city || q.location || ""),
    currency: MSH_ALLSUP_TEXT(q.currency || "GBP").toUpperCase(),
    checkIn: MSH_ALLSUP_TEXT(q.checkIn || q.checkin || q.check_in || q.arrival),
    checkOut: MSH_ALLSUP_TEXT(q.checkOut || q.checkout || q.check_out || q.departure),
    guests: MSH_ALLSUP_TEXT(q.guests || q.adults || "2"),
    rooms: MSH_ALLSUP_TEXT(q.rooms || "1"),
    propertyType: "hotels",
    property_type: "hotels",
    accommodationMode: "hotel_only",
    supplierScope: "webbeds_ratehawk_hyperguest"
  };
}
function MSH_ALLSUP_MATCH_SCORE(h, query) {
  const wantedId = MSH_ALLSUP_NORM(query.hotelId || query.hotel_id || query.id);
  const wantedName = MSH_ALLSUP_NORM(query.hotelName || query.hotel_name || query.name);
  const id = MSH_ALLSUP_NORM([h.hotelId, h.hotel_id, h.id, h.code, h.supplier_hotel_id].filter(Boolean).join(" "));
  const name = MSH_ALLSUP_NORM(MSH_ALLSUP_NAME(h));
  let score = 0;
  if (wantedId && id && (id === wantedId || id.includes(wantedId) || wantedId.includes(id))) score += 1000;
  if (wantedName && name && (name === wantedName || name.includes(wantedName) || wantedName.includes(name))) score += 900;
  if (MSH_ALLSUP_CITY_OK(MSH_ALLSUP_CITY(h), query.city, query.country)) score += 100;
  if (MSH_ALLSUP_PRICE(h) > 0) score += 500;
  if (MSH_ALLSUP_NORM(h.source).includes("live")) score += 150;
  return score;
}
app.get("/api/all-current-supplier-hotels", async (req, res) => {
  const started = Date.now();
  const query = MSH_ALLSUP_QUERY(req);
  const limit = Math.max(1, Math.min(Number(req.query.limit || 200), 1000));
  const offset = Math.max(0, Number(req.query.offset || 0));
  try {
    const all = await MSH_ALLSUP_COLLECT({ ...query, limit: Math.max(limit, 300) });
    const hotels = all.slice(offset, offset + limit);
    recordActivity("all_current_supplier_hotels", query, { count: hotels.length, totalAvailable: all.length, priced: hotels.filter((h) => MSH_ALLSUP_PRICE(h) > 0).length, ms: Date.now() - started });
    return res.json({ ok: true, success: true, source: "all_current_supplier_hotel_engine", accommodationMode: "hotel_only", supplierScope: "webbeds_ratehawk_hyperguest_and_harvested_rates", count: hotels.length, totalAvailable: all.length, hasMore: offset + hotels.length < all.length, hotels, customerMessage: hotels.length ? "Hotels found for your search." : "We could not find available hotels for this destination right now. Please try another city or date." });
  } catch (err) {
    recordActivity("all_current_supplier_hotels_error", query, { error: err.message, stack: err.stack });
    return res.json({ ok: true, success: true, source: "all_current_supplier_hotel_engine", count: 0, totalAvailable: 0, hasMore: false, hotels: [], customerMessage: "We could not find available hotels for this destination right now. Please try another city or date." });
  }
});
app.get("/api/second-auto-live-rate-selected", async (req, res) => {
  const query = MSH_ALLSUP_QUERY(req);
  try {
    const all = await MSH_ALLSUP_COLLECT({ ...query, limit: 1000 });
    const ranked = all.map((hotel) => ({ hotel, score: MSH_ALLSUP_MATCH_SCORE(hotel, query) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    const selected = ranked[0]?.hotel || all.find((h) => MSH_ALLSUP_PRICE(h) > 0) || null;
    if (!selected || MSH_ALLSUP_PRICE(selected) <= 0) {
      return res.json({ ok: true, found: false, customer_offer: null, hotels_compared: all.length, message: "Today's price is still being checked. Please choose another hotel or try again shortly." });
    }
    const room = MSH_ALLSUP_ROOM(selected);
    const price = MSH_ALLSUP_PRICE(selected);
    const currency = MSH_ALLSUP_CURRENCY(selected, query.currency);
    const offer = { hotelId: selected.hotelId || selected.hotel_id, hotelName: selected.name || selected.hotel_name, country: selected.country || query.country, city: selected.city || query.city, roomCode: room.roomCode || room.room_code || "STANDARD", roomName: room.roomName || room.room_name || "Available room", board: room.board || "Room details before checkout", cancellation: room.cancellation || "Cancellation information is shown before you complete your booking.", amount: price, price, currency, supplier_code: selected.supplier_code || MSH_ALLSUP_SUPPLIER_CODE(selected), supplier_name: selected.supplier_name || selected.supplierLabel || "Current supplier", rate_source_id: room.rate_source_id || selected.rate_source_id || makeRef("RATE"), rate_source_timestamp: room.rate_source_timestamp || selected.rate_source_timestamp || nowISO(), source_health: "verified" };
    recordSupplierAudit("second_auto_live_rate_selected_offer", { hotelId: offer.hotelId, hotelName: offer.hotelName, country: offer.country, city: offer.city, amount: offer.amount, currency: offer.currency, supplier_name: offer.supplier_name, supplier_code: offer.supplier_code, rate_source_id: offer.rate_source_id, rate_source_timestamp: offer.rate_source_timestamp });
    return res.json({ ok: true, found: true, source: "second_auto_live_rate_selected", supplierScope: "webbeds_ratehawk_hyperguest_and_harvested_rates", selected_hotel: selected, customer_offer: offer, best_offer: offer, offer, hotels_compared: all.length, message: "Current price found." });
  } catch (err) {
    recordActivity("second_auto_live_rate_selected_error", query, { error: err.message, stack: err.stack });
    return res.json({ ok: true, found: false, customer_offer: null, message: "Today's price could not be checked. Please try again shortly." });
  }
});
app.get("/api/live-rate-after-selection", async (req, res) => {
  req.url = req.url.replace("/api/live-rate-after-selection", "/api/second-auto-live-rate-selected");
  return app._router.handle(req, res);
});
// MSH ALL CURRENT SUPPLIER HOTEL + SECOND LIVE RATE ENGINE END

function MSH_GLOBAL_DEST_TEXT(v) {
  return String(v || "").trim();
}
function MSH_GLOBAL_DEST_NORM(v) {
  return MSH_GLOBAL_DEST_TEXT(v).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
function MSH_GLOBAL_DEST_FILES() {
  return [
    path.join(__dirname, "data", "live-destinations.json"),
    path.join(__dirname, "..", "data", "live-destinations.json"),
    path.join(__dirname, "data", "supplier_destination_map.json"),
    path.join(__dirname, "..", "data", "supplier_destination_map.json")
  ];
}
function MSH_GLOBAL_DEST_READ(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(j)) return j;
    if (Array.isArray(j.destinations)) return j.destinations;
    if (Array.isArray(j.countries)) {
      const out = [];
      for (const c of j.countries) {
        for (const city of c.cities || []) out.push({ country: c.country || c.name, city: typeof city === "string" ? city : city.name, ...(typeof city === "object" ? city : {}) });
      }
      return out;
    }
    return [];
  } catch {
    return [];
  }
}
function MSH_GLOBAL_DEST_ROWS() {
  if (global.__MSH_GLOBAL_DEST_ROWS) return global.__MSH_GLOBAL_DEST_ROWS;
  const rows = [];
  for (const file of MSH_GLOBAL_DEST_FILES()) rows.push(...MSH_GLOBAL_DEST_READ(file));
  global.__MSH_GLOBAL_DEST_ROWS = rows;
  console.log(`[DESTINATION RESOLVER] loaded ${rows.length} destination rows`);
  return rows;
}
function MSH_GLOBAL_DEST_SUPPLIER_CODE(row, supplier) {
  const s = String(supplier || "").toLowerCase();
  const obj = row[s] || row[s.toUpperCase()] || {};
  return MSH_GLOBAL_DEST_TEXT(
    obj.cityId || obj.city_id || obj.destinationCode || obj.destination_code || obj.code ||
    row[`${s}CityId`] || row[`${s}_city_id`] || row[`${s}DestinationCode`] || row[`${s}_destination_code`] ||
    row.cityId || row.city_id || row.destinationCode || row.destination_code || row.code || row.id
  );
}
function MSH_GLOBAL_DEST_FIND(country, city, supplier) {
  const cn = MSH_GLOBAL_DEST_NORM(country);
  const ct = MSH_GLOBAL_DEST_NORM(city);
  if (!ct) return "";
  for (const row of MSH_GLOBAL_DEST_ROWS()) {
    const rc = MSH_GLOBAL_DEST_NORM(row.country || row.countryName || row.destinationCountry);
    const rt = MSH_GLOBAL_DEST_NORM(row.city || row.cityName || row.name || row.destinationCity);
    if (rt === ct && (!cn || !rc || rc === cn)) {
      const code = MSH_GLOBAL_DEST_SUPPLIER_CODE(row, supplier);
      if (code) return code;
    }
  }
  return "";
}

// MSH SUPPLIER UNION HOTEL SEARCH + SECOND LIVE RATE UPDATE START
function MSH_SU_TEXT(v) { return String(v || "").trim(); }
function MSH_SU_NORM(v) { return MSH_SU_TEXT(v).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
function MSH_SU_NUM(v) { const n = Number(String(v || "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; }
function MSH_SU_ARR(v) { if (Array.isArray(v)) return v; if (Array.isArray(v?.hotels)) return v.hotels; if (Array.isArray(v?.data)) return v.data; if (Array.isArray(v?.results)) return v.results; if (Array.isArray(v?.rows)) return v.rows; if (Array.isArray(v?.items)) return v.items; return []; }
function MSH_SU_ROOM(h) { return Array.isArray(h?.rooms) && h.rooms.length ? h.rooms[0] : (Array.isArray(h?.rates) && h.rates.length ? h.rates[0] : {}); }
function MSH_SU_NAME(h) { return MSH_SU_TEXT(h?.name || h?.hotel_name || h?.hotelName || h?.property_name || h?.title || ""); }
function MSH_SU_COUNTRY(h, fallback) { return MSH_SU_TEXT(h?.country || h?.countryName || h?.location?.country || h?.destinationCountry || fallback || ""); }
function MSH_SU_CITY(h, fallback) { return MSH_SU_TEXT(h?.city || h?.cityName || h?.destination || h?.location?.city || h?.destinationCity || fallback || ""); }
function MSH_SU_ID(h) { return MSH_SU_TEXT(h?.hotelId || h?.hotel_id || h?.id || h?.code || h?.hotel_code || h?.supplier_hotel_id || h?.supplierHotelId || `${MSH_SU_NAME(h)}-${MSH_SU_CITY(h)}-${MSH_SU_COUNTRY(h)}`); }
function MSH_SU_PRICE(h) { const r = MSH_SU_ROOM(h); return MSH_SU_NUM(h?.price || h?.convertedPrice || h?.displayPrice || h?.amount || h?.total || h?.from_price || h?.minRate || h?.nightly_rate || r?.price || r?.convertedPrice || r?.amount || r?.total || r?.nightly_rate || r?.net || r?.sellingRate); }
function MSH_SU_CURRENCY(h, fallback) { const r = MSH_SU_ROOM(h); return MSH_SU_TEXT(h?.currency || h?.displayCurrency || r?.displayCurrency || r?.currency || fallback || "GBP").toUpperCase(); }
function MSH_SU_IMAGE(h) {
  const supplier = MSH_SU_SUPPLIER(h);
  const list = [h?.image, h?.image_url, h?.main_image, h?.direct_image_url, h?.photo, h?.thumbnail];
  if (Array.isArray(h?.images)) list.push(...h.images);
  if (Array.isArray(h?.photos)) list.push(...h.photos);
  for (const item of list) {
    if (!item) continue;
    let url = typeof item === "string" ? item : (item?.url || item?.image_url || item?.path || "");
    url = String(url || "").trim();
    if (!url) continue;
    if (/^https?:\/\//i.test(url)) return url;
    if (supplier === "HOTELBEDS") return `https://photos.hotelbeds.com/giata/original/${url.replace(/^\/+/, "")}`;
    if (supplier === "WEBBEDS") return `https://photos.webbeds.com/${url.replace(/^\/+/, "")}`;
  }
  return "";
}
function MSH_SU_SUPPLIER(h, fallback="") { const raw = MSH_SU_NORM([h?.supplier_code, h?.supplier_name, h?.supplier, h?.source, h?.provider, h?.supplierLabel, h?.inventory_source, h?.supplier_private?.supplier_code, fallback].join(" ")); if (raw.includes("webbeds") || raw.includes("dotw")) return "WEBBEDS"; if (raw.includes("ratehawk") || raw.includes("worldota")) return "RATEHAWK"; if (raw.includes("hyperguest")) return "HYPERGUEST"; if (raw.includes("hotelbeds") || raw.includes("hotel beds")) return "HOTELBEDS"; return fallback || "HOTELBEDS"; }
function MSH_SU_HOTEL_ONLY(h) { const text = MSH_SU_NORM([MSH_SU_NAME(h), h?.propertyType, h?.property_type, h?.type, h?.category, h?.categoryName, h?.accommodationType, h?.description].filter(Boolean).join(" ")); if (!text || /(test|demo|placeholder|sample|fake|dummy|example)/.test(text)) return false; if (/(apartment|apartments|flat|serviced apartment|service apartment|aparthotel|apart hotel|studio|residence|residences|villa|villas|holiday home|vacation rental|condo|penthouse|loft|private room|shared room|entire home|entire place|hostel|camp|caravan|farm stay|cottage|guest house|guesthouse|bed and breakfast|rental|for rent|for sale)/.test(text)) return false; return /(hotel|inn|motel|resort|lodge|suites|marriott|hilton|hyatt|radisson|novotel|ibis|mercure|sheraton|doubletree|crowne plaza|intercontinental|fairmont|ritz|waldorf|sofitel|westin|travelodge|premier inn|holiday inn|park plaza|apex|citizenm|moxy)/.test(text); }
function MSH_SU_COUNTRY_OK(a,b) { const x=MSH_SU_NORM(a), y=MSH_SU_NORM(b); if (!y) return true; if (!x) return true; if (x===y) return true; const uk=new Set(["united kingdom","uk","gb","great britain","england","scotland","wales","northern ireland"]); return uk.has(x)&&uk.has(y); }
function MSH_SU_CITY_OK(a, b, country) {
  if (!MSH_SU_TEXT(b)) return true;
  try { if (typeof mshSameCityForCustomer === "function" && mshSameCityForCustomer(a, b, country)) return true; } catch {}
  const x = MSH_SU_NORM(a), y = MSH_SU_NORM(b);
  if (!y) return true;
  if (!x) return false;
  if (x === y) return true;
  try {
    const aa = MSH_ALLSUP_CITY_ALIASES(x);
    const bb = MSH_ALLSUP_CITY_ALIASES(y);
    for (const v of aa) if (bb.has(v)) return true;
    for (const v of aa) for (const w of bb) {
      if (v && w && (v.startsWith(w + " ") || w.startsWith(v + " ") || v.includes(" " + w + " ") || w.includes(" " + v + " "))) return true;
    }
  } catch {}
  return false;
}
function MSH_SU_PUBLIC(h, query, fallbackSupplier="") { const r=MSH_SU_ROOM(h); const price=MSH_SU_PRICE(h); const currency=MSH_SU_CURRENCY(h, query.currency); const supplier=MSH_SU_SUPPLIER(h, fallbackSupplier); const supplierName = supplier==="WEBBEDS"?"WebBeds":supplier==="RATEHAWK"?"RateHawk":supplier==="HYPERGUEST"?"HyperGuest":"Hotelbeds"; const id=MSH_SU_ID(h); const name=MSH_SU_NAME(h); const country=MSH_SU_COUNTRY(h, query.country); const city=MSH_SU_CITY(h, query.city); const image=MSH_SU_IMAGE(h); const rateId=MSH_SU_TEXT(r?.rate_source_id || r?.rateKey || r?.rate_key || r?.rate_id || h?.rate_source_id || h?.supplier_rate_id || h?.rateKey || h?.rate_key || (price>0 ? makeRef("RATE") : "")); const ts=MSH_SU_TEXT(r?.rate_source_timestamp || h?.rate_source_timestamp || h?.updated_at || h?.created_at || nowISO()); return { ...h, id, hotelId:id, hotel_id:id, name, hotel_name:name, country, city, destination:city, image, image_url:image, images:image?[image]:(Array.isArray(h?.images)?h.images:[]), propertyType:"hotel", property_type:"hotel", accommodationMode:"hotel_only", supplier_code:supplier, supplier_name:supplierName, supplierLabel:supplierName, source: h?.source || `${supplier.toLowerCase()}_supplier`, price: price || null, convertedPrice: price || null, displayPrice: price || null, currency, displayCurrency:currency, availableToBook: price>0, live_rate_ready: price>0, rate_source_id:rateId, rate_source_timestamp:ts, source_health: price>0?"verified":"checking", rooms:[{ roomCode: MSH_SU_TEXT(r?.roomCode || r?.room_code || r?.rate_id || r?.rateKey || "STANDARD"), roomName: MSH_SU_TEXT(r?.roomName || r?.room_name || r?.rate_name || "Available room"), board: MSH_SU_TEXT(r?.board || r?.boardName || r?.board_name || "Room details before checkout"), cancellation: MSH_SU_TEXT(r?.cancellation || r?.cancellationPolicy || "Cancellation information is shown before you complete your booking."), taxes: MSH_SU_TEXT(r?.taxes || "Applicable taxes and fees are shown before you complete your booking."), price: price || null, convertedPrice: price || null, displayCurrency: currency, currency, rate_source_id:rateId, rate_source_timestamp:ts, source_health: price>0?"verified":"checking" }] }; }
function MSH_SU_FILES() { const base = typeof DATA_DIR !== "undefined" ? DATA_DIR : path.join(__dirname,"data"); const names=new Set([ typeof HOTELS_FILE!=="undefined"?HOTELS_FILE:"", path.join(base,"live_hotels.json"), path.join(base,"hotels.json"), path.join(base,"hotelbeds_hotels.json"), path.join(base,"webbeds_hotels.json"), path.join(base,"ratehawk_hotels.json"), path.join(base,"hyperguest_hotels.json"), path.join(base,"hotelbeds_rates.json"), path.join(base,"webbeds_rates.json"), path.join(base,"ratehawk_rates.json"), path.join(base,"hyperguest_rates.json") ].filter(Boolean)); try { if (fs.existsSync(base)) for (const f of fs.readdirSync(base)) if (/\.json$/i.test(f) && /(hotel|rate|supplier|webbeds|hotelbeds|ratehawk|hyperguest|worldota)/i.test(f)) names.add(path.join(base,f)); } catch {} return [...names]; }
function MSH_SU_HARVESTED(query) { const rows=[]; for (const file of MSH_SU_FILES()) { try { const parsed=typeof readJSON==="function"?readJSON(file,[]):JSON.parse(fs.readFileSync(file,"utf8")); const arr=MSH_SU_ARR(parsed); const sourceFile=path.basename(file).replace(/\.json$/i,""); let fallback=""; if (/webbeds/i.test(sourceFile)) fallback="WEBBEDS"; else if (/ratehawk|worldota/i.test(sourceFile)) fallback="RATEHAWK"; else if (/hyperguest/i.test(sourceFile)) fallback="HYPERGUEST"; else if (/hotelbeds|live_hotels|hotels/i.test(sourceFile)) fallback="HOTELBEDS"; rows.push(...arr.map((h)=>({ ...h, source:h.source||`${sourceFile}_harvested`, supplier_code:h.supplier_code||fallback }))); } catch {} } return rows; }
async function MSH_SU_HOTELBEDS(query) { try { if (typeof hotelbedsAvailabilitySearch !== "function") return []; const r=await Promise.race([hotelbedsAvailabilitySearch({ ...query, limit: Math.max(100, Math.min(Number(query.limit||300), 1000)) }), new Promise((resolve)=>setTimeout(()=>resolve({hotels:[]}), 6500))]); return MSH_SU_ARR(r).map((h)=>({ ...h, source:"hotelbeds_live_supplier", supplier_code:"HOTELBEDS" })); } catch { return []; } }
async function MSH_SU_WEBBEDS(query) {
  try {
    const cityName = MSH_SU_TEXT(query.city || query.destination || "");
    const countryName = MSH_SU_TEXT(query.country || "");
    const currency = MSH_SU_TEXT(query.currency || "GBP").toUpperCase();

    console.log(`[WEBBEDS] union live lookup for ${cityName}, ${countryName}`);

    const cityId =
      MSH_SU_TEXT(query.cityId || query.city_id || query.destinationCode || "") ||
      (typeof findWebbedsCityCodeFromCache === "function" ? findWebbedsCityCodeFromCache(cityName, countryName) : "") ||
      (typeof webbedsCityIdFromName === "function" ? webbedsCityIdFromName(cityName) : "");

    if (!cityId) {
      console.log(`[WEBBEDS] union no cityId for ${cityName}, ${countryName}`);
      return [];
    }

    const built = buildWebbedsSearchXml({
      ...query,
      cityId,
      currencyId: typeof webbedsCurrencyIdFromCode === "function" ? webbedsCurrencyIdFromCode(currency) : currency,
      nationalityId: typeof webbedsCountryIdFromCode === "function" ? webbedsCountryIdFromCode(query.nationality || "GB") : "GB",
      residenceId: typeof webbedsCountryIdFromCode === "function" ? webbedsCountryIdFromCode(query.residence || "GB") : "GB"
    });

    if (!built || !built.ok || !built.xml) {
      console.log(`[WEBBEDS] union XML build failed for ${cityName}`);
      return [];
    }

    const r = await Promise.race([
      webbedsPostXml(built.xml).catch(() => ({ text: "" })),
      new Promise((resolve) => setTimeout(() => resolve({ text: "" }), 12000))
    ]);

    const hotels = parseWebbedsHotels(r.text || "", currency).map((h) => ({
      ...h,
      country: query.country || h.country || countryName,
      city: query.city || h.city || cityName,
      source: "webbeds_live_supplier",
      supplier_code: "WEBBEDS",
      supplierLabel: "WebBeds"
    }));

    console.log(`[WEBBEDS] union parsed ${hotels.length} hotels for ${cityName}`);
    return hotels;
  } catch (err) {
    console.log("[WEBBEDS] union failed:", err.message);
    return [];
  }
}
function MSH_SU_RATEHAWK_REGION(query) {
  try {
    let raw = clean(process.env.RATEHAWK_REGION_MAP || "{}");
    if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
    
    const map = JSON.parse(raw);
    const keys = [`${MSH_SU_NORM(query.country)}|${MSH_SU_NORM(query.city)}`, MSH_SU_NORM(query.city), MSH_SU_TEXT(query.city)];
    for (const k of keys) if (map[k]) return Number(map[k]);
  } catch {} 
  return Number(query.ratehawkRegionId || query.region_id || query.regionId || process.env.RATEHAWK_DEFAULT_REGION_ID || 0);
}
async function MSH_SU_RATEHAWK(query) {
  try {
    if (!(typeof ratehawkPost === "function" && typeof ratehawkConfig === "function")) return [];
    const cfg = ratehawkConfig();
    if (!cfg.ready) return [];

    let region_id = 0;
    try {
      if (typeof mshRatehawkResolveRegionId === "function") {
        region_id = await mshRatehawkResolveRegionId(query);
      }
    } catch {}

    if (!region_id) {
      region_id = MSH_SU_RATEHAWK_REGION(query);
    }

    if (!region_id) return [];

    const guests = Math.max(1, Number(query.guests || 2));
    const payload = {
      checkin: MSH_SU_TEXT(query.checkIn || query.checkin || query.check_in || tomorrowISOForRatehawk(14)),
      checkout: MSH_SU_TEXT(query.checkOut || query.checkout || query.check_out || tomorrowISOForRatehawk(15)),
      residency: MSH_SU_TEXT(query.residency || "gb").toLowerCase(),
      language: MSH_SU_TEXT(query.language || "en"),
      guests: [{ adults: guests, children: [] }],
      region_id,
      currency: MSH_SU_TEXT(query.currency || "GBP").toUpperCase()
    };
    const r = await Promise.race([
      ratehawkPost("/api/b2b/v3/search/serp/region/", payload),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, data: {} }), 6500))
    ]);
    const hotels = MSH_SU_ARR(r?.data?.hotels || r?.data?.data?.hotels || r?.data?.result?.hotels || r?.data?.hotels_data || r?.data);
    return hotels.map((h) => ({ ...h, country: query.country || h.country, city: query.city || h.city, source: "ratehawk_live_supplier", supplier_code: "RATEHAWK" }));
  } catch {
    return [];
  }
}
async function MSH_SU_HYPERGUEST(query) { try { const url=MSH_SU_TEXT(process.env.HYPERGUEST_SEARCH_URL || process.env.HYPERGUEST_AVAILABILITY_URL || ""); const token=MSH_SU_TEXT(process.env.HYPERGUEST_API_KEY || process.env.HYPERGUEST_TOKEN || ""); if (!url || !token) return []; const params=new URLSearchParams({ country:query.country||"", city:query.city||"", checkIn:query.checkIn||query.checkin||"", checkOut:query.checkOut||query.checkout||"", guests:String(query.guests||2), rooms:String(query.rooms||1), currency:query.currency||"GBP", propertyType:"hotel" }); const r=await Promise.race([fetch(`${url}${url.includes("?")?"&":"?"}${params.toString()}`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}}).then(x=>x.json()).catch(()=>({})), new Promise((resolve)=>setTimeout(()=>resolve({}),6500))]); return MSH_SU_ARR(r).map((h)=>({ ...h, country:query.country||h.country, city:query.city||h.city, source:"hyperguest_live_supplier", supplier_code:"HYPERGUEST" })); } catch { return []; } }
function MSH_SU_QUERY(req) { return { ...req.query, country:MSH_SU_TEXT(req.query.country), city:MSH_SU_TEXT(req.query.city), currency:MSH_SU_TEXT(req.query.currency||"GBP").toUpperCase(), checkIn:MSH_SU_TEXT(req.query.checkIn||req.query.checkin||req.query.check_in), checkOut:MSH_SU_TEXT(req.query.checkOut||req.query.checkout||req.query.check_out), guests:MSH_SU_TEXT(req.query.guests||"2"), rooms:MSH_SU_TEXT(req.query.rooms||"1"), propertyType:"hotel", property_type:"hotel", accommodationMode:"hotel_only", supplierScope:"webbeds_ratehawk_hyperguest" }; }
function MSH_SU_KEEP(h, query) { if (!h) return false; if (!MSH_SU_HOTEL_ONLY(h)) return false; if (!MSH_SU_COUNTRY_OK(MSH_SU_COUNTRY(h, query.country), query.country)) return false; if (!MSH_SU_CITY_OK(MSH_SU_CITY(h, query.city), query.city, query.country)) return false; return Boolean(MSH_SU_NAME(h)); }
function MSH_SU_DEDUPE(rows, query) { const seen=new Set(), out=[]; for (const raw of Array.isArray(rows)?rows:[]) { if (!MSH_SU_KEEP(raw, query)) continue; const pub=MSH_SU_PUBLIC(raw, query); const key=MSH_SU_NORM(`${pub.supplier_code}|${pub.hotelId}|${pub.name}|${pub.city}|${pub.country}`); if (!key || seen.has(key)) continue; seen.add(key); out.push(pub); } out.sort((a,b)=>{ const ap=MSH_SU_PRICE(a), bp=MSH_SU_PRICE(b); if (ap>0 && bp<=0) return -1; if (bp>0 && ap<=0) return 1; return MSH_SU_NAME(a).localeCompare(MSH_SU_NAME(b)); }); return out; }
async function MSH_SU_COLLECT(query) { return MSH_ALLSUP_COLLECT(query); }
function MSH_SU_SCORE(h, query) { const wantId=MSH_SU_NORM(query.hotelId||query.hotel_id||query.id); const wantName=MSH_SU_NORM(query.hotelName||query.hotel_name||query.name); const id=MSH_SU_NORM([h.hotelId,h.hotel_id,h.id,h.code,h.supplier_hotel_id].filter(Boolean).join(" ")); const name=MSH_SU_NORM(MSH_SU_NAME(h)); let score=0; if (wantId && id && (id===wantId || id.includes(wantId) || wantId.includes(id))) score+=1000; if (wantName && name && (name===wantName || name.includes(wantName) || wantName.includes(name))) score+=900; if (MSH_SU_PRICE(h)>0) score+=500; if (MSH_SU_NORM(h.source).includes("live")) score+=150; return score; }
app.get("/api/supplier-union-hotel-search", async (req,res)=>{ const start=Date.now(); const query=MSH_SU_QUERY(req); const limit=Math.max(1, Math.min(Number(req.query.limit||250), 1000)); const offset=Math.max(0, Number(req.query.offset||0)); try { const all=await MSH_SU_COLLECT({ ...query, limit:Math.max(limit,300) }); const hotels=all.slice(offset, offset+limit); try { recordActivity("supplier_union_hotel_search", query, { count:hotels.length, totalAvailable:all.length, priced:hotels.filter((h)=>MSH_SU_PRICE(h)>0).length, ms:Date.now()-start }); } catch {} return res.json({ ok:true, success:true, source:"supplier_union_hotel_search", accommodationMode:"hotel_only", supplierScope:"webbeds_ratehawk_hyperguest", count:hotels.length, totalAvailable:all.length, hasMore: offset+hotels.length<all.length, hotels, customerMessage: hotels.length ? "Hotels found for your search." : "We could not find available hotels for this destination right now. Please try another city or date." }); } catch(err) { return res.json({ ok:true, success:true, source:"supplier_union_hotel_search", count:0, totalAvailable:0, hasMore:false, hotels:[], customerMessage:"We could not find available hotels for this destination right now. Please try another city or date." }); } });
app.get("/api/supplier-union-selected-live-rate", async (req,res)=>{ const query=MSH_SU_QUERY(req); try { const all=await MSH_SU_COLLECT({ ...query, limit:1000 }); const ranked=all.map((h)=>({ h, score:MSH_SU_SCORE(h, query) })).filter((x)=>x.score>0).sort((a,b)=>b.score-a.score); const selected=ranked[0]?.h || all.find((h)=>MSH_SU_PRICE(h)>0) || null; if (!selected || MSH_SU_PRICE(selected)<=0) return res.json({ ok:true, found:false, customer_offer:null, hotels_compared:all.length, message:"Today's price is still being checked. Please choose another hotel or try again shortly." }); const room=MSH_SU_ROOM(selected), price=MSH_SU_PRICE(selected), currency=MSH_SU_CURRENCY(selected, query.currency); const offer={ hotelId:selected.hotelId||selected.hotel_id, hotelName:selected.name||selected.hotel_name, country:selected.country||query.country, city:selected.city||query.city, roomCode:room.roomCode||room.room_code||"STANDARD", roomName:room.roomName||room.room_name||"Available room", board:room.board||"Room details before checkout", cancellation:room.cancellation||"Cancellation information is shown before you complete your booking.", amount:price, price, currency, supplier_code:selected.supplier_code||MSH_SU_SUPPLIER(selected), supplier_name:selected.supplier_name||selected.supplierLabel||"Current supplier", rate_source_id:room.rate_source_id||selected.rate_source_id||makeRef("RATE"), rate_source_timestamp:room.rate_source_timestamp||selected.rate_source_timestamp||nowISO(), source_health:"verified" }; try { recordSupplierAudit("supplier_union_selected_live_rate", { hotelId:offer.hotelId, hotelName:offer.hotelName, country:offer.country, city:offer.city, amount:offer.amount, currency:offer.currency, supplier_name:offer.supplier_name, supplier_code:offer.supplier_code, rate_source_id:offer.rate_source_id, rate_source_timestamp:offer.rate_source_timestamp }); } catch {} return res.json({ ok:true, found:true, source:"supplier_union_selected_live_rate", supplierScope:"webbeds_ratehawk_hyperguest", selected_hotel:selected, customer_offer:offer, best_offer:offer, offer, hotels_compared:all.length, message:"Current price found." }); } catch(err) { return res.json({ ok:true, found:false, customer_offer:null, message:"Today's price could not be checked. Please try again shortly." }); } });
// MSH SUPPLIER UNION HOTEL SEARCH + SECOND LIVE RATE UPDATE END

// MYSPACE PLATFORM V2 PRODUCTION ORCHESTRATOR START
function MSH_V2_TEXT(v) { return String(v || "").trim(); }
function MSH_V2_BOOL(v) { return Boolean(MSH_V2_TEXT(v)); }
function MSH_V2_SUPPLIER_STATUS() {
  return [
    { supplier: "HyperGuest", code: "HYPERGUEST", configured: MSH_V2_BOOL(process.env.HYPERGUEST_API_KEY || process.env.HYPERGUEST_TOKEN) && MSH_V2_BOOL(process.env.HYPERGUEST_SEARCH_URL || process.env.HYPERGUEST_AVAILABILITY_URL), requirement: "HYPERGUEST_API_KEY/HYPERGUEST_TOKEN plus HYPERGUEST_SEARCH_URL/HYPERGUEST_AVAILABILITY_URL" },
    { supplier: "Hotelbeds", code: "HOTELBEDS", configured: MSH_V2_BOOL(process.env.HOTELBEDS_API_KEY || process.env.HOTELBEDS_KEY) && MSH_V2_BOOL(process.env.HOTELBEDS_SECRET || process.env.HOTELBEDS_API_SECRET), requirement: "HOTELBEDS_API_KEY plus HOTELBEDS_SECRET" },
    { supplier: "WebBeds", code: "WEBBEDS", configured: MSH_V2_BOOL(process.env.WEBBEDS_USERNAME || process.env.WEBBEDS_USER) && MSH_V2_BOOL(process.env.WEBBEDS_PASSWORD || process.env.WEBBEDS_PASS), requirement: "WEBBEDS_USERNAME plus WEBBEDS_PASSWORD" },
    { supplier: "RateHawk", code: "RATEHAWK", configured: MSH_V2_BOOL(process.env.RATEHAWK_KEY_ID || process.env.RATEHAWK_USERNAME || process.env.RATEHAWK_API_KEY) && MSH_V2_BOOL(process.env.RATEHAWK_API_KEY || process.env.RATEHAWK_PASSWORD), requirement: "RateHawk credentials plus destination/region mapping" }
  ];
}
function MSH_V2_QUERY(req) {
  const q = req.query || {};
  return {
    ...q,
    country: MSH_V2_TEXT(q.country || "United Kingdom"),
    city: MSH_V2_TEXT(q.city || "London"),
    currency: MSH_V2_TEXT(q.currency || "GBP").toUpperCase(),
    checkIn: MSH_V2_TEXT(q.checkIn || q.checkin || q.check_in),
    checkOut: MSH_V2_TEXT(q.checkOut || q.checkout || q.check_out),
    guests: MSH_V2_TEXT(q.guests || "2"),
    rooms: MSH_V2_TEXT(q.rooms || "1"),
    propertyType: "hotel",
    property_type: "hotel",
    accommodationMode: "hotel_only",
    supplierScope: "hyperguest_webbeds_ratehawk",
    limit: Math.max(1, Math.min(Number(q.limit || 97), 1000)),
    offset: Math.max(0, Number(q.offset || 0))
  };
}
app.get("/api/platform/v2/status", (req, res) => {
  const suppliers = MSH_V2_SUPPLIER_STATUS();
  res.json({
    ok: true,
    platform: "myspace-platform-v2",
    architecture: "production-safe-orchestrator",
    supplierScope: "HyperGuest, Hotelbeds, WebBeds, RateHawk",
    suppliers,
    configuredSuppliers: suppliers.filter((s) => s.configured).map((s) => s.code),
    note: "This endpoint does not create fake rates. If suppliers are not configured or do not return availability, customer search returns an honest no-availability response."
  });
});
app.get("/api/platform/v2/hotel-search", async (req, res) => {
  const started = Date.now();
  const query = MSH_V2_QUERY(req);
  const suppliers = MSH_V2_SUPPLIER_STATUS();
  try {
    const all = typeof MSH_ALLSUP_COLLECT === "function" ? await MSH_ALLSUP_COLLECT({ ...query, limit: Math.max(query.limit, 300) }) : [];
    const offset = query.offset;
    const hotels = Array.isArray(all) ? all.slice(offset, offset + query.limit) : [];
    const priced = hotels.filter((h) => (typeof MSH_ALLSUP_PRICE === "function" ? MSH_ALLSUP_PRICE(h) : Number(h.price || 0)) > 0).length;
    res.json({
      ok: true,
      success: true,
      source: "platform_v2_hotel_search",
      architecture: "search_orchestrator_supplier_normalizer_universal_hotel_model",
      supplierScope: "hyperguest_webbeds_ratehawk",
      query,
      count: hotels.length,
      totalAvailable: Array.isArray(all) ? all.length : 0,
      priced,
      hasMore: Array.isArray(all) && offset + hotels.length < all.length,
      hotels,
      suppliers,
      customerMessage: hotels.length
        ? "Hotels found from the current supplier architecture."
        : "No live hotel availability was returned for this destination/date by the configured suppliers. Try another city/date, or check supplier credentials and destination mappings.",
      ms: Date.now() - started
    });
  } catch (err) {
    res.json({
      ok: true,
      success: false,
      source: "platform_v2_hotel_search",
      count: 0,
      totalAvailable: 0,
      hasMore: false,
      hotels: [],
      suppliers,
      customerMessage: "Supplier search could not complete. Check backend logs for the supplier error.",
      error: err.message, stack: err.stack,
      ms: Date.now() - started
    });
  }
});
app.get("/api/platform/v2/selected-live-rate", async (req, res) => {
  req.url = req.url.replace("/api/platform/v2/selected-live-rate", "/api/supplier-union-selected-live-rate");
  return app._router.handle(req, res);
});
// MYSPACE PLATFORM V2 PRODUCTION ORCHESTRATOR END
// ============================================================
// MSH LIVE SUPPLIER ENRICHMENT - additive block, does not touch anything above
// ============================================================
(function mshLiveSupplierEnrichment() {
  if (typeof app === "undefined") return;

  function txt(v) { return String(v == null ? "" : v).trim(); }
  function nrm(v) { return txt(v).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim(); }
  function num(v) { const n = Number(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : 0; }

  function tomorrow(offset) {
    const d = new Date(Date.now() + (Number(offset) || 1) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function arrayFromPayload(p) {
    if (Array.isArray(p)) return p;
    if (!p || typeof p !== "object") return [];
    const keys = ["hotels", "data", "results", "items", "rows", "rates", "properties", "accommodations", "hotel_data"];
    for (const k of keys) {
      if (Array.isArray(p[k])) return p[k];
      if (p[k] && typeof p[k] === "object") {
        const inner = arrayFromPayload(p[k]);
        if (inner.length) return inner;
      }
    }
    return [];
  }

  function bestRoom(h) {
    const rooms = Array.isArray(h && h.rooms) ? h.rooms : [];
    const rates = Array.isArray(h && h.rates) ? h.rates : [];
    const list = [...rooms, ...rates];
    let best = null;
    for (const r of list) {
      const p = num(r && (r.price || r.amount || r.total || r.nightly_rate || r.net || r.sellingRate || r.convertedPrice || r.displayPrice));
      if (p > 0 && (!best || p < best.price)) best = { room: r, price: p };
    }
    return best;
  }

  function priceOf(h) {
    const direct = num(h && (h.price || h.convertedPrice || h.displayPrice || h.amount || h.total || h.nightly_rate || h.rate));
    if (direct > 0) return direct;
    const b = bestRoom(h);
    return b ? b.price : 0;
  }

  function currencyOf(h, fallback) {
    const r = Array.isArray(h && h.rooms) && h.rooms.length ? h.rooms[0] : {};
    return txt((h && (h.currency || h.displayCurrency)) || r.displayCurrency || r.currency || fallback || "GBP").toUpperCase();
  }

  function imageFromHotel(h, supplierCode) {
    const direct = [h && h.image, h && h.image_url, h && h.main_image, h && h.direct_image_url, h && h.photo, h && h.thumbnail];
    if (Array.isArray(h && h.images)) direct.push(...h.images);
    if (Array.isArray(h && h.photos)) direct.push(...h.photos);

    for (const item of direct) {
      if (!item) continue;
      const url = typeof item === "string" ? item : (item.url || item.image_url || item.path || "");
      const s = txt(url);
      if (!s) continue;
      if (/^https?:\/\//i.test(s)) return s;
      if (supplierCode === "HOTELBEDS") return `https://photos.hotelbeds.com/giata/original/${s.replace(/^\/+/, "")}`;
      if (supplierCode === "WEBBEDS") return `https://photos.webbeds.com/${s.replace(/^\/+/, "")}`;
    }
    return "";
  }

  function normalizeSupplierHotel(h, query, supplierCode, supplierLabel) {
    const r = Array.isArray(h && h.rooms) && h.rooms.length ? h.rooms[0] : (Array.isArray(h && h.rates) && h.rates.length ? h.rates[0] : {});
    const price = priceOf(h);
    const currency = currencyOf(h, query.currency);
    const name = txt(h && (h.name || h.hotel_name || h.hotelName || h.property_name || h.title || "Hotel"));
    const id = txt(h && (h.hotelId || h.hotel_id || h.id || h.code || h.hotel_code || h.supplier_hotel_id || h.supplierHotelId || `${name}-${query.city}`));
    const image = imageFromHotel(h, supplierCode);
    const rateId = txt(r.rate_source_id || r.rateKey || r.rate_key || h.rate_source_id || h.rateKey || h.rate_key || (price > 0 ? `MSH-${Date.now()}-${Math.random().toString(16).slice(2, 8)}` : ""));
    const ts = txt(r.rate_source_timestamp || h.rate_source_timestamp || h.updated_at || h.created_at || new Date().toISOString());

    return {
      ...h,
      id,
      hotelId: id,
      hotel_id: id,
      name,
      hotel_name: name,
      country: txt(h && (h.country || h.countryName || h.destinationCountry || (h.location && h.location.country)) || query.country),
      city: txt(h && (h.city || h.cityName || h.destination || (h.location && h.location.city)) || query.city),
      destination: txt(h && (h.city || h.destination) || query.city),
      image,
      image_url: image,
      images: image ? [image] : (Array.isArray(h && h.images) ? h.images : []),
      propertyType: "hotel",
      property_type: "hotel",
      accommodationMode: "hotel_only",
      supplier_code: supplierCode,
      supplier_name: supplierLabel,
      supplierLabel,
      source: (h && h.source) || `${supplierCode.toLowerCase()}_live`,
      price: price || null,
      convertedPrice: price || null,
      displayPrice: price || null,
      currency,
      displayCurrency: currency,
      availableToBook: price > 0,
      live_rate_ready: price > 0,
      rate_source_id: rateId,
      rate_source_timestamp: ts,
      source_health: price > 0 ? "verified" : "checking",
      rooms: [{
        roomCode: txt(r.roomCode || r.room_code || r.rate_id || r.rateKey || "STANDARD"),
        roomName: txt(r.roomName || r.room_name || r.rate_name || r.name || "Available room"),
        board: txt(r.board || r.boardName || r.board_name || "Room details before checkout"),
        cancellation: txt(r.cancellation || r.cancellationPolicy || "Cancellation information is shown before you complete your booking."),
        taxes: txt(r.taxes || "Applicable taxes and fees are shown before you complete your booking."),
        price: price || null,
        convertedPrice: price || null,
        displayCurrency: currency,
        currency,
        rate_source_id: rateId,
        rate_source_timestamp: ts,
        source_health: price > 0 ? "verified" : "checking"
      }]
    };
  }

  async function tryHotelbeds(query) {
    const label = "Hotelbeds";
    const code = "HOTELBEDS";
    const started = Date.now();
    try {
      if (typeof hotelbedsConfig !== "function" || typeof hotelbedsAvailabilitySearch !== "function") {
        console.log(`[MSH-LIVE] ${label} SKIP - connector not present in this build`);
        return { code, label, hotels: [], status: "connector_missing", ms: 0 };
      }
      const cfg = hotelbedsConfig();
      console.log(`[MSH-LIVE] ${label} ready=${cfg.ready} baseUrl=${cfg.baseUrl}`);
      if (!cfg.ready) {
        return { code, label, hotels: [], status: "not_configured", ms: Date.now() - started };
      }
      const r = await Promise.race([
        hotelbedsAvailabilitySearch(query),
        new Promise((resolve) => setTimeout(() => resolve({ hotels: [], __timeout: true }), 15000))
      ]);
      const rows = Array.isArray(r && r.hotels) ? r.hotels : [];
      console.log(`[MSH-LIVE] ${label} returned ${rows.length} hotels in ${Date.now() - started}ms`);
      const normalized = rows.map((h) => normalizeSupplierHotel(h, query, code, label));
      return { code, label, hotels: normalized, status: "ok", ms: Date.now() - started };
    } catch (e) {
      console.log(`[MSH-LIVE] ${label} FAILED: ${e.message}`);
      return { code, label, hotels: [], status: "error", error: e.message, ms: Date.now() - started };
    }
  }

  async function tryWebBeds(query) {
    const label = "WebBeds";
    const code = "WEBBEDS";
    const started = Date.now();
    try {
      if (typeof webbedsConfig !== "function" || typeof webbedsPostXml !== "function" || typeof buildWebbedsSearchXml !== "function" || typeof parseWebbedsHotels !== "function") {
        console.log(`[MSH-LIVE] ${label} SKIP - connector not present in this build`);
        return { code, label, hotels: [], status: "connector_missing", ms: 0 };
      }
      const cfg = webbedsConfig();
      console.log(`[MSH-LIVE] ${label} ready=${cfg.ready} baseUrl=${cfg.baseUrl}`);
      if (!cfg.ready) {
        return { code, label, hotels: [], status: "not_configured", ms: Date.now() - started };
      }

      const city = txt(query.city);
      const country = txt(query.country);
      const currency = txt(query.currency || "GBP").toUpperCase();

      const cityId =
        txt(query.cityId || query.city_id || query.destinationCode || "") ||
        (typeof findWebbedsCityCodeFromCache === "function" ? findWebbedsCityCodeFromCache(city, country) : "") ||
        (typeof webbedsCityIdFromName === "function" ? webbedsCityIdFromName(city) : "");

      if (!cityId) {
        console.log(`[MSH-LIVE] ${label} MISSING cityId for "${city}". Run /api/webbeds/build-city-map?command=getallcities once.`);
        return { code, label, hotels: [], status: "no_city_id", ms: Date.now() - started };
      }

      const built = buildWebbedsSearchXml({
        ...query,
        cityId,
        currencyId: typeof webbedsCurrencyIdFromCode === "function" ? webbedsCurrencyIdFromCode(currency) : currency,
        nationalityId: typeof webbedsCountryIdFromCode === "function" ? webbedsCountryIdFromCode(query.nationality || "GB") : "GB",
        residenceId: typeof webbedsCountryIdFromCode === "function" ? webbedsCountryIdFromCode(query.residence || "GB") : "GB"
      });

      if (!built || !built.ok) {
        console.log(`[MSH-LIVE] ${label} xml build failed: ${JSON.stringify(built)}`);
        return { code, label, hotels: [], status: "xml_build_failed", ms: Date.now() - started };
      }

      const r = await Promise.race([
        webbedsPostXml(built.xml).catch((e) => ({ text: "", status: 0, error: e.message })),
        new Promise((resolve) => setTimeout(() => resolve({ text: "", status: 0, error: "timeout" }), 15000))
      ]);

      console.log(`[MSH-LIVE] ${label} cityId=${cityId} HTTP status=${r.status} error=${r.error || "none"} preview=${(r.text || "").slice(0, 300)}`);

      if (r.text && r.text.includes("<error>")) {
        console.error(`[MSH-LIVE] WEBBEDS XML ERROR:`, r.text);
      }

      const parsed = parseWebbedsHotels(r.text || "", currency);
      console.log(`[MSH-LIVE] ${label} parsed ${parsed.length} hotels in ${Date.now() - started}ms`);

      const normalized = parsed.map((h) => normalizeSupplierHotel({ ...h, country: country || h.country, city: city || h.city }, query, code, label));
      return { code, label, hotels: normalized, status: "ok", ms: Date.now() - started };
    } catch (e) {
      console.log(`[MSH-LIVE] ${label} FAILED: ${e.message}`);
      return { code, label, hotels: [], status: "error", error: e.message, ms: Date.now() - started };
    }
  }

  function mshRatehawkPriceFromRate(rate) {
    if (!rate) return 0;
    const direct = num(rate.price || rate.amount || rate.total || rate.nightly_rate || rate.net || rate.sellingRate);
    if (direct > 0) return direct;
    const opts = Array.isArray(rate.payment_options && rate.payment_options.payment_types) ? rate.payment_options.payment_types : [];
    for (const p of opts) {
      const v = num(p.amount || p.show_amount || p.total);
      if (v > 0) return v;
    }
    return 0;
  }

  async function tryRateHawk(query) {
    const label = "RateHawk";
    const code = "RATEHAWK";
    const started = Date.now();
    try {
      if (typeof ratehawkConfig !== "function" || typeof ratehawkPost !== "function") {
        console.log(`[MSH-LIVE] ${label} SKIP - connector not present in this build`);
        return { code, label, hotels: [], status: "connector_missing", ms: 0 };
      }
      const cfg = ratehawkConfig();
      console.log(`[MSH-LIVE] ${label} ready=${cfg.ready} baseUrl=${cfg.baseUrl}`);
      if (!cfg.ready) {
        return { code, label, hotels: [], status: "not_configured", ms: Date.now() - started };
      }

      let regionId = 0;
      try {
        if (typeof mshRatehawkResolveRegionId === "function") {
          regionId = await mshRatehawkResolveRegionId(query);
        }
      } catch (e) {
        console.log(`[MSH-LIVE] ${label} region resolver failed: ${e.message}`);
      }

      if (!regionId) {
        regionId = Number(
          query.ratehawkRegionId ||
          query.region_id ||
          query.regionId ||
          process.env.RATEHAWK_DEFAULT_REGION_ID ||
          0
        );
      }

      if (!regionId) {
        console.log(`[MSH-LIVE] ${label} MISSING region_id for "${query.city}". Set RATEHAWK_DEFAULT_REGION_ID or RATEHAWK_REGION_MAP.`);
        return { code, label, hotels: [], status: "no_region_id", ms: Date.now() - started };
      }

      const checkIn = txt(query.checkIn || query.checkin || query.check_in || tomorrow(14));
      const checkOut = txt(query.checkOut || query.checkout || query.check_out || tomorrow(15));
      const guests = Math.max(1, Number(query.guests || 2));

      const payload = {
        checkin: checkIn,
        checkout: checkOut,
        residency: txt(query.residency || "gb").toLowerCase(),
        language: txt(query.language || "en"),
        guests: [{ adults: guests, children: [] }],
        region_id: regionId,
        currency: txt(query.currency || "GBP").toUpperCase()
      };

      const r = await Promise.race([
        ratehawkPost("/api/b2b/v3/search/serp/region/", payload).catch((e) => ({ ok: false, status: 0, data: {}, error: e.message })),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, status: 0, data: {}, error: "timeout" }), 15000))
      ]);

      console.log(`[MSH-LIVE] ${label} region=${regionId} HTTP status=${r.status} error=${r.error || "none"}`);

      const rows = arrayFromPayload(r && r.data);
      console.log(`[MSH-LIVE] ${label} parsed ${rows.length} hotels in ${Date.now() - started}ms`);

      const normalized = rows.map((h) => {
        const rates = Array.isArray(h.rates) ? h.rates : (Array.isArray(h.rooms) ? h.rooms : []);
        const flatRates = rates.map((rate) => ({
          ...rate,
          price: mshRatehawkPriceFromRate(rate),
          currency: rate.currency || (rate.payment_options && rate.payment_options.payment_types && rate.payment_options.payment_types[0] && rate.payment_options.payment_types[0].currency_code) || query.currency,
          rate_source_id: rate.rate_key || rate.rateKey || rate.book_hash || rate.rate_source_id,
          room_name: rate.room_name || rate.roomName || rate.name
        })).filter((rate) => Number(rate.price || 0) > 0);

        return normalizeSupplierHotel(
          { ...h, rates: flatRates, rooms: flatRates, country: query.country, city: query.city },
          query, code, label
        );
      });

      return { code, label, hotels: normalized, status: "ok", ms: Date.now() - started };
    } catch (e) {
      console.log(`[MSH-LIVE] ${label} FAILED: ${e.message}`);
      return { code, label, hotels: [], status: "error", error: e.message, ms: Date.now() - started };
    }
  }

  async function tryHyperGuest(query) {
    const label = "HyperGuest";
    const code = "HYPERGUEST";
    const started = Date.now();
    try {
      const url = txt(process.env.HYPERGUEST_SEARCH_URL || process.env.HYPERGUEST_AVAILABILITY_URL || "");
      const token = txt(process.env.HYPERGUEST_API_KEY || process.env.HYPERGUEST_TOKEN || "");

      console.log(`[MSH-LIVE] ${label} url=${url ? "set" : "MISSING"} token=${token ? "set" : "MISSING"}`);

      if (!url || !token) {
        return { code, label, hotels: [], status: "not_configured", ms: Date.now() - started };
      }

      const params = new URLSearchParams({
        country: query.country || "",
        city: query.city || "",
        checkIn: query.checkIn || query.checkin || "",
        checkOut: query.checkOut || query.checkout || "",
        guests: String(query.guests || 2),
        rooms: String(query.rooms || 1),
        currency: query.currency || "GBP",
        propertyType: "hotel"
      });

      const fetchUrl = `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;

      const r = await Promise.race([
        fetch(fetchUrl, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
          .then((x) => x.json())
          .catch((e) => ({ __error: e.message })),
        new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), 15000))
      ]);

      if (r.__error || r.__timeout) {
        console.log(`[MSH-LIVE] ${label} fetch failed: ${r.__error || "timeout"}`);
        return { code, label, hotels: [], status: "error", error: r.__error || "timeout", ms: Date.now() - started };
      }

      const rows = arrayFromPayload(r);
      console.log(`[MSH-LIVE] ${label} parsed ${rows.length} hotels in ${Date.now() - started}ms`);

      const normalized = rows.map((h) => normalizeSupplierHotel({ ...h, country: query.country, city: query.city }, query, code, label));
      return { code, label, hotels: normalized, status: "ok", ms: Date.now() - started };
    } catch (e) {
      console.log(`[MSH-LIVE] ${label} FAILED: ${e.message}`);
      return { code, label, hotels: [], status: "error", error: e.message, ms: Date.now() - started };
    }
  }

  function tryCatalogue(query) {
    const label = "Catalogue";
    const code = "MYSPACE";
    const started = Date.now();
    try {
      if (typeof readHotels !== "function") return { code, label, hotels: [], status: "no_reader", ms: 0 };

      const all = readHotels();
      const matched = all
        .filter((h) => h && h.name)
        .filter((h) => typeof isBlockedCountry === "function" ? !isBlockedCountry(h.country) : true)
        .filter((h) => !query.country || (typeof mshSameCountryForCustomer === "function" ? mshSameCountryForCustomer(h.country, query.country) : true))
        .filter((h) => !query.city || (typeof mshSameCityForCustomer === "function" ? mshSameCityForCustomer(h.city, query.city, query.country) : true))
        .filter((h) => typeof isStrictHotelOnly === "function" ? isStrictHotelOnly(h) : true);

      const normalized = matched.map((h) => normalizeSupplierHotel(h, query, code, label));
      console.log(`[MSH-LIVE] ${label} returned ${normalized.length} hotels in ${Date.now() - started}ms`);
      return { code, label, hotels: normalized, status: "ok", ms: Date.now() - started };
    } catch (e) {
      console.log(`[MSH-LIVE] ${label} FAILED: ${e.message}`);
      return { code, label, hotels: [], status: "error", error: e.message, ms: Date.now() - started };
    }
  }

  function dedupe(hotels) {
    const seen = new Set();
    const out = [];
    for (const h of hotels) {
      if (!h || !h.name) continue;
      const key = nrm(`${h.supplier_code}|${h.hotelId}|${h.name}|${h.city}|${h.country}`);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(h);
    }
    return out;
  }

  app.get("/api/msh-live-suppliers", async (req, res) => {
    const started = Date.now();

    const query = {
      country: txt(req.query.country || "United Kingdom"),
      city: txt(req.query.city || "London"),
      currency: txt(req.query.currency || "GBP").toUpperCase(),
      checkIn: txt(req.query.checkIn || req.query.checkin || req.query.check_in || tomorrow(14)),
      checkOut: txt(req.query.checkOut || req.query.checkout || req.query.check_out || tomorrow(15)),
      guests: txt(req.query.guests || "2"),
      rooms: txt(req.query.rooms || "1"),
      nationality: txt(req.query.nationality || "GB"),
      residence: txt(req.query.residence || "GB"),
      limit: Math.max(1, Math.min(Number(req.query.limit || 300), 1000)),
      offset: Math.max(0, Number(req.query.offset || 0)),
      ratehawkRegionId: req.query.ratehawkRegionId || req.query.region_id || req.query.regionId,
      cityId: req.query.cityId || req.query.city_id
    };

    console.log(`[MSH-LIVE] search ${query.city}, ${query.country} currency=${query.currency} checkIn=${query.checkIn} checkOut=${query.checkOut}`);

    const results = await Promise.allSettled([
      tryHotelbeds(query),
      tryWebBeds(query),
      tryRateHawk(query),
      tryHyperGuest(query),
      Promise.resolve(tryCatalogue(query))
    ]);

    const fulfilled = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => r.value);

    const allHotels = dedupe(fulfilled.flatMap((r) => r.hotels));

    allHotels.sort((a, b) => {
      const ap = Number(a.price || 0);
      const bp = Number(b.price || 0);
      if (ap > 0 && bp <= 0) return -1;
      if (bp > 0 && ap <= 0) return 1;
      if (ap > 0 && bp > 0) return ap - bp;
      return String(a.name).localeCompare(String(b.name));
    });

    const page = allHotels.slice(query.offset, query.offset + query.limit);

    const supplierSummary = fulfilled.map((r) => ({
      supplier: r.code,
      label: r.label,
      status: r.status,
      count: r.hotels.length,
      ms: r.ms,
      error: r.error || ""
    }));

    console.log(`[MSH-LIVE] FINAL total=${allHotels.length} returned=${page.length} in ${Date.now() - started}ms`);
    supplierSummary.forEach((s) => console.log(`[MSH-LIVE] ${s.label}: status=${s.status} count=${s.count} ms=${s.ms}${s.error ? " error=" + s.error : ""}`));

    res.json({
      ok: true,
      success: true,
      source: "msh_live_supplier_enrichment",
      query,
      count: page.length,
      totalAvailable: allHotels.length,
      hasMore: query.offset + page.length < allHotels.length,
      suppliers: supplierSummary,
      hotels: page,
      customerMessage: page.length
        ? "Hotels found for your search."
        : "We could not find available hotels for this destination right now. Please try another city or date."
    });
  });

  app.get("/api/msh-live-selected-rate", async (req, res) => {
    const query = {
      country: txt(req.query.country || ""),
      city: txt(req.query.city || ""),
      currency: txt(req.query.currency || "GBP").toUpperCase(),
      checkIn: txt(req.query.checkIn || req.query.checkin || tomorrow(14)),
      checkOut: txt(req.query.checkOut || req.query.checkout || tomorrow(15)),
      guests: txt(req.query.guests || "2"),
      rooms: txt(req.query.rooms || "1"),
      nationality: txt(req.query.nationality || "GB"),
      residence: txt(req.query.residence || "GB"),
      cityId: req.query.cityId || req.query.city_id,
      ratehawkRegionId: req.query.ratehawkRegionId || req.query.region_id
    };

    const wantedId = nrm(req.query.hotelId || req.query.hotel_id || "");
    const wantedName = nrm(req.query.hotelName || req.query.hotel_name || "");

    const results = await Promise.allSettled([
      tryHotelbeds(query),
      tryWebBeds(query),
      tryRateHawk(query),
      tryHyperGuest(query),
      Promise.resolve(tryCatalogue(query))
    ]);

    const all = dedupe(results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value.hotels));

    function score(h) {
      const id = nrm([h.hotelId, h.hotel_id, h.id, h.code].filter(Boolean).join(" "));
      const name = nrm(h.name || h.hotel_name);
      let s = 0;
      if (wantedId && id && (id === wantedId || id.includes(wantedId) || wantedId.includes(id))) s += 1000;
      if (wantedName && name && (name === wantedName || name.includes(wantedName) || wantedName.includes(name))) s += 900;
      if (Number(h.price || 0) > 0) s += 500;
      return s;
    }

    const ranked = all.map((h) => ({ h, s: score(h) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const picked = ranked[0] ? ranked[0].h : all.find((h) => Number(h.price || 0) > 0) || null;

    if (!picked || Number(picked.price || 0) <= 0) {
      return res.json({
        ok: true,
        found: false,
        customer_offer: null,
        hotels_compared: all.length,
        message: "Today's price is still being checked. Please choose another hotel or try again shortly."
      });
    }

    const room = Array.isArray(picked.rooms) && picked.rooms.length ? picked.rooms[0] : {};

    const offer = {
      hotelId: picked.hotelId,
      hotelName: picked.name,
      country: picked.country,
      city: picked.city,
      roomCode: room.roomCode || "STANDARD",
      roomName: room.roomName || "Available room",
      board: room.board || "Room details before checkout",
      amount: Number(picked.price),
      price: Number(picked.price),
      currency: picked.currency,
      supplier_code: picked.supplier_code,
      supplier_name: picked.supplier_name,
      rate_source_id: room.rate_source_id || picked.rate_source_id,
      rate_source_timestamp: room.rate_source_timestamp || picked.rate_source_timestamp,
      source_health: "verified"
    };

    res.json({
      ok: true,
      found: true,
      source: "msh_live_supplier_enrichment",
      selected_hotel: picked,
      customer_offer: offer,
      best_offer: offer,
      offer,
      hotels_compared: all.length,
      message: "Current price found."
    });
  });

  console.log("[MSH-LIVE] Live supplier enrichment endpoints registered: /api/msh-live-suppliers and /api/msh-live-selected-rate");
})();
// ============================================================
// MSH LIVE SUPPLIER ENRICHMENT END
// Export legacy Express app for the modular v2 bootstrap.
module.exports = { app };

// ============================================================
// STARTUP ï¿½ runs only when this file is the entry point
// ============================================================

if (require.main === module) {
  const server = app.listen(PORT, "0.0.0.0", () => {
    const hb = typeof hotelbedsConfig === "function" ? hotelbedsConfig() : { ready: false };
    const wb = typeof webbedsConfig === "function" ? webbedsConfig() : { ready: false };
    console.log("====================================");
    console.log("MYSPACE HOTEL BACKEND STARTED");
    console.log("Time:", new Date().toISOString());
    console.log("PORT:", PORT);
    console.log("HOTELBEDS:", hb.ready ? "READY" : "NOT CONFIGURED");
    console.log("WEBBEDS:", wb.ready ? "READY" : "NOT CONFIGURED");
    console.log("STRIPE:", process.env.STRIPE_SECRET_KEY ? "READY" : "NOT CONFIGURED");
    console.log("MAIL:", process.env.RESEND_API_KEY || process.env.SMTP_HOST ? "READY" : "NOT CONFIGURED");
    console.log("====================================");

    // Cache warmer removed: chunks are already loaded into global.mshChunkCache
    // at startup by the loadChunks() IIFE above. No live supplier calls on boot.
    // First search is served instantly from RAM via /api/multi-supplier-hotels.
    console.log("[CACHE] Serving from RAM chunk cache. No live supplier calls on boot.");
  });

  server.on("error", (err) => {
    console.error("[FATAL] Server error:", err && err.stack || err);
    process.exit(1);
  });
  setTimeout(() => {
    if (!server.listening) {
      console.error("[FATAL] Server did not start listening within 10 seconds.");
      process.exit(1);
    }
  }, 10000);
}



