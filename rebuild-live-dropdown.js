const fs = require("fs");
const zlib = require("zlib");

const source = "./backend/data/REAL_ONLY_live_rates.json.gz";
const outDest = "./frontend/public/live-destinations.json";
const outHotels = "./frontend/public/live-hotels.json";

fs.mkdirSync("./frontend/public", { recursive: true });

if (!fs.existsSync(source)) {
  throw new Error("Missing backend/data/REAL_ONLY_live_rates.json.gz");
}

const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(source)).toString("utf8"));

function safe(v) {
  return String(v || "").trim();
}

function price(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function valid(row) {
  return (
    safe(row.country) &&
    safe(row.city) &&
    safe(row.hotel_name) &&
    safe(row.rate_key) &&
    safe(row.image_url || row.direct_image_url) &&
    price(row.customer_total || row.selling_rate || row.amount) > 0 &&
    safe(row.country).toLowerCase() !== "unknown" &&
    safe(row.city).toLowerCase() !== "unknown"
  );
}

const clean = rows.filter(valid);
const destinationMap = new Map();
const hotelsByDestination = {};

for (const r of clean) {
  const country = safe(r.country);
  const city = safe(r.city);
  const key = `${country}|||${city}`;

  if (!destinationMap.has(country)) destinationMap.set(country, new Map());
  const cityMap = destinationMap.get(country);

  if (!cityMap.has(city)) {
    cityMap.set(city, {
      city,
      destination_code: safe(r.destination_code),
      live_hotels: 0
    });
  }

  if (!hotelsByDestination[key]) hotelsByDestination[key] = [];

  const hotelId = safe(r.canonical_hotel_id || r.supplier_hotel_id || r.hotel_id || r.hotel_code || r.hotel_name);
  if (hotelsByDestination[key].some((h) => h.hotel_id === hotelId)) continue;

  const total = price(r.customer_total || r.selling_rate || r.amount);
  const supplierTotal = price(r.supplier_total || r.net || total);

  cityMap.get(city).live_hotels++;

  hotelsByDestination[key].push({
    hotel_id: hotelId,
    hotel_name: safe(r.hotel_name),
    country,
    city,
    area: safe(r.address),
    address: safe(r.address),
    latitude: r.latitude || null,
    longitude: r.longitude || null,
    image_url: safe(r.image_url || r.direct_image_url),
    direct_image_url: safe(r.direct_image_url || r.image_url),
    live_rate_ready: true,
    real_image_verified: true,
    first_rate: {
      rate_key: safe(r.rate_key),
      room_name: safe(r.room_name || "Selected room"),
      board_name: safe(r.board_name || "Room only"),
      currency: safe(r.currency || "EUR"),
      customer_total: total,
      amount: total,
      selling_rate: total,
      supplier_total: supplierTotal,
      supplier_amount: supplierTotal,
      cancellation_policies: r.cancellation_policies || []
    }
  });
}

const countries = Array.from(destinationMap.entries())
  .map(([country, cities]) => ({
    country,
    cities: Array.from(cities.values())
      .filter((c) => (hotelsByDestination[`${country}|||${c.city}`] || []).length > 0)
      .map((c) => ({
        city: c.city,
        destination_code: c.destination_code
      }))
      .sort((a, b) => a.city.localeCompare(b.city))
  }))
  .filter((c) => c.cities.length > 0)
  .sort((a, b) => a.country.localeCompare(b.country));

fs.writeFileSync(outDest, JSON.stringify({ ok: true, countries }, null, 2));
fs.writeFileSync(outHotels, JSON.stringify({ ok: true, hotelsByDestination }));

console.log("Dropdown countries:", countries.length);
console.log("Dropdown cities:", countries.reduce((a, c) => a + c.cities.length, 0));
console.log("Hotel destination keys:", Object.keys(hotelsByDestination).length);
console.log("First country:", countries[0]?.country || "NONE");
console.log("First city:", countries[0]?.cities?.[0]?.city || "NONE");

if (!countries.length) {
  throw new Error("Dropdown build failed: no countries generated.");
}
