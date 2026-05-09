const fs = require("fs");
const path = require("path");

const roots = [
  "C:\\frontend\\hotel-booking-app",
  "D:\\"
];

function safeReadJson(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractArray(json) {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  if (Array.isArray(json.hotels)) return json.hotels;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.results)) return json.results;
  if (Array.isArray(json.items)) return json.items;
  if (json.data && Array.isArray(json.data.hotels)) return json.data.hotels;
  if (json.catalog && Array.isArray(json.catalog.hotels)) return json.catalog.hotels;
  return [];
}

function clean(v) {
  return String(v || "").trim();
}

function findFiles(dir, out = []) {
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);

      if (item.isDirectory()) {
        if (!["node_modules", ".git", "dist", "build"].includes(item.name)) {
          findFiles(full, out);
        }
      }

      if (item.isFile() && [".json", ".csv"].includes(path.extname(item.name).toLowerCase())) {
        const size = fs.statSync(full).size;
        if (size > 500000) out.push(full);
      }
    }
  } catch {}

  return out;
}

function scanJson(file) {
  const json = safeReadJson(file);
  const arr = extractArray(json);

  if (!arr.length) return null;

  const countries = new Set();
  const cities = new Set();
  const destinationCodes = new Set();
  const hotelNames = new Set();

  for (const item of arr.slice(0, Math.min(arr.length, 20000))) {
    const country =
      item.country ||
      item.countryName ||
      item.country_name ||
      item.countryCode ||
      item.country_code ||
      item.address?.country ||
      item.location?.country;

    const city =
      item.city ||
      item.cityName ||
      item.city_name ||
      item.destinationName ||
      item.destination_name ||
      item.destination?.city ||
      item.address?.city ||
      item.location?.city;

    const destinationCode =
      item.destination_code ||
      item.destinationCode ||
      item.destination ||
      item.city_code ||
      item.cityCode;

    const hotelName =
      item.hotel_name ||
      item.hotelName ||
      item.name ||
      item.property_name ||
      item.propertyName;

    if (clean(country)) countries.add(clean(country));
    if (clean(city)) cities.add(clean(city));
    if (clean(destinationCode)) destinationCodes.add(clean(destinationCode));
    if (clean(hotelName)) hotelNames.add(clean(hotelName));
  }

  return {
    file,
    records: arr.length,
    sampledCountries: countries.size,
    sampledCities: cities.size,
    sampledDestinationCodes: destinationCodes.size,
    sampledHotelNames: hotelNames.size,
    sampleKeys: Object.keys(arr[0] || {}).join(", ")
  };
}

const files = roots.flatMap((root) => findFiles(root));
const results = [];

for (const file of files) {
  if (path.extname(file).toLowerCase() !== ".json") continue;
  const r = scanJson(file);
  if (r) results.push(r);
}

results.sort((a, b) => {
  const scoreA = a.records + a.sampledCountries * 100000 + a.sampledCities * 1000;
  const scoreB = b.records + b.sampledCountries * 100000 + b.sampledCities * 1000;
  return scoreB - scoreA;
});

console.log("\nBEST HOTEL DATA FILE CANDIDATES:\n");

for (const r of results.slice(0, 30)) {
  console.log("FILE:", r.file);
  console.log("RECORDS:", r.records);
  console.log("SAMPLED COUNTRIES:", r.sampledCountries);
  console.log("SAMPLED CITIES:", r.sampledCities);
  console.log("SAMPLED DESTINATION CODES:", r.sampledDestinationCodes);
  console.log("SAMPLED HOTEL NAMES:", r.sampledHotelNames);
  console.log("KEYS:", r.sampleKeys);
  console.log("--------------------------------------------------");
}
