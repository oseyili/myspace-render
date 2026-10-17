const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// Find the mapper block we inserted earlier
const oldMapper = `const minRate = firstRoom && firstRoom.rates && firstRoom.rates[0]
      ? (firstRoom.rates[0].net || firstRoom.rates[0].amount || firstRoom.rates[0].price)
      : null;`;

const newMapper = `// Prices can come from either rates[] OR ratePlans[]
    let minRate = null;
    if (firstRoom) {
      const rateSources = [
        ...(Array.isArray(firstRoom.rates) ? firstRoom.rates : []),
        ...(Array.isArray(firstRoom.ratePlans) ? firstRoom.ratePlans : []),
        ...(Array.isArray(firstRoom.rates?.rates) ? firstRoom.rates.rates : [])
      ];
      for (const r of rateSources) {
        const candidate = r && (r.net || r.amount || r.price || r.total || r.rate || r.totalAmount);
        if (candidate && Number(candidate) > 0) {
          minRate = Number(String(candidate).replace(/[^\\d.]/g, ""));
          break;
        }
      }
    }`;

if (code.indexOf("firstRoom.rates && firstRoom.rates[0]") < 0) {
  console.error("Old mapper line not found");
  process.exit(1);
}

code = code.replace(oldMapper, newMapper);
fs.writeFileSync(p, code);
console.log("SUCCESS: mapper now reads ratePlans");
console.log("New size:", code.length);
