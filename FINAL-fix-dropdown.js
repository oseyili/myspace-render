const fs = require("fs");
const path = require("path");

function findFile(dir, name) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && !["node_modules", "dist", ".git"].includes(item.name)) {
      const found = findFile(full, name);
      if (found) return found;
    }
    if (item.isFile() && item.name === name) return full;
  }
  return "";
}

const appFile = findFile("./frontend", "App.jsx");
if (!appFile) throw new Error("Could not find App.jsx");

const appDir = path.dirname(appFile);
const liveFile = path.join(appDir, "liveDestinations.js");
const destFile = "./frontend/public/live-destinations.json";

const data = JSON.parse(fs.readFileSync(destFile, "utf8"));
const countries = Array.isArray(data.countries) ? data.countries : [];
if (!countries.length) throw new Error("live-destinations.json has no countries");

fs.writeFileSync(
  liveFile,
  "export const LIVE_DESTINATIONS = " + JSON.stringify(countries, null, 2) + ";\n",
  "utf8"
);

let s = fs.readFileSync(appFile, "utf8");

if (!s.includes("LIVE_DESTINATIONS")) {
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

s = s.replace(/\{c\.city\}\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{c.city}");
s = s.replace(/\{city\.city\}\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{city.city}");

fs.writeFileSync(appFile, s, "utf8");

console.log("Patched App:", appFile);
console.log("Created live destinations module:", liveFile);
console.log("Countries embedded:", countries.length);
console.log("First:", countries[0].country, "-", countries[0].cities?.[0]?.city);
