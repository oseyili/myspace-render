const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA = path.join(__dirname, "data");

const CACHE_CANDIDATES = [
  path.join(DATA, "REAL_ONLY_live_rates.json.gz"),
  path.join(DATA, "REAL_ONLY_live_rates_with_geo_images.json.gz"),
  path.join(DATA, "live_rate_cache_joined_geo_images_DEST_FIXED.json.gz"),
  path.join(DATA, "live_rate_cache_joined_geo_images_SMART.json.gz"),
  path.join(DATA, "live_rate_cache_joined_geo_images.json.gz")
];

let CACHE = null;

function safe(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function goodImage(v) {
  const x = safe(v);
  return /^https?:\/\//i.test(x) && !/placeholder|fake|dummy|sample|example/i.test(x);
}

function validGeo(country, city) {
  const c = safe(country).toLowerCase();
  const y = safe(city).toLowerCase();
  return c && y && c !== "unknown" && y !== "unknown" && c !== "null" && y !== "null";
}

function readAnyJson(file) {
  const raw = fs.readFileSync(file);
  const text = file.toLowerCase().endsWith(".gz")
    ? zlib.gunzipSync(raw).toString("utf8")
    : raw.toString("utf8");
  return JSON.parse(text);
}

function flatten(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    if (Array.isArray(value[4])) return value[4];
    return value.flatMap((x) => Array.isArray(x) ? x : [x]);
  }
  if (Array.isArray(value.rows)) return value.rows;
  if (Array.isArray(value.hotels)) return value.hotels;
  if (Array.isArray(value.rates)) return value.rates;
  if (Array.isArray(value.data)) return value.data;
  if (typeof value === "object") return Object.values(value).flatMap(flatten);
  return [];
}

function normalizeRow(r) {
  const rate = r.first_rate || r.rate || r;

  const country = safe(r.country || r.destination_country || r.countryName);
  const city = safe(r.city || r.destination_city || r.cityName);
  const hotelName = safe(r.hotel_name || r.name || r.hotelName);
  const image = safe(r.direct_image_url || r.image_url || r.image || r.hotel_image);

  const customerTotal = money(
    rate.customer_total ||
    rate.selling_rate ||
    rate.amount ||
    r.customer_total ||
    r.selling_rate ||
    r.amount ||
    rate.net ||
    r.net
  );

  const supplierTotal = money(
    rate.supplier_total ||
    rate.supplier_amount ||
    r.supplier_total ||
    r.supplier_amount ||
    rate.net ||
    r.net ||
    customerTotal
  );

  const rateKey = safe(rate.rate_key || r.rate_key);

  if (!validGeo(country, city)) return null;
  if (!hotelName) return null;
  if (!goodImage(image)) return null;
  if (!rateKey) return null;
  if (customerTotal <= 0) return null;

  return {
    hotel_id: safe(r.canonical_hotel_id || r.hotel_id || r.hotel_code || r.supplier_hotel_id || hotelName),
    hotel_name: hotelName,
    country,
    city,
    area: safe(r.area || r.address),
    address: safe(r.address || r.area),
    latitude: r.latitude || null,
    longitude: r.longitude || null,
    image_url: image,
    direct_image_url: image,
    live_rate_ready: true,
    real_image_verified: true,
    first_rate: {
      rate_key: rateKey,
      room_name: safe(rate.room_name || r.room_name || "Selected room"),
      board_name: safe(rate.board_name || r.board_name || "Room only"),
      currency: safe(rate.currency || r.currency || "EUR"),
      customer_total: customerTotal,
      amount: customerTotal,
      selling_rate: customerTotal,
      supplier_total: supplierTotal,
      supplier_amount: supplierTotal,
      cancellation_policies: rate.cancellation_policies || r.cancellation_policies || []
    }
  };
}

function loadRealOnly() {
  if (CACHE) return CACHE;

  let source = "";
  let rawRows = [];

  for (const file of CACHE_CANDIDATES) {
    if (!fs.existsSync(file)) continue;

    try {
      const parsed = readAnyJson(file);
      const rows = flatten(parsed);
      const clean = rows.map(normalizeRow).filter(Boolean);

      if (clean.length > rawRows.length) {
        source = file;
        rawRows = clean;
      }
    } catch (err) {
      console.log("Skipped cache candidate:", file, err.message);
    }
  }

  const seenHotelCity = new Set();
  const rows = [];

  for (const h of rawRows) {
    const key = [
      h.country.toLowerCase(),
      h.city.toLowerCase(),
      h.hotel_id,
      h.first_rate.rate_key
    ].join("|");

    if (seenHotelCity.has(key)) continue;
    seenHotelCity.add(key);
    rows.push(h);
  }

  const countryMap = new Map();

  for (const h of rows) {
    if (!countryMap.has(h.country)) countryMap.set(h.country, new Map());
    const cityMap = countryMap.get(h.country);

    if (!cityMap.has(h.city)) {
      cityMap.set(h.city, {
        city: h.city,
        destination_code: "",
        live_hotels: 0
      });
    }

    cityMap.get(h.city).live_hotels += 1;
  }

  const countries = Array.from(countryMap.entries())
    .map(([country, cityMap]) => ({
      country,
      cities: Array.from(cityMap.values())
        .filter((c) => c.live_hotels > 0)
        .sort((a, b) => b.live_hotels - a.live_hotels || a.city.localeCompare(b.city))
    }))
    .filter((c) => c.cities.length > 0)
    .sort((a, b) => a.country.localeCompare(b.country));

  CACHE = {
    source,
    rows,
    countries,
    country_count: countries.length,
    city_count: countries.reduce((a, c) => a + c.cities.length, 0),
    live_rate_rows: rows.length
  };

  console.log("");
  console.log("REAL-ONLY LIVE INDEX LOADED");
  console.log("===========================");
  console.log("Source:", source || "NONE");
  console.log("Countries:", CACHE.country_count);
  console.log("Cities:", CACHE.city_count);
  console.log("Live rate rows:", CACHE.live_rate_rows);
  console.log("");

  return CACHE;
}

function makeHotel(row) {
  return row;
}

function attachRealOnlyRoutes(app) {
  app.get("/api/bootstrap", (req, res) => {
    const live = loadRealOnly();
    res.json({
      ok: true,
      source: "real_only_live_rates",
      cache_source: live.source,
      countries: live.countries,
      total_countries: live.country_count,
      total_cities: live.city_count,
      total_live_rate_rows: live.live_rate_rows
    });
  });

  app.get("/api/hotels/search", (req, res) => {
    const live = loadRealOnly();

    const country = safe(req.query.country).toLowerCase();
    const city = safe(req.query.city).toLowerCase();
    const keyword = safe(req.query.keyword).toLowerCase();
    const area = safe(req.query.area).toLowerCase();

    let rows = live.rows.filter((h) =>
      safe(h.country).toLowerCase() === country &&
      safe(h.city).toLowerCase() === city
    );

    if (keyword) {
      rows = rows.filter((h) =>
        safe(h.hotel_name).toLowerCase().includes(keyword) ||
        safe(h.address).toLowerCase().includes(keyword)
      );
    }

    if (area) {
      rows = rows.filter((h) =>
        safe(h.address).toLowerCase().includes(area) ||
        safe(h.hotel_name).toLowerCase().includes(area)
      );
    }

    const seen = new Set();
    const hotels = [];

    for (const row of rows) {
      const id = safe(row.hotel_id || row.hotel_name);
      if (seen.has(id)) continue;
      seen.add(id);
      hotels.push(makeHotel(row));
      if (hotels.length >= 80) break;
    }

    res.json({
      ok: true,
      source: "real_only_live_rates",
      cache_source: live.source,
      hotels,
      count: hotels.length,
      message: hotels.length
        ? "Real live-rate stays found."
        : "No real live-rate stays are currently available for this destination."
    });
  });
}

module.exports = { attachRealOnlyRoutes, loadRealOnly };
