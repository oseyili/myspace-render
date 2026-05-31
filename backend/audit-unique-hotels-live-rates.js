const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function readJsonGz(file) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
}
function clean(v) {
  return String(v || "").trim();
}
function key(v) {
  return clean(v).toLowerCase();
}

const registry = readJsonGz(path.join("data", "master_hotel_registry.json.gz"));

const chunksDir = path.join("data", "live-rate-cache");
const chunkFiles = fs.readdirSync(chunksDir)
  .filter(f => f.startsWith("live-rates-smart-") && f.endsWith(".ndjson.gz"))
  .sort();

let liveRows = [];
for (const f of chunkFiles) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(chunksDir, f))).toString("utf8");
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) liveRows.push(JSON.parse(line));
  }
}

const globalHotels = new Set();
const globalCountryCities = new Set();
const liveHotels = new Set();
const liveRateKeys = new Set();
const liveCountryCities = new Set();
const cityLiveCounts = new Map();

for (const h of registry) {
  const id = key(h.canonical_hotel_id || h.supplier_hotel_id || h.hotel_name);
  if (id) globalHotels.add(id);
  if (h.country && h.city) globalCountryCities.add(`${clean(h.country)}|||${clean(h.city)}`);
}

for (const r of liveRows) {
  const country = clean(r.destination_country || r.country);
  const city = clean(r.destination_city || r.city);
  const hotelId = key(r.hotel_id || r.hotel_code || r.hotel_name);
  const rateKey = key(r.rate_key || r.rateKey);

  if (hotelId) liveHotels.add(hotelId);
  if (rateKey) liveRateKeys.add(rateKey);
  if (country && city) {
    liveCountryCities.add(`${country}|||${city}`);
    const k = `${country}|||${city}`;
    cityLiveCounts.set(k, (cityLiveCounts.get(k) || 0) + 1);
  }
}

console.log("");
console.log("GLOBAL UNIQUE HOTELS:", globalHotels.size);
console.log("GLOBAL UNIQUE COUNTRY/CITY PAIRS:", globalCountryCities.size);
console.log("RAW LIVE RATE ROWS:", liveRows.length);
console.log("UNIQUE LIVE HOTELS:", liveHotels.size);
console.log("UNIQUE LIVE RATE KEYS:", liveRateKeys.size);
console.log("LIVE COUNTRY/CITY PAIRS:", liveCountryCities.size);
console.log("");
console.log("TOP LIVE CITIES:");
[...cityLiveCounts.entries()]
  .sort((a,b) => b[1] - a[1])
  .slice(0, 30)
  .forEach(([k,v]) => console.log(v, k));
