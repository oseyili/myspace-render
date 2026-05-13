const fs = require("fs");

const file = "./frontend/src/App.jsx";
let s = fs.readFileSync(file, "utf8");

// Remove city admin counts from dropdown labels like:
// {c.city}{c.live_hotels ? ` (${c.live_hotels})` : ""}
s = s.replace(/\{c\.city\}\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{c.city}");
s = s.replace(/\{city\.city\}\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{city.city}");
s = s.replace(/\{x\.city\}\{x\.live_hotels\s*\?\s*`\s*\(\$\{x\.live_hotels\}\)\s*`\s*:\s*""\}/g, "{x.city}");

// Fallback simple cleanup for visible JSX patterns
s = s.replace(/\{c\.live_hotels\s*\?\s*`\s*\(\$\{c\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");
s = s.replace(/\{city\.live_hotels\s*\?\s*`\s*\(\$\{city\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");
s = s.replace(/\{x\.live_hotels\s*\?\s*`\s*\(\$\{x\.live_hotels\}\)\s*`\s*:\s*""\}/g, "");

// Remove any already-rendered style wording from source
s = s.replace(/\s*\(\{c\.live_hotels\}\)/g, "");
s = s.replace(/\s*\(\{city\.live_hotels\}\)/g, "");
s = s.replace(/\s*\(\{x\.live_hotels\}\)/g, "");

fs.writeFileSync(file, s);
console.log("Removed customer-facing city count labels.");
