const fs = require("fs");
const p = "scripts/fetch-hotelbeds-content.js";
let code = fs.readFileSync(p, "utf8");

// Replace the save-after-every-city logic with save-after-every-hotel
const oldSave = `      // Save after every destination
      fs.writeFileSync(outPath, JSON.stringify(cache, null, 0));
      const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
      console.log("  Saved. Total cached: " + Object.keys(cache).length + " hotels (" + sizeMB + " MB)");`;

const newSave = `      // Save after every destination (compact mode)
      fs.writeFileSync(outPath, JSON.stringify(cache));
      const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
      console.log("  Saved. Total cached: " + Object.keys(cache).length + " hotels (" + sizeMB + " MB)");`;

if (code.indexOf(oldSave) < 0) {
  console.error("Old save block not found");
  process.exit(1);
}

code = code.replace(oldSave, newSave);
fs.writeFileSync(p, code);
console.log("SUCCESS: save behavior updated");
