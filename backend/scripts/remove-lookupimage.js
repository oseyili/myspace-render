const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// Find and remove the lookupImage block
const block = `  if (images.length === 0 && name) {
    const fallbackImage = lookupImage(name);
    if (fallbackImage) images.push(fallbackImage);
  }`;

const blockAlt = `if (images.length === 0 && name) {
    const fallbackImage = lookupImage(name);
    if (fallbackImage) images.push(fallbackImage);
  }`;

let removed = 0;
if (code.indexOf(block) >= 0) {
  code = code.replace(block, "  // Image lookup disabled (lookupImage not yet defined)");
  removed++;
} else if (code.indexOf(blockAlt) >= 0) {
  code = code.replace(blockAlt, "  // Image lookup disabled (lookupImage not yet defined)");
  removed++;
}

if (removed === 0) {
  console.log("Could not find the lookupImage block — let me try a regex approach.");
  code = code.replace(/if \(images\.length === 0 && name\) \{[\s\S]*?\}/, "// Image lookup disabled");
  removed = 1;
}

fs.writeFileSync(p, code);
console.log("Removed", removed, "lookupImage block(s)");
console.log("New size:", fs.statSync(p).size);
