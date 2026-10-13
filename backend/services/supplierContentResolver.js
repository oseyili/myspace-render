const fs = require("fs");
const path = require("path");

const CONTENT_TIMEOUT_MS = Number(process.env.SUPPLIER_CONTENT_TIMEOUT_MS || 5000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const LOCAL_CONTENT_FILE = process.env.HOTEL_CONTENT_FILE || path.join(DATA_DIR, "hotel-content.json");
let localCache = null;

function clean(v) { return String(v ?? "").trim(); }
function first(...values) { return values.find((v) => v !== undefined && v !== null && clean(v) !== ""); }

function supplierCode(h) {
  const raw = [h?.supplier_code, h?.supplier, h?.supplier_name, h?.source, h?.supplierLabel]
    .map(clean)
    .join(" ")
    .toLowerCase();
  if (raw.includes("webbeds") || raw.includes("dotw")) return "WEBBEDS";
  if (raw.includes("ratehawk") || raw.includes("worldota")) return "RATEHAWK";
  if (raw.includes("hyperguest")) return "HYPERGUEST";
  return "";
}

function getHotelId(h) {
  return clean(h?.supplier_hotel_id || h?.supplierHotelId || h?.webbedsHotelId || h?.hotelId || h?.hotel_id || h?.id)
    .replace(/^(WEBBEDS|RATEHAWK|HYPERGUEST)-/i, "");
}

function imageUrl(img) {
  if (!img) return "";
  const value = typeof img === "string"
    ? img
    : first(img.url, img.href, img.link, img.imageUrl, img.fullUrl, img.original, img.large, img.thumbnail, "");
  const out = clean(value);
  if (/^https?:\/\//i.test(out)) return out.replace(/^http:\/\//i, "https://");
  if (out.startsWith("//")) return `https:${out}`;
  return "";
}

function usableName(v) {
  const n = clean(v);
  if (!n) return false;
  if (/^(hotel|property|verified\s+webbeds\s+hotel|webbeds\s+hotel\s+id|live\s+hotel\s+option|hotel\s+name\s+unavailable|available\s+room|taxes?\s+and\s+fees?|fees?|room\s+only)\s*\d*$/i.test(n)) return false;
  if (/(test|demo|placeholder|sample|fake|dummy|example)/i.test(n)) return false;
  if (/^(standard|double|single|twin|queen|king|family|private|shared|quad|triple)\b/i.test(n)) return false;
  return true;
}

function normalizeContent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const src = raw.hotel || raw.property || raw.data?.hotel || raw.data?.property || raw.data || raw;
  const images = [
    ...(Array.isArray(src.images) ? src.images : []),
    ...(Array.isArray(src.photos) ? src.photos : []),
    ...(Array.isArray(src.gallery) ? src.gallery : []),
    src.image,
    src.mainImage,
    src.thumbnail
  ].map(imageUrl).filter(Boolean);

  const name = first(src.name, src.hotelName, src.hotel_name, src.propertyName, src.title);
  const facilities = Array.isArray(src.facilities) ? src.facilities : Array.isArray(src.amenities) ? src.amenities : [];
  if (!usableName(name) && !images.length && !clean(src.address) && !facilities.length) return null;

  const out = {
    address: clean(first(src.address, src.addressLine, src.location?.address, "")),
    city: clean(first(src.city, src.cityName, src.location?.city, "")),
    country: clean(first(src.country, src.countryName, src.location?.country, "")),
    stars: clean(first(src.stars, src.starRating, src.rating, src.category, "")),
    latitude: first(src.latitude, src.lat, src.location?.lat, ""),
    longitude: first(src.longitude, src.lng, src.location?.lng, ""),
    image: images[0] || "",
    images: [...new Set(images)].slice(0, 30),
    facilities: facilities.slice(0, 30)
  };

  if (usableName(name)) {
    out.name = clean(name);
    out.hotel_name = clean(name);
  }

  return out;
}

function loadLocalContent() {
  if (localCache) return localCache;
  localCache = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(LOCAL_CONTENT_FILE, "utf8").replace(/^\uFEFF/, ""));
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw.hotels) ? raw.hotels : Object.values(raw);
    for (const row of rows) {
      const code = clean(row.supplier_code || row.supplier).toUpperCase();
      const id = clean(row.supplier_hotel_id || row.hotelId || row.hotel_id || row.id)
        .replace(/^(WEBBEDS|RATEHAWK|HYPERGUEST)-/i, "");
      const content = normalizeContent(row);
      if (code && id && content) localCache.set(`${code}:${id}`, content);
    }
  } catch {}
  return localCache;
}

async function fetchJsonWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONTENT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveRemoteContent(code, hotelId) {
  const configs = {
    WEBBEDS: [process.env.WEBBEDS_CONTENT_API_URL || process.env.WEBBEDS_HOTEL_CONTENT_URL, process.env.WEBBEDS_CONTENT_API_KEY || process.env.WEBBEDS_API_KEY || process.env.WEBBEDS_TOKEN],
    RATEHAWK: [process.env.RATEHAWK_CONTENT_API_URL, process.env.RATEHAWK_KEY_TOKEN || process.env.RATEHAWK_API_KEY],
    HYPERGUEST: [process.env.HYPERGUEST_STATIC_URL || process.env.HYPERGUEST_CONTENT_API_URL, process.env.HYPERGUEST_AUTH_TOKEN || process.env.HYPERGUEST_API_KEY || process.env.HYPERGUEST_TOKEN]
  };
  const [base, key] = configs[code] || [];
  if (!clean(base) || !clean(key)) return null;
  const url = base.includes("{hotelId}")
    ? base.replace("{hotelId}", encodeURIComponent(hotelId))
    : `${base.replace(/\/$/, "")}/${encodeURIComponent(hotelId)}`;
  const raw = await fetchJsonWithTimeout(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${key}`, "x-api-key": key }
  });
  return normalizeContent(raw);
}

async function enrichHotel(h) {
  if (!h || typeof h !== "object") return h;
  const code = supplierCode(h);
  const hotelId = getHotelId(h);
  if (!code || !hotelId) return h;

  const currentName = clean(h.name || h.hotel_name || h.hotelName || h.property_name);
  const local = loadLocalContent().get(`${code}:${hotelId}`) || null;
  const content = local || await resolveRemoteContent(code, hotelId);

  if (!content) {
    return {
      ...h,
      contentStatus: "supplier_content_unavailable",
      bookableLiveRate: Number(h.price || 0) > 0
    };
  }

  const safeContent = { ...content };
  if (!usableName(safeContent.name) || usableName(currentName)) {
    delete safeContent.name;
    delete safeContent.hotel_name;
  }

  return {
    ...h,
    ...safeContent,
    name: usableName(currentName) ? currentName : (usableName(content.name) ? content.name : currentName),
    hotel_name: usableName(currentName) ? currentName : (usableName(content.hotel_name || content.name) ? (content.hotel_name || content.name) : currentName),
    contentStatus: local ? "local_supplier_content" : "supplier_content_verified",
    bookableLiveRate: Number(h.price || 0) > 0
  };
}

async function enrichList(rows, concurrency = 8) {
  const input = Array.isArray(rows) ? rows : [];
  const output = new Array(input.length);
  let cursor = 0;
  async function worker() {
    while (cursor < input.length) {
      const i = cursor++;
      output[i] = await enrichHotel(input[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, input.length || 1) }, worker));
  return output.filter((h) => h && usableName(h.name || h.hotel_name));
}

async function enrichPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  if (Array.isArray(payload)) return enrichList(payload);
  const clone = { ...payload };
  for (const key of ["hotels", "allHotels", "results", "items", "properties"]) {
    if (Array.isArray(clone[key])) clone[key] = await enrichList(clone[key]);
  }
  if (Array.isArray(clone.hotels)) clone.count = clone.hotels.length;
  if (Array.isArray(clone.allHotels)) clone.totalAvailable = clone.allHotels.length;
  clone.contentLayer = "contracted_suppliers_only";
  clone.activeSuppliers = ["WEBBEDS", "RATEHAWK", "HYPERGUEST"];
  return clone;
}

module.exports = { enrichPayload, enrichHotel };
