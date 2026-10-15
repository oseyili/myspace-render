const fs = require("fs");
const p = "supplierFederation.js";
const lines = fs.readFileSync(p, "utf8").split("\n");

// Find the broken line: the "}" on its own line right before "async function fetchRateHawkInventory"
let brokenIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === "}" && lines[i + 2] && lines[i + 2].includes("async function fetchRateHawkInventory")) {
    brokenIdx = i;
    break;
  }
}

if (brokenIdx < 0) {
  console.error("Could not find the broken spot.");
  process.exit(1);
}

// Replace the lone "}" with the missing catch block + return
const replacement = [
  "  } catch (e) {",
  '    console.error("[Hotelbeds] Fetch failed:", e.message);',
  "    return [];",
  "  }",
  "}",
];

const newLines = [
  ...lines.slice(0, brokenIdx),
  ...replacement,
  ...lines.slice(brokenIdx + 1),
];

fs.writeFileSync(p, newLines.join("\n"));
console.log("SUCCESS: catch block restored at line", brokenIdx + 1);
console.log("New size:", fs.statSync(p).size);
