const fs = require("fs");
const p = "scripts/fetch-hotelbeds-content.js";
let code = fs.readFileSync(p, "utf8");

// Reduce MAX_CALLS from 45 to 8
if (code.indexOf("const MAX_CALLS = 45;") >= 0) {
  code = code.replace("const MAX_CALLS = 45;", "const MAX_CALLS = 8;");
  fs.writeFileSync(p, code);
  console.log("SUCCESS: MAX_CALLS reduced from 45 to 8");
} else if (code.indexOf("const MAX_CALLS = 8;") >= 0) {
  console.log("Already set to 8");
} else {
  console.error("Could not find MAX_CALLS = 45");
  process.exit(1);
}
