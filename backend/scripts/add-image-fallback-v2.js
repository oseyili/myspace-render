const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

if (code.indexOf("fallbackImage = lookupImage") >= 0) {
  console.log("lookupImage call already present. Nothing to fix.");
  process.exit(0);
}

// Find the images array construction
const marker = "].map(normalizeImage).filter(Boolean);";
const idx = code.indexOf(marker);
if (idx < 0) {
  console.error("Images marker not found");
  process.exit(1);
}

const afterMarker = idx + marker.length;
const fallbackBlock = `

  // Fallback: attach image from the local index if the supplier didn't provide one
  if (images.length === 0 && name) {
    const fallbackImage = lookupImage(name);
    if (fallbackImage) images.push(fallbackImage);
  }`;

const result = code.slice(0, afterMarker) + fallbackBlock + code.slice(afterMarker);
fs.writeFileSync(p, result);
console.log("SUCCESS: image fallback added to normalizeSupplierHotel");
console.log("Old size:", code.length);
console.log("New size:", result.length);
