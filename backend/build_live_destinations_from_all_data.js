const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.cwd();
const BACKEND = path.join(ROOT, "backend");
const PUBLIC = path.join(ROOT, "frontend", "public");

function clean(v) {
  return String(v || "")
    .replace(/\s*\(\s*\d+\s*\)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(o, keys) {
  for (const k of keys) {
    if (o && o[k] !== undefined && o[k] !== null && String(o[k]).trim()) return o[k];
  }
  return "";
}

function rowsFromJson(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.countries)) return payload.countries;
  if (Array.isArray(payload.destinations)) return payload.destinations;
  return [];
}

function addPlace(map, countryRaw, cityRaw) {
  const country = clean(countryRaw);
  const city = clean(cityRaw);

  if (!country || !city) return;
  if (country.toLowerCase() === "unknown") return;
  if (city.toLowerCase() === "unknown") return;
  if (country.length < 2 || city.length < 2) return;

  if (!map.has(country)) map.set(country, new Set());
  map.get(country).add(city);
}

function handleRow(map, row) {
  const country = pick(row, [
    "country_name",
    "countryName",
    "country",
    "country_code",
    "countryCode"
  ]);

  const city = pick(row, [
    "city_name",
    "cityName",
    "city",
    "destination",
    "destination_name",
    "destinationName"
  ]);

  addPlace(map, country, city);

  const cities = Array.isArray(row.cities)
    ? row.cities
    : Array.isArray(row.destinations)
      ? row.destinations
      : Array.isArray(row.locations)
        ? row.locations
        : [];

  for (const item of cities) {
    addPlace(
      map,
      country || pick(item, ["country", "country_name", "countryName"]),
      typeof item === "string"
        ? item
        : pick(item, ["city", "city_name", "cityName", "name", "label", "destination"])
    );
  }
}

function scanJsonFile(map, file) {
  try {
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const row of rowsFromJson(payload)) handleRow(map, row);
  } catch {}
}

function scanGzipNdjsonFile(map, file) {
  try {
    const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        handleRow(map, JSON.parse(line));
      } catch {}
    }
  } catch {}
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

const map = new Map();

const allFiles = [
  ...walk(path.join(BACKEND, "data")),
  ...walk(PUBLIC)
];

for (const file of allFiles) {
  const lower = file.toLowerCase();

  if (lower.endsWith(".json")) scanJsonFile(map, file);
  if (lower.endsWith(".ndjson.gz")) scanGzipNdjsonFile(map, file);
}

const countries = Array.from(map.entries())
  .map(([country, cities]) => ({
    country,
    cities: Array.from(cities)
      .sort((a, b) => a.localeCompare(b))
      .map((city) => ({ city }))
  }))
  .filter((x) => x.country && x.cities.length)
  .sort((a, b) => a.country.localeCompare(b.country));

const output = {
  ok: true,
  generated_at: new Date().toISOString(),
  total_countries: countries.length,
  total_cities: countries.reduce((sum, c) => sum + c.cities.length, 0),
  countries
};

fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(path.join(BACKEND, "data"), { recursive: true });

fs.writeFileSync(
  path.join(PUBLIC, "live-destinations.json"),
  JSON.stringify(output, null, 2)
);

fs.writeFileSync(
  path.join(BACKEND, "data", "live-destinations.json"),
  JSON.stringify(output, null, 2)
);

console.log("DONE");
console.log("Countries:", output.total_countries);
console.log("Cities:", output.total_cities);
console.log("Wrote frontend/public/live-destinations.json");
console.log("Wrote backend/data/live-destinations.json");
