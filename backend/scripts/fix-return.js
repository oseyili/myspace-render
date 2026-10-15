const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// Check if the return is missing
if (code.indexOf("Returned ${hotels.length} hotels") >= 0) {
  console.log("Already present — nothing to fix.");
  process.exit(0);
}

// Find the [HB-RAW-RESP] logger line — that's the last line before the deleted block
const marker = 'console.log("[HB-RAW-RESP] hotels field:", JSON.stringify(data?.hotels).slice(0, 500));';
const idx = code.indexOf(marker);
if (idx < 0) {
  console.error("Could not find the marker line.");
  process.exit(1);
}

const insertAfter = idx + marker.length;

const fix = [
  "",
  "      const hotels = Array.isArray(data?.hotels?.hotels) ? data.hotels.hotels : [];",
  "      console.log(`[Hotelbeds] Returned ${hotels.length} hotels for ${destinationCode}`);",
  "      return hotels;",
].join("\n");

const result = code.slice(0, insertAfter) + fix + code.slice(insertAfter);
fs.writeFileSync(p, result);
console.log("SUCCESS: return hotels; restored");
console.log("Old size:", code.length);
console.log("New size:", result.length);
