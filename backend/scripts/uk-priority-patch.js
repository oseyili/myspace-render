const fs = require("fs");
const p = "scripts/fetch-hotelbeds-content.js";
let code = fs.readFileSync(p, "utf8");

const ukCities = ["LON", "BHX", "MAN", "EDI", "GLA", "BRS", "NCL", "LPL", "CWL", "BFS", "DUB", "SOU", "NQT", "YOR", "BTH", "OXF", "CBG", "LBA", "NWI", "IPW", "XRE", "CVT", "STK", "DER", "HUL", "MME", "SUN", "CAX", "BLK", "PRE", "CEG", "GLO", "SWI", "SAL", "WNE", "DOV", "HAS", "ESB", "IOW", "ABZ", "DND", "INV", "LDY", "NRY", "SWS", "NWP", "WRE", "BGR", "LLD", "ABE", "ORK", "CORK", "BFS", "GAL", "KIR", "WAT", "LMK", "GWY", "JER", "GCI", "IOM"];

const regex = /const PRIORITY_CITIES = \[[\s\S]*?\];/;
if (!regex.test(code)) {
  console.error("Could not find PRIORITY_CITIES array");
  process.exit(1);
}

const newArray = "const PRIORITY_CITIES = " + JSON.stringify(ukCities);
code = code.replace(regex, newArray);
fs.writeFileSync(p, code);
console.log("SUCCESS: UK cities prioritized");
console.log("New size:", code.length);
console.log("First 10 cities in list:", ukCities.slice(0, 10).join(", "));
