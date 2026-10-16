const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

const newFn = fs.readFileSync("scripts/new-hyperguest-fetch.txt", "utf8").trim();

const start = code.indexOf("async function fetchHyperGuestInventory(params) {");
const end = code.indexOf("async function federatedHotelSearch");

if (start < 0 || end < 0) {
  console.error("Could not find markers. start:", start, "end:", end);
  process.exit(1);
}

const result = code.slice(0, start) + newFn + "\n\n" + code.slice(end);
fs.writeFileSync(p, result);

console.log("SUCCESS: fetchHyperGuestInventory replaced");
console.log("Old size:", code.length);
console.log("New size:", result.length);
