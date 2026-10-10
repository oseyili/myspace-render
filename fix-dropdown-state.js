const fs = require("fs");

const appFile = "./frontend/src/App.jsx";
const destFile = "./frontend/public/live-destinations.json";
const liveModule = "./frontend/src/liveDestinations.js";

const data = JSON.parse(fs.readFileSync(destFile, "utf8"));
const countries = Array.isArray(data.countries) ? data.countries : [];

if (!countries.length) {
  throw new Error("No live destinations found in frontend/public/live-destinations.json");
}

fs.writeFileSync(
  liveModule,
  "export const LIVE_DESTINATIONS = " + JSON.stringify(countries, null, 2) + ";\n",
  "utf8"
);

let s = fs.readFileSync(appFile, "utf8");

if (!s.includes('import { LIVE_DESTINATIONS } from "./liveDestinations";')) {
  s = s.replace(
    'import React, { useEffect, useMemo, useState } from "react";',
    'import React, { useEffect, useMemo, useState } from "react";\nimport { LIVE_DESTINATIONS } from "./liveDestinations";'
  );
}

s = s.replaceAll(
  'const [catalog, setCatalog] = useState([]);',
  'const [catalog, setCatalog] = useState(LIVE_DESTINATIONS);'
);

s = s.replaceAll(
  'const [country, setCountry] = useState("");',
  'const [country, setCountry] = useState(LIVE_DESTINATIONS[0]?.country || "");'
);

s = s.replaceAll(
  'const [city, setCity] = useState("");',
  'const [city, setCity] = useState(LIVE_DESTINATIONS[0]?.cities?.[0]?.city || "");'
);

s = s.replaceAll(
  'const countries = useMemo(() => normalizeCountries(catalog), [catalog]);',
  'const countries = useMemo(() => { const list = normalizeCountries(catalog); return list.length ? list : normalizeCountries(LIVE_DESTINATIONS); }, [catalog]);'
);

s = s.replaceAll(
  'const selectedCountry = useMemo(() => countries.find((x) => x.country === country) || null, [countries, country]);',
  'const selectedCountry = useMemo(() => countries.find((x) => x.country === country) || countries[0] || null, [countries, country]);'
);

s = s.replaceAll(
  'const cities = useMemo(() => selectedCountry?.cities || [], [selectedCountry]);',
  'const cities = useMemo(() => selectedCountry?.cities || [], [selectedCountry]);'
);

s = s.replace(/\{c\.city\}\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{c.city}");
s = s.replace(/\{city\.city\}\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{city.city}");

fs.writeFileSync(appFile, s, "utf8");

console.log("Dropdown fixed with embedded live destinations.");
console.log("Countries:", countries.length);
console.log("First country:", countries[0].country);
console.log("First city:", countries[0].cities?.[0]?.city);
