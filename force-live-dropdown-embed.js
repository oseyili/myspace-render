const fs = require("fs");
const path = require("path");

const appFile = fs.existsSync("./frontend/src/App.jsx")
  ? "./frontend/src/App.jsx"
  : "./frontend/App.jsx";

const srcDir = path.dirname(appFile);
const publicFile = "./frontend/public/live-destinations.json";
const moduleFile = path.join(srcDir, "liveDestinations.js");

if (!fs.existsSync(publicFile)) {
  throw new Error("Missing frontend/public/live-destinations.json");
}

const data = JSON.parse(fs.readFileSync(publicFile, "utf8"));
const countries = Array.isArray(data.countries) ? data.countries : [];

if (!countries.length) {
  throw new Error("live-destinations.json has no countries");
}

fs.writeFileSync(
  moduleFile,
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

function replaceAllLoadCatalogFunctions(source) {
  const replacement = `async function loadCatalog() {
    setLoadingCatalog(true);

    try {
      const normalized = normalizeCountries(LIVE_DESTINATIONS);
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

  let out = source;
  while (true) {
    const start = out.indexOf("async function loadCatalog()");
    if (start < 0) break;

    const brace = out.indexOf("{", start);
    let depth = 0;
    let end = -1;

    for (let i = brace; i < out.length; i++) {
      if (out[i] === "{") depth++;
      if (out[i] === "}") depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }

    if (end < 0) throw new Error("Could not parse loadCatalog");

    out = out.slice(0, start) + replacement + out.slice(end);
  }

  return out;
}

s = replaceAllLoadCatalogFunctions(s);

// remove visible city counts
s = s.replace(/\{c\.city\}\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{c.city}");
s = s.replace(/\{city\.city\}\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{city.city}");
s = s.replace(/\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");
s = s.replace(/\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");

fs.writeFileSync(appFile, s, "utf8");

console.log("Created:", moduleFile);
console.log("Patched:", appFile);
console.log("Countries embedded:", countries.length);
console.log("First:", countries[0].country, "-", countries[0].cities?.[0]?.city);
