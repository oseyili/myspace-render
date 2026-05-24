const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.cwd();
const DATA = path.join(ROOT, "backend", "data");

const registryFile = path.join(DATA, "master_hotel_registry.json.gz");
const ratesFile = path.join(DATA, "REAL_ONLY_live_rates.json.gz");
const outFile = path.join(DATA, "live-hotels.ndjson.gz");
const metaFile = path.join(DATA, "live-hotels-meta.json");

function clean(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function pick(o, keys) {
  for (const k of keys) {
    const v = o?.[k];
    if (v !== undefined && v !== null && String(v).trim()) return v;
  }
  return "";
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

function readGzJson(file) {
  const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
  return rows(JSON.parse(text));
}

function getId(row) {
  return clean(pick(row, [
    "hotel_id", "hotelId", "id", "code", "hotelCode", "supplier_hotel_id"
  ]));
}

function getName(row) {
  return clean(pick(row, [
    "hotel_name", "hotelName", "name", "title"
  ]));
}

function getCountry(row) {
  return clean(pick(row, [
    "country", "country_name", "countryName", "country_code", "countryCode"
  ]));
}

function getCity(row) {
  return clean(pick(row, [
    "city", "city_name", "cityName", "destination", "destination_name", "destinationName", "destinationCode"
  ]));
}

function getImage(row) {
  return clean(pick(row, [
    "image_url", "image", "main_image", "mainImage", "photo", "thumbnail"
  ]));
}

function getAddress(row) {
  return clean(pick(row, [
    "address", "address1", "street", "zone", "area"
  ]));
}

function makeHotel(row, index) {
  const id = getId(row) || `hotel-${index}`;
  const name = getName(row);
  const country = getCountry(row);
  const city = getCity(row);

  if (!name || !country || !city) return null;

  const image = getImage(row);

  return {
    id,
    hotel_id: id,
    hotel_name: name,
    name,
    country,
    city,
    area: clean(pick(row, ["area", "zone", "district"])),
    address: getAddress(row),
    rating: clean(pick(row, ["rating", "category", "stars"])),
    image_url: image,
    image_caption: image ? "Verified property image" : "",
    image_source: image ? "MySpace Hotel verified image" : "",
    has_verified_image: Boolean(image),
    latitude: pick(row, ["latitude", "lat"]),
    longitude: pick(row, ["longitude", "lng", "lon"]),
    first_rate: null
  };
}

function rateFrom(row) {
  const src = row.first_rate || row.rate || row;
  const amount = Number(pick(src, ["amount", "price", "total", "net", "sellingRate", "rate"]));
  if (!(amount > 0)) return null;

  return {
    amount,
    currency: clean(pick(src, ["currency", "currencyCode"])) || "GBP",
    rate_key: clean(pick(src, ["rate_key", "rateKey"]))
  };
}

const registry = readGzJson(registryFile);
const rates = fs.existsSync(ratesFile) ? readGzJson(ratesFile) : [];

const byId = new Map();
const seen = new Set();

for (const row of registry) {
  const hotel = makeHotel(row, byId.size);
  if (!hotel) continue;

  const key = `${hotel.hotel_id}|${hotel.hotel_name}|${hotel.country}|${hotel.city}`;
  if (seen.has(key)) continue;

  seen.add(key);
  byId.set(hotel.hotel_id, hotel);
}

for (const row of rates) {
  const id = getId(row);
  const rate = rateFrom(row);
  if (!id || !rate) continue;

  if (byId.has(id)) {
    byId.get(id).first_rate = rate;
  }
}

const hotels = Array.from(byId.values()).filter((h) => {
  const name = h.hotel_name.toLowerCase();
  return name && !name.includes("placecard") && !name.includes("placeholder");
});

const ndjson = hotels.map((h) => JSON.stringify(h)).join("\n");

fs.writeFileSync(outFile, zlib.gzipSync(Buffer.from(ndjson, "utf8"), { level: 9 }));

fs.writeFileSync(metaFile, JSON.stringify({
  ok: true,
  generated_at: new Date().toISOString(),
  total_hotels: hotels.length,
  storage: "compressed_ndjson_gzip",
  source: "master_hotel_registry_json_gz",
  file: "backend/data/live-hotels.ndjson.gz"
}, null, 2));

const london = hotels.filter(h =>
  String(h.country).toLowerCase().includes("united kingdom") &&
  String(h.city).toLowerCase().includes("london")
).slice(0, 10);

console.log("DONE");
console.log("Hotels:", hotels.length);
console.log("London sample:", london.map(h => h.hotel_name).join(" | "));
