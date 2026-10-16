const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// Check if fs is required at top
const topRequires = code.slice(0, 500);
if (topRequires.indexOf('require("fs")') >= 0 && topRequires.indexOf('require("path")') >= 0) {
  console.log("fs and path already required at top. Nothing to fix.");
  process.exit(0);
}

// Add fs and path requires at the top
const oldTop = 'const { URLSearchParams } = require("url");';
const newTop = 'const { URLSearchParams } = require("url");\nconst fs = require("fs");\nconst path = require("path");';

if (code.indexOf(oldTop) < 0) {
  console.error("Top marker not found");
  process.exit(1);
}

code = code.replace(oldTop, newTop);

// Also remove the duplicate inline requires in the image loader
code = code.replace(/\nconst path = require\("path"\);\nlet hotelImagesIndex/g, "\nlet hotelImagesIndex");

fs.writeFileSync(p, code);
console.log("SUCCESS: Added fs and path to top requires");
console.log("New size:", code.length);
