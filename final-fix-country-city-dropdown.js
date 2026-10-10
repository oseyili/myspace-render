const fs = require("fs");

const file = "frontend/src/App.jsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
/const API_BASE =[\s\S]*?;/,
`const API_BASE = "http://127.0.0.1:5050";`
);

s = s.replace(
/async function loadDestinations\(\) \{[\s\S]*?\n  async function searchHotels\(\) \{/,
`async function loadDestinations() {
    setNotice("");

    try {
      const res = await fetch("/safe-destinations.json", { cache: "no-store" });
      const data = await res.json();
      const raw = Array.isArray(data?.countries) ? data.countries : [];

      const cleaned = raw
        .filter((x) => clean(x.country))
        .map((x) => {
          const seen = new Map();

          (x.cities || []).forEach((c) => {
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

      setDestinations(cleaned);

      if (!cleaned.length) {
        setNotice("Destinations are loading. Please refresh the page.");
      }
    } catch (err) {
      console.log(err);
      setNotice("Destinations could not be loaded. Please restart the app.");
    }
  }

  async function searchHotels() {`
);

fs.writeFileSync(file, s, "utf8");

console.log("App.jsx now loads safe-destinations.json first.");
