const fs = require("fs");
const p = "./frontend/src/App.jsx";
let s = fs.readFileSync(p, "utf8");

function findFunctions(source, name) {
  const starts = [];
  let index = 0;
  while (true) {
    const start = source.indexOf(`async function ${name}()`, index);
    if (start < 0) break;
    starts.push(start);
    index = start + 1;
  }
  return starts;
}

function replaceAt(source, start, replacement) {
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) {
      return source.slice(0, start) + replacement + source.slice(i + 1);
    }
  }
  throw new Error("Function parse failed");
}

const travelLoadCatalog = `async function loadCatalog() {
    try {
      const res = await fetch("/live-destinations.json", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const loaded = Array.isArray(data.countries) ? data.countries : [];
      setCatalog(loaded);

      const normalized = normalizeCountries(loaded);
      const currentCountry = params.get("country") || "";
      const currentCity = params.get("city") || "";

      if (currentCountry && currentCity) {
        setCountry(currentCountry);
        setCity(currentCity);
        loadGuide(currentCountry, currentCity, area);
      } else {
        const firstCountry = normalized[0] || null;
        const firstCity = firstCountry?.cities?.[0]?.city || "";
        setCountry(firstCountry?.country || "");
        setCity(firstCity);
        setGuide(null);
        setMessage(firstCountry && firstCity ? "Available live-rate destinations are ready." : "No live-rate destinations are available right now.");
      }
    } catch {
      setMessage("No live-rate destinations are available right now.");
    }
  }`;

const mainLoadCatalog = `async function loadCatalog() {
    setLoadingCatalog(true);

    try {
      const res = await fetch("/live-destinations.json", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      const loaded = Array.isArray(data.countries) ? data.countries : [];

      const normalized = normalizeCountries(loaded);
      setCatalog(normalized);

      const firstCountry = normalized[0] || null;
      const firstCity = firstCountry?.cities?.[0]?.city || "";

      setCountry(firstCountry?.country || "");
      setCity(firstCity);
      setHotels([]);
      setSelectedHotel(null);
      clearConverted();

      setMessage(firstCountry && firstCity ? "Available live-rate destinations are ready." : "No live-rate destinations are available right now.");
    } catch {
      setMessage("No live-rate destinations are available right now.");
    } finally {
      setLoadingCatalog(false);
    }
  }`;

let starts = findFunctions(s, "loadCatalog");
if (starts.length < 2) throw new Error("Expected 2 loadCatalog functions, found " + starts.length);

s = replaceAt(s, starts[1], mainLoadCatalog);
starts = findFunctions(s, "loadCatalog");
s = replaceAt(s, starts[0], travelLoadCatalog);

s = s
  .replace(/\$\{countries\.length\} countries ready\./g, "Available live-rate destinations are ready.")
  .replace(/Choose a destination, then press Search stays\./g, "Choose an available destination, then press Search stays.")
  .replace(/Live destinations are updating\. Please refresh shortly\./g, "No live-rate destinations are available right now.");

fs.writeFileSync(p, s);
console.log("Patched both loadCatalog functions.");
