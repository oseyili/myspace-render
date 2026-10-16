const fs = require("fs");
const p = "scripts/fetch-hotelbeds-content.js";
let code = fs.readFileSync(p, "utf8");

// 1. Add a helper that checks if a destination is already cached
const helperMarker = "const PRIORITY_CITIES = ";
const helperCode = `function isDestinationCached(destinationCode, cache) {
  // Check if we already have hotels for this destination
  for (const code of Object.keys(cache)) {
    if (cache[code] && cache[code].destinationCode === destinationCode) {
      return true;
    }
  }
  return false;
}

`;

if (code.indexOf("isDestinationCached") < 0) {
  const idx = code.indexOf(helperMarker);
  if (idx < 0) {
    console.error("PRIORITY_CITIES not found");
    process.exit(1);
  }
  code = code.slice(0, idx) + helperCode + code.slice(idx);
  console.log("Added isDestinationCached helper");
}

// 2. Replace the main loop condition to skip cached destinations
const oldLoop = `for (const destinationCode of PRIORITY_CITIES) {
    if (callsMade >= MAX_CALLS) {
      console.log("\\nHit " + MAX_CALLS + " call limit. Stopping. Run again tomorrow.");
      break;
    }`;

const newLoop = `// Sort PRIORITY_CITIES: uncached first, cached last (so we prioritize fresh cities)
    const sortedCities = [...PRIORITY_CITIES].sort((a, b) => {
      const aCached = isDestinationCached(a, cache) ? 1 : 0;
      const bCached = isDestinationCached(b, cache) ? 1 : 0;
      return aCached - bCached;
    });

    for (const destinationCode of sortedCities) {
      if (callsMade >= MAX_CALLS) {
        console.log("\\nHit " + MAX_CALLS + " call limit. Stopping. Run again tomorrow.");
        break;
      }

      if (isDestinationCached(destinationCode, cache)) {
        console.log("\\n>>> Skipping " + destinationCode + " (already cached)");
        continue;
      }`;

if (code.indexOf(oldLoop) < 0) {
  console.error("Main loop not found");
  process.exit(1);
}

code = code.replace(oldLoop, newLoop);
fs.writeFileSync(p, code);
console.log("SUCCESS: smart caching patched");
console.log("New size:", code.length);
