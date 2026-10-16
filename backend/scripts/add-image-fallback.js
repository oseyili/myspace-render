const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// Find the images array construction and add fallback after it
const marker = '].map(normalizeImage).filter(Boolean);';
const idx = code.indexOf(marker);
if (idx < 0) {
  console.error("Images marker not found");
  process.exit(1);
}

if (code.indexOf("lookupImage(name)") >= 0) {
  console.log("Fallback already present, nothing to do");
  process.exit(0);
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
console.log("Step 2 done. Added image fallback");
console.log("New size:", result.length);
