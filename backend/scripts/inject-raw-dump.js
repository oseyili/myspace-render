const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

if (code.indexOf("hotelbedsRawDump") >= 0) {
  console.log("Already added.");
  process.exit(0);
}

const snippet = fs.readFileSync("scripts/raw-dump-snippet.txt", "utf8");

// Try both forms of the anchor
let anchor = "const hotels = Array.isArray(data.hotels.hotels) ? data.hotels.hotels : [];";
let anchorIdx = code.indexOf(anchor);
if (anchorIdx < 0) {
  anchor = "const hotels = Array.isArray(data?.hotels?.hotels) ? data.hotels.hotels : [];";
  anchorIdx = code.indexOf(anchor);
}
if (anchorIdx < 0) {
  console.error("Anchor not found");
  process.exit(1);
}

const afterAnchor = anchorIdx + anchor.length;
const result = code.slice(0, afterAnchor) + "\n" + snippet + "\n" + code.slice(afterAnchor);

fs.writeFileSync(p, result);
console.log("SUCCESS: raw dump added");
console.log("New size:", result.length);
