
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA = path.join(__dirname, "data");
const REAL_GZ = path.join(DATA, "REAL_ONLY_live_rates.json.gz");

let CACHE = null;

function readGzJson(file) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}

function safe(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function loadRealOnly() {
  if (CACHE) return CACHE;

  const rows = fs.existsSync(REAL_GZ) ? readGzJson(REAL_GZ) : [];

  const clean = rows.filter((r) =>
    safe(r.country) &&
    safe(r.city) &&
    safe(r.hotel_name) &&
    safe(r.rate_key) &&
    safe(r.image_url || r.direct_image_url) &&
    money(r.customer_total || r.selling_rate || r.amount) > 0 &&
    r.live_rate_ready === true &&
    r.real_image_verified === true
  );

  const countryMap = new Map();

  for (const r of clean) {
    const country = safe(r.country);
    const city = safe(r.city);

    if (!countryMap.has(country)) countryMap.set(country, new Map());
    const cityMap = countryMap.get(country);

    if (!cityMap.has(city)) {
      cityMap.set(city, {
        city,
        destination_code: safe(r.destination_code),
        live_hotels: 0
      });
    }

    cityMap.get(city).live_hotels += 1;
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
    generated_at: new Date().toISOString(),
    rows: clean,
    countries,
    country_count: countries.length,
    city_count: countries.reduce((a, c) => a + c.cities.length, 0),
    live_rate_rows: clean.length
  };

  return CACHE;
}

function makeHotel(row) {
  const total = money(row.customer_total || row.selling_rate || row.amount);
  const supplierTotal = money(row.supplier_total || row.net || total);

  return {
    hotel_id: safe(row.canonical_hotel_id || row.supplier_hotel_id || row.hotel_id || row.hotel_code),
    hotel_name: safe(row.hotel_name),
    country: safe(row.country),
    city: safe(row.city),
    area: safe(row.address),
    address: safe(row.address),
    latitude: row.latitude || null,
    longitude: row.longitude || null,
    image_url: safe(row.image_url),
    direct_image_url: safe(row.direct_image_url || row.image_url),
    live_rate_ready: true,
    real_image_verified: true,
    first_rate: {
      rate_key: safe(row.rate_key),
      room_name: safe(row.room_name || "Selected room"),
      board_name: safe(row.board_name || "Room only"),
      currency: safe(row.currency || "EUR"),
      customer_total: total,
      amount: total,
      selling_rate: total,
      supplier_total: supplierTotal,
      supplier_amount: supplierTotal,
      cancellation_policies: row.cancellation_policies || []
    }
  };
}

function attachRealOnlyRoutes(app) {
  app.get("/api/bootstrap", (req, res) => {
    const live = loadRealOnly();

    res.json({
      ok: true,
      source: "real_only_live_rates",
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

    let rows = live.rows.filter((r) =>
      safe(r.country).toLowerCase() === country &&
      safe(r.city).toLowerCase() === city
    );

    if (keyword) {
      rows = rows.filter((r) =>
        safe(r.hotel_name).toLowerCase().includes(keyword) ||
        safe(r.address).toLowerCase().includes(keyword)
      );
    }

    if (area) {
      rows = rows.filter((r) =>
        safe(r.address).toLowerCase().includes(area) ||
        safe(r.hotel_name).toLowerCase().includes(area)
      );
    }

    const seen = new Set();
    const hotels = [];

    for (const row of rows) {
      const id = safe(row.canonical_hotel_id || row.supplier_hotel_id || row.hotel_name);
      if (seen.has(id)) continue;
      seen.add(id);
      hotels.push(makeHotel(row));
      if (hotels.length >= 80) break;
    }

    res.json({
      ok: true,
      source: "real_only_live_rates",
      hotels,
      count: hotels.length,
      message: hotels.length
        ? "Real live-rate stays found."
        : "No real live-rate stays are currently available for this destination."
    });
  });
}

module.exports = { attachRealOnlyRoutes, loadRealOnly };
