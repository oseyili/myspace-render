const fs = require("fs");

const file = "frontend/src/App.jsx";
let s = fs.readFileSync(file, "utf8");

const helper = `
const SANCTIONED_COUNTRY_NAMES = new Set([
  "Afghanistan",
  "Belarus",
  "Burundi",
  "Central African Republic",
  "Chad",
  "Congo Republic",
  "Cuba",
  "Democratic Republic of the Congo",
  "Eritrea",
  "Iraq",
  "Iran",
  "Libya",
  "Myanmar",
  "North Korea",
  "Somalia",
  "South Sudan",
  "Sudan",
  "Syria",
  "Russia",
  "Venezuela",
  "Yemen"
]);

function isSanctionedCountryName(country) {
  return SANCTIONED_COUNTRY_NAMES.has(clean(country));
}
`;

if (!s.includes("SANCTIONED_COUNTRY_NAMES")) {
  s = s.replace("function mapsLink(type, query) {", helper + "\nfunction mapsLink(type, query) {");
}

s = s.replace(
/async function loadDestinations\(\) \{[\s\S]*?\n  async function searchHotels\(\) \{/,
`async function loadDestinations() {
    setNotice("");

    const urls = [
      "http://127.0.0.1:5050/api/destinations",
      "http://localhost:5050/api/destinations",
      API_BASE + "/api/destinations"
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        const raw = Array.isArray(data?.countries) ? data.countries : [];

        const cleaned = raw
          .filter((x) => clean(x.country))
          .filter((x) => !isSanctionedCountryName(x.country))
          .map((x) => {
            const citySource = Array.isArray(x.cities)
              ? x.cities
              : Array.isArray(x.cities_full)
                ? x.cities_full.map((c) => c.city)
                : [];

            const seen = new Map();

            citySource.forEach((c) => {
              const name = clean(c);
              if (!name) return;

              const key = normalizeKey(name);
              if (!seen.has(key)) seen.set(key, name);
            });

            return {
              country: clean(x.country),
              cities: Array.from(seen.values()).sort((a, b) => a.localeCompare(b))
            };
          })
          .filter((x) => x.country && x.cities.length)
          .sort((a, b) => a.country.localeCompare(b.country));

        if (cleaned.length) {
          setDestinations(cleaned);
          setNotice("");
          console.log("Loaded destinations:", cleaned.length, "from", url);
          return;
        }
      } catch (err) {
        console.log("Destination load failed:", url, err);
      }
    }

    setDestinations([]);
    setNotice("Destinations could not be loaded. Please make sure the backend is running on port 5050.");
  }

  async function searchHotels() {`
);

fs.writeFileSync(file, s, "utf8");
console.log("Country/city dropdown fixed with sanctioned countries removed.");
