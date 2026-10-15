const fs = require("fs");
const p = "supplierFederation.js";
const lines = fs.readFileSync(p, "utf8").split("\n");

// Find all lines with the duplicate declaration
const dupIndices = [];
lines.forEach((line, i) => {
  if (line.includes("const hotels = Array.isArray")) dupIndices.push(i);
});

if (dupIndices.length < 2) {
  console.log("Only", dupIndices.length, "occurrence(s) — nothing to remove.");
  process.exit(0);
}

// Remove all but the first
for (let k = dupIndices.length - 1; k >= 1; k--) {
  lines.splice(dupIndices[k], 1);
}

fs.writeFileSync(p, lines.join("\n"));
console.log("Removed", dupIndices.length - 1, "duplicate(s)");
console.log("New size:", fs.statSync(p).size);
