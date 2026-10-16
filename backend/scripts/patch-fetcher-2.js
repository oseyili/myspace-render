const fs = require("fs");
const p = "scripts/fetch-hotelbeds-content.js";
const lines = fs.readFileSync(p, "utf8").split("\n");

// Find the line that has JSON.stringify(cache, null, 0)
let targetIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("JSON.stringify(cache, null, 0)")) {
    targetIdx = i;
    break;
  }
}

if (targetIdx < 0) {
  console.error("Could not find the writeFileSync line");
  process.exit(1);
}

console.log("Found at line " + (targetIdx + 1) + ":");
console.log("  OLD: " + lines[targetIdx]);

// Replace with compact version
lines[targetIdx] = lines[targetIdx].replace("JSON.stringify(cache, null, 0)", "JSON.stringify(cache)");

console.log("  NEW: " + lines[targetIdx]);

fs.writeFileSync(p, lines.join("\n"));
console.log("SUCCESS: save compacted");
console.log("New file size:", fs.statSync(p).size);
