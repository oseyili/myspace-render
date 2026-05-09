const fs = require("fs");

const raw = fs.readFileSync("./data/hotel_supplier_feed.json", "utf8");
const json = JSON.parse(raw);

function scan(node, stats, depth = 0) {
  if (!node || depth > 10) return;

  if (Array.isArray(node)) {
    stats.maxArray = Math.max(stats.maxArray, node.length);
    for (let i = 0; i < Math.min(node.length, 500); i++) {
      scan(node[i], stats, depth + 1);
    }
    return;
  }

  if (typeof node === "object") {
    for (const key of Object.keys(node)) stats.keys.add(key);

    const country =
      node.country ||
      node.countryName ||
      node.country_name ||
      node.destination_country ||
      node.countryCode ||
      node.country_code;

    const city =
      node.city ||
      node.cityName ||
      node.city_name ||
      node.destination_city ||
      node.destinationName ||
      node.name;

    if (country) stats.countries.add(String(country));
    if (city) stats.cities.add(String(city));

    for (const value of Object.values(node)) {
      scan(value, stats, depth + 1);
    }
  }
}

const stats = {
  keys: new Set(),
  countries: new Set(),
  cities: new Set(),
  maxArray: 0,
};

scan(json, stats);

console.log("COUNTRIES:", stats.countries.size);
console.log("CITIES:", stats.cities.size);
console.log("MAX ARRAY:", stats.maxArray);
console.log("KEYS:", [...stats.keys].slice(0, 120).join(", "));
console.log("COUNTRY SAMPLE:", [...stats.countries].slice(0, 30).join(" | "));
console.log("CITY SAMPLE:", [...stats.cities].slice(0, 30).join(" | "));
