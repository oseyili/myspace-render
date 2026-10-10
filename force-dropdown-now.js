const fs = require("fs");
const path = require("path");

const appFile = "./frontend/src/App.jsx";
const destFile = "./frontend/public/live-destinations.json";
const moduleFile = "./frontend/src/liveDestinations.js";

const data = JSON.parse(fs.readFileSync(destFile, "utf8"));
const countries = Array.isArray(data.countries) ? data.countries : [];

if (!countries.length) {
  throw new Error("live-destinations.json is empty");
}

fs.writeFileSync(
  moduleFile,
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

s = s.replace(/\{c\.city\}\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{c.city}");
s = s.replace(/\{city\.city\}\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{city.city}");
s = s.replace(/\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");
s = s.replace(/\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");

fs.writeFileSync(appFile, s, "utf8");

console.log("FORCED live dropdown embed complete");
console.log("Countries:", countries.length);
console.log("First country:", countries[0].country);
console.log("First city:", countries[0].cities?.[0]?.city);
