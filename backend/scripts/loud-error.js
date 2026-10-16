const fs = require("fs");
const p = "backend/server.js";
let code = fs.readFileSync(p, "utf8");

// Find the catch block for the federation route
const oldCatch = `} catch (e) {
  console.error("[ROUTE ERROR] Could not register federated search:", e.message);
}`;

const newCatch = `} catch (e) {
  console.error("============================================");
  console.error("[ROUTE ERROR] FEDERATED SEARCH FAILED");
  console.error("[ROUTE ERROR] Message:", e.message);
  console.error("[ROUTE ERROR] Name:", e.name);
  console.error("[ROUTE ERROR] Stack:", e.stack);
  console.error("============================================");
}`;

if (code.indexOf(oldCatch) < 0) {
  console.error("Old catch block not found. Aborting.");
  process.exit(1);
}

code = code.replace(oldCatch, newCatch);
fs.writeFileSync(p, code);
console.log("SUCCESS: federation catch block updated to print full error");
console.log("New size:", fs.statSync(p).size);
