const fs = require("fs");

const file = "./frontend/src/App.jsx";

let s = fs.readFileSync(file, "utf8");

s = s.split('const API_BASE = "http://127.0.0.1:5050";').join(
'const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL || window.location.origin;'
);

s = s.split("Backend unavailable. Restart backend and frontend.").join(
"Please choose an available live-rate destination and search again."
);

s = s.split("Could not load destination catalogue.").join(
"Available live-rate destinations are loading."
);

s = s.split("Live destinations are updating. Please refresh shortly.").join(
"Available live-rate destinations are loading."
);

fs.writeFileSync(file, s);

console.log("Render production API patch applied.");
