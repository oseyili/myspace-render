const fs = require("fs");
const p = "supplierFederation.js";
let code = fs.readFileSync(p, "utf8");

// Find the existing mapper price block. Use regex to be forgiving about whitespace.
const regex = /let minRate = null;[\s\S]*?if \(minRate\) break;[\s\S]*?\}\s*\}\s*\}/;

if (!regex.test(code)) {
  console.error("Mapper block not found");
  process.exit(1);
}

const newBlock = `let minRate = null;
    if (firstRoom) {
      const plans = Array.isArray(firstRoom.ratePlans) ? firstRoom.ratePlans : [];
      for (const plan of plans) {
        // Path 1: plan.prices.net.price
        const p1 = plan && plan.prices && plan.prices.net && (plan.prices.net.price || plan.prices.net.amount);
        // Path 2: plan.payment.chargeAmount.price
        const p2 = plan && plan.payment && plan.payment.chargeAmount && (plan.payment.chargeAmount.price || plan.payment.chargeAmount.amount);
        // Path 3: plan.payment.chargeAmount.search.price
        const p3 = plan && plan.payment && plan.payment.chargeAmount && plan.payment.chargeAmount.search && plan.payment.chargeAmount.search.price;
        // Path 4: Direct fields (for backward compat with Nice)
        const p4 = plan && (plan.net || plan.amount || plan.price || plan.total || plan.rate);
        const candidate = p1 || p2 || p3 || p4;
        if (candidate && Number(candidate) > 0) {
          minRate = Number(String(candidate).replace(/[^\\d.]/g, ""));
          break;
        }
      }
    }`;

code = code.replace(regex, newBlock);
fs.writeFileSync(p, code);
console.log("SUCCESS: mapper updated to read price from plan.prices.net.price");
console.log("New size:", code.length);
