const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = process.cwd();
const DROOT = "D:\\";
const BACKEND_DATA = path.join(ROOT, "backend", "data");
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

function rows(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.countries)) return payload.countries;
  if (Array.isArray(payload.destinations)) return payload.destinations;
  return [];
}

function add(map, countryRaw, cityRaw) {
  const country = clean(countryRaw);
  const city = clean(cityRaw);

  if (!country || !city) return;
  if (country.toLowerCase() === "unknown") return;
  if (city.toLowerCase() === "unknown") return;
  if (country.length < 2 || city.length < 2) return;

  if (!map.has(country)) map.set(country, new Set());
  map.get(country).add(city);
}

function processRow(map, row) {
  const country = pick(row, [
    "country",
    "country_name",
    "countryName",
    "country_code",
    "countryCode"
  ]);

  const city = pick(row, [
    "city",
    "city_name",
    "cityName",
    "destination",
    "destination_name",
    "destinationName",
    "name"
  ]);

  add(map, country, city);

  const nestedCities = Array.isArray(row.cities)
    ? row.cities
    : Array.isArray(row.destinations)
      ? row.destinations
      : Array.isArray(row.locations)
        ? row.locations
        : [];

  for (const item of nestedCities) {
    add(
      map,
      country || pick(item, ["country", "country_name", "countryName"]),
      typeof item === "string"
        ? item
        : pick(item, ["city", "city_name", "cityName", "name", "label", "destination"])
    );
  }
}

function scanJson(map, file) {
  try {
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const row of rows(payload)) processRow(map, row);
  } catch {}
}

function scanNdjsonGz(map, file) {
  try {
    const text = zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        processRow(map, JSON.parse(line));
      } catch {}
    }
  } catch {}
}

function walkLimited(dir, out = []) {
  if (!fs.existsSync(dir)) return out;

  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);

    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const lower = full.toLowerCase();
      if (
        lower.includes("hotel") ||
        lower.includes("booking") ||
        lower.includes("live") ||
        lower.includes("rate") ||
        lower.includes("destination") ||
        lower.includes("myspace")
      ) {
        walkLimited(full, out);
      }
      continue;
    }

    const lower = full.toLowerCase();
    if (
      lower.endsWith(".json") ||
      lower.endsWith(".ndjson.gz")
    ) {
      if (
        lower.includes("hotel") ||
        lower.includes("booking") ||
        lower.includes("live") ||
        lower.includes("rate") ||
        lower.includes("destination") ||
        lower.includes("catalog")
      ) {
        out.push(full);
      }
    }
  }

  return out;
}

const map = new Map();

const files = [
  ...walkLimited(DROOT),
  ...walkLimited(path.join(ROOT, "backend", "data")),
  ...walkLimited(path.join(ROOT, "frontend", "public"))
];

console.log("Candidate files found:", files.length);

for (const file of files) {
  const lower = file.toLowerCase();

  if (lower.endsWith(".json")) scanJson(map, file);
  if (lower.endsWith(".ndjson.gz")) scanNdjsonGz(map, file);
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
  source: "D drive restored destination catalogue",
  generated_at: new Date().toISOString(),
  total_countries: countries.length,
  total_cities: countries.reduce((sum, item) => sum + item.cities.length, 0),
  countries
};

fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(BACKEND_DATA, { recursive: true });

fs.writeFileSync(
  path.join(PUBLIC, "live-destinations.json"),
  JSON.stringify(output, null, 2)
);

fs.writeFileSync(
  path.join(BACKEND_DATA, "live-destinations.json"),
  JSON.stringify(output, null, 2)
);

console.log("DONE");
console.log("Countries:", output.total_countries);
console.log("Cities:", output.total_cities);
console.log("Written:", path.join(PUBLIC, "live-destinations.json"));
console.log("Written:", path.join(BACKEND_DATA, "live-destinations.json"));

if (output.total_countries < 100) {
  console.log("WARNING: Less than 100 countries found. The full D-drive dataset may be in a folder name not scanned.");
}
