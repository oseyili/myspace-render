const fs = require("fs");
const p = "./frontend/src/App.jsx";
let s = fs.readFileSync(p, "utf8");

function replaceFunction(source, name, replacement) {
  const start = source.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);

  const brace = source.indexOf("{", start);
  let depth = 0;
  let end = -1;

  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end < 0) throw new Error(`Could not parse function ${name}`);

  return source.slice(0, start) + replacement + source.slice(end);
}

const loadCatalog = `async function loadCatalog() {
    setLoadingCatalog(true);

    try {
      let loaded = [];

      const staticRes = await fetch("/live-destinations.json", { cache: "no-store" });
      const staticData = await staticRes.json().catch(() => ({}));
      loaded = Array.isArray(staticData.countries) ? staticData.countries : [];

      if (!loaded.length) {
        const bootRes = await fetch(\`\${API_BASE}/api/bootstrap\`, { cache: "no-store" });
        const boot = await bootRes.json().catch(() => ({}));
        loaded = Array.isArray(boot.countries) ? boot.countries : [];
      }

      const normalized = normalizeCountries(loaded);
      setCatalog(normalized);

      const firstCountry = normalized[0] || null;
      const firstCity = firstCountry?.cities?.[0]?.city || "";

      setCountry(firstCountry?.country || "");
      setCity(firstCity);
      setHotels([]);
      setSelectedHotel(null);
      clearConverted();

      setMessage(
        firstCountry && firstCity
          ? "Available live-rate destinations are ready."
          : "No live-rate destinations are available right now."
      );
    } catch {
      setMessage("No live-rate destinations are available right now.");
    } finally {
      setLoadingCatalog(false);
    }
  }`;

s = replaceFunction(s, "loadCatalog", loadCatalog);

s = s
  .replace(/Live destinations are updating\. Please refresh shortly\./g, "No live-rate destinations are available right now.")
  .replace(/Choose from current live-rate destinations\./g, "Available live-rate destinations are ready.")
  .replace(/Choose a destination, then press Search stays\./g, "Choose an available destination, then press Search stays.");

fs.writeFileSync(p, s);
console.log("Frontend patched for immediate live-destination dropdown.");
