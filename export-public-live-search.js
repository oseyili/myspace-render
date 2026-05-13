const fs = require("fs");
const zlib = require("zlib");

fs.mkdirSync("./frontend/public", { recursive: true });

const gz = "./backend/data/REAL_ONLY_live_rates.json.gz";
const rows = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString("utf8"));

function safe(v) {
  return String(v || "").trim();
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function good(r) {
  return (
    safe(r.country) &&
    safe(r.city) &&
    safe(r.hotel_name) &&
    safe(r.rate_key) &&
    safe(r.image_url || r.direct_image_url) &&
    money(r.customer_total || r.selling_rate || r.amount) > 0 &&
    String(r.country).toLowerCase() !== "unknown" &&
    String(r.city).toLowerCase() !== "unknown"
  );
}

const clean = rows.filter(good);

const destinationMap = new Map();
const hotelMap = new Map();

for (const r of clean) {
  const country = safe(r.country);
  const city = safe(r.city);
  const key = `${country}|||${city}`;

  if (!destinationMap.has(country)) destinationMap.set(country, new Map());
  const cityMap = destinationMap.get(country);

  if (!cityMap.has(city)) {
    cityMap.set(city, {
      city,
      live_hotels: 0,
      destination_code: safe(r.destination_code)
    });
  }

  cityMap.get(city).live_hotels++;

  if (!hotelMap.has(key)) hotelMap.set(key, []);

  const hotelId = safe(r.canonical_hotel_id || r.hotel_id || r.hotel_code || r.supplier_hotel_id || r.hotel_name);
  const existing = hotelMap.get(key).some((x) => x.hotel_id === hotelId);
  if (existing) continue;

  const total = money(r.customer_total || r.selling_rate || r.amount);
  const supplierTotal = money(r.supplier_total || r.net || total);

  hotelMap.get(key).push({
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

const countries = [...destinationMap.entries()].map(([country, cities]) => ({
  country,
  cities: [...cities.values()]
    .filter((c) => (hotelMap.get(`${country}|||${c.city}`) || []).length > 0)
    .sort((a, b) => b.live_hotels - a.live_hotels || a.city.localeCompare(b.city))
})).filter((x) => x.cities.length).sort((a, b) => a.country.localeCompare(b.country));

const searchIndex = {};
for (const [key, hotels] of hotelMap.entries()) {
  if (hotels.length) searchIndex[key] = hotels.slice(0, 100);
}

fs.writeFileSync("./frontend/public/live-destinations.json", JSON.stringify({ ok: true, countries }, null, 2));
fs.writeFileSync("./frontend/public/live-hotels.json", JSON.stringify({ ok: true, hotelsByDestination: searchIndex }));

console.log("Countries:", countries.length);
console.log("Cities:", countries.reduce((a, c) => a + c.cities.length, 0));
console.log("Searchable destination keys:", Object.keys(searchIndex).length);
