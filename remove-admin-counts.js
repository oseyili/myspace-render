const fs = require("fs");

const file = "./frontend/src/App.jsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
/\{city\.city\}\s*\(\{city\.live_hotels\}\)/g,
'{city.city}'
);

s = s.replace(
/\{x\.city\}\s*\(\{x\.live_hotels\}\)/g,
'{x.city}'
);

s = s.replace(
/\{item\.city\}\s*\(\{item\.live_hotels\}\)/g,
'{item.city}'
);

fs.writeFileSync(file, s);

console.log("Removed admin live-rate counts from customer dropdowns.");
