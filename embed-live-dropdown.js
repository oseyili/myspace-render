const fs = require("fs");

const appFile = "./frontend/src/App.jsx";
const publicDestFile = "./frontend/public/live-destinations.json";
const moduleFile = "./frontend/src/liveDestinations.js";

const data = JSON.parse(fs.readFileSync(publicDestFile, "utf8"));
const countries = Array.isArray(data.countries) ? data.countries : [];

if (!countries.length) {
  throw new Error("live-destinations.json has no countries. Rebuild public live files first.");
}

fs.writeFileSync(
  moduleFile,
  "export const LIVE_DESTINATIONS = " + JSON.stringify(countries, null, 2) + ";\n"
);

let s = fs.readFileSync(appFile, "utf8");

if (!s.includes('import { LIVE_DESTINATIONS } from "./liveDestinations";')) {
  s = s.replace(
    'import React, { useEffect, useMemo, useState } from "react";',
    'import React, { useEffect, useMemo, useState } from "react";\nimport { LIVE_DESTINATIONS } from "./liveDestinations";'
  );
}

function replaceFunctions(source, name, replacements) {
  let result = source;
  for (let n = replacements.length - 1; n >= 0; n--) {
    const starts = [];
    let index = 0;
    while (true) {
      const start = result.indexOf(`async function ${name}()`, index);
      if (start < 0) break;
      starts.push(start);
      index = start + 1;
    }

    if (!starts[n]) continue;

    const start = starts[n];
    const brace = result.indexOf("{", start);
    let depth = 0;

    for (let i = brace; i < result.length; i++) {
      if (result[i] === "{") depth++;
      if (result[i] === "}") depth--;
      if (depth === 0) {
        result = result.slice(0, start) + replacements[n] + result.slice(i + 1);
        break;
      }
    }
  }
  return result;
}

const travelLoadCatalog = `async function loadCatalog() {
    try {
      const normalized = normalizeCountries(LIVE_DESTINATIONS);
      setCatalog(normalized);

      const currentCountry = params.get("country") || "";
      const currentCity = params.get("city") || "";

      if (currentCountry && currentCity) {
        setCountry(currentCountry);
        setCity(currentCity);
        loadGuide(currentCountry, currentCity, area);
        return;
      }

      const firstCountry = normalized[0] || null;
      const firstCity = firstCountry?.cities?.[0]?.city || "";

      setCountry(firstCountry?.country || "");
      setCity(firstCity);
      setGuide(null);
      setMessage(firstCountry && firstCity ? "Available live-rate destinations are ready." : "No live-rate destinations are available right now.");
    } catch {
      setMessage("No live-rate destinations are available right now.");
    }
  }`;

const mainLoadCatalog = `async function loadCatalog() {
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

s = replaceFunctions(s, "loadCatalog", [travelLoadCatalog, mainLoadCatalog]);

s = s.replace(/\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");
s = s.replace(/\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");
s = s.replace(/\{x\.live_hotels\s*\?\s*`\s*\(\$\{x\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");

fs.writeFileSync(appFile, s);

console.log("Embedded live destinations:", countries.length);
console.log("First country:", countries[0].country);
console.log("First city:", countries[0].cities?.[0]?.city);
