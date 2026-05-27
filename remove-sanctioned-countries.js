const fs = require("fs");

const file = "backend/server.js";
let s = fs.readFileSync(file, "utf8");

const blocked = `
const SANCTIONED_COUNTRY_NAMES = new Set([
  "Afghanistan",
  "Belarus",
  "Burundi",
  "Central African Republic",
  "Chad",
  "Congo Republic",
  "Cuba",
  "Democratic Republic of the Congo",
  "Eritrea",
  "Iraq",
  "Iran",
  "Libya",
  "Myanmar",
  "North Korea",
  "Somalia",
  "South Sudan",
  "Sudan",
  "Syria",
  "Russia",
  "Venezuela",
  "Yemen"
]);

function isSanctionedCountryName(country) {
  return SANCTIONED_COUNTRY_NAMES.has(clean(country));
}
`;

if (!s.includes("SANCTIONED_COUNTRY_NAMES")) {
  s = s.replace("let destinationsCacheLoadedAt = 0;", "let destinationsCacheLoadedAt = 0;\n" + blocked);
}

s = s.replace(
  /for \(const h of getHotelsLazy\(\)\) \{\s*const country = clean\(h\.country\);\s*const city = clean\(h\.city\);/m,
  `for (const h of getHotelsLazy()) {
    const country = clean(h.country);
    const city = clean(h.city);

    if (isSanctionedCountryName(country)) continue;`
);

s = s.replace(
  /\.filter\(\(h\) => clean\(h\.country\) === clean\(country\) && clean\(h\.city\) === clean\(city\)\)/g,
  `.filter((h) => !isSanctionedCountryName(h.country) && clean(h.country) === clean(country) && clean(h.city) === clean(city))`
);

fs.writeFileSync(file, s, "utf8");
console.log("Sanctioned countries removed from backend dropdown/search results.");
