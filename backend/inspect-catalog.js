const fs = require("fs");
const path = require("path");

const root = "C:\\frontend\\hotel-booking-app";

function walk(dir) {
  let files = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) files = files.concat(walk(full));
    if (item.isFile() && item.name.toLowerCase().endsWith(".json")) files.push(full);
  }
  return files;
}

function scan(node, stats, depth = 0) {
  if (!node || depth > 8) return;

  if (Array.isArray(node)) {
    stats.arrays += 1;
    stats.maxArray = Math.max(stats.maxArray, node.length);
    for (let i = 0; i < Math.min(node.length, 50); i++) scan(node[i], stats, depth + 1);
    return;
  }

  if (typeof node === "object") {
    const keys = Object.keys(node);
    for (const k of keys) stats.keys.add(k);

    const country =
      node.country || node.countryName || node.country_name || node.countryCode || node.country_code;

    const city =
      node.city || node.cityName || node.city_name || node.destinationName || node.destination_name || node.name;

    if (country) stats.countries.add(String(country));
    if (city) stats.cities.add(String(city));

    for (const value of Object.values(node)) scan(value, stats, depth + 1);
  }
}

for (const file of walk(root)) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) continue;

    const json = JSON.parse(raw);

    const stats = {
      arrays: 0,
      maxArray: 0,
      keys: new Set(),
      countries: new Set(),
      cities: new Set()
    };

    scan(json, stats);

    if (stats.countries.size > 20 || stats.cities.size > 100 || stats.maxArray > 5000) {
      console.log("\nFILE:", file);
      console.log("SIZE MB:", (raw.length / 1024 / 1024).toFixed(2));
      console.log("MAX ARRAY:", stats.maxArray);
      console.log("COUNTRIES FOUND:", stats.countries.size);
      console.log("CITIES FOUND:", stats.cities.size);
      console.log("SAMPLE KEYS:", [...stats.keys].slice(0, 80).join(", "));
      console.log("SAMPLE COUNTRIES:", [...stats.countries].slice(0, 20).join(" | "));
      console.log("SAMPLE CITIES:", [...stats.cities].slice(0, 20).join(" | "));
    }
  } catch {}
}
