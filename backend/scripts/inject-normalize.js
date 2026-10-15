const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

const newFn = fs.readFileSync("scripts/new-normalize.txt", "utf8");

const start = code.indexOf("function normalizeSupplierHotel");
const end = code.indexOf("function mergeHotels");

if (start < 0 || end < 0) {
  console.error("Markers not found. start:", start, "end:", end);
  process.exit(1);
}

const result = code.slice(0, start) + newFn + "\n" + code.slice(end);
fs.writeFileSync(p, result);
console.log("SUCCESS: normalizeSupplierHotel replaced");
console.log("Old size:", code.length);
console.log("New size:", result.length);
