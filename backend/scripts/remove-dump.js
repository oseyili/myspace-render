const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// Remove the raw dump block
const dumpBlock = `
    if (hotels.length > 0 && !global.hotelbedsRawDump) {
      global.hotelbedsRawDump = true;
      console.log("[Hotelbeds RAW] First hotel full structure:");
      console.log(JSON.stringify(hotels[0], null, 2).slice(0, 3500));
      console.log("[Hotelbeds RAW] End of dump");
    }`;

if (code.indexOf("hotelbedsRawDump") >= 0) {
  code = code.replace(dumpBlock, "");
  // Also try the alternate form
  code = code.replace(/if \(hotels\.length > 0 && !global\.hotelbedsRawDump\) \{[\s\S]*?\}\n/g, "");
  fs.writeFileSync(p, code);
  console.log("SUCCESS: raw dump removed");
  console.log("New size:", code.length);
} else {
  console.log("Raw dump not found — already removed.");
}
