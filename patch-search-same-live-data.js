const fs = require("fs");

const file = "./frontend/src/App.jsx";
let s = fs.readFileSync(file, "utf8");

function replaceFunction(source, name, replacement) {
  const start = source.indexOf(`async function ${name}(`);
  if (start < 0) throw new Error(`Missing function ${name}`);

  const brace = source.indexOf("{", start);
  let depth = 0;

  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") depth--;

    if (depth === 0) {
      return source.slice(0, start) + replacement + source.slice(i + 1);
    }
  }

  throw new Error(`Could not parse ${name}`);
}

const runSearch = `async function runSearch(nextCountry = country, nextCity = city) {
    const searchCountry = safeText(nextCountry);
    const searchCity = safeText(nextCity);

    if (!searchCountry || !searchCity) {
      setMessage("Choose an available live-rate destination first.");
      return;
    }

    setLoading(true);
    setSelectedHotel(null);
    clearConverted();
    setMessage("");

    try {
      const key = \`\${searchCountry}|||\${searchCity}\`;
      const staticRes = await fetch("/live-hotels.json", { cache: "no-store" });
      const staticData = await staticRes.json().catch(() => ({}));
      let list = staticData?.hotelsByDestination?.[key] || [];

      if (keyword.trim()) {
        const q = keyword.trim().toLowerCase();
        list = list.filter((h) =>
          safeText(h.hotel_name).toLowerCase().includes(q) ||
          safeText(h.address).toLowerCase().includes(q) ||
          safeText(h.area).toLowerCase().includes(q)
        );
      }

      if (area.trim()) {
        const q = area.trim().toLowerCase();
        list = list.filter((h) =>
          safeText(h.address).toLowerCase().includes(q) ||
          safeText(h.area).toLowerCase().includes(q) ||
          safeText(h.hotel_name).toLowerCase().includes(q)
        );
      }

      setHotels(list);
      setSelectedHotel(list[0] || null);
      setMessage(list.length ? \`\${list.length} live-rate stays available in \${searchCity}.\` : "No matching live-rate stay found for this filter. Clear area or keyword and search again.");
    } catch {
      setHotels([]);
      setSelectedHotel(null);
      setMessage("Live-rate stays are unavailable right now. Please refresh and try again.");
    } finally {
      setLoading(false);
    }
  }`;

s = replaceFunction(s, "runSearch", runSearch);

fs.writeFileSync(file, s);
console.log("Frontend search now uses same live data as dropdown.");
