const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "data",
  "hyperguest-certification",
  "working-search-response-test-1.json"
);

const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const data = raw.response;

const rows = [];

function walk(value, trail = []) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, [...trail, index]));
    return;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);

    const hasBookingKey = keys.some((k) =>
      /book|token|hash|rateKey|rateId|roomId|roomCode|rateCode|ratePlan|code|id/i.test(k)
    );

    const hasPrice = JSON.stringify(value).match(/"price"|"amount"|"currency"|"net"|"sell"|"bar"/i);

    if (hasBookingKey && hasPrice) {
      rows.push({
        path: trail.join("."),
        keys,
        object: value
      });
    }

    for (const [k, v] of Object.entries(value)) {
      walk(v, [...trail, k]);
    }
  }
}

walk(data);

console.log("Candidate bookable objects:", rows.length);

rows.slice(0, 10).forEach((row, i) => {
  console.log("====================================");
  console.log("CANDIDATE:", i + 1);
  console.log("PATH:", row.path);
  console.log("KEYS:", row.keys.join(", "));
  console.log(JSON.stringify(row.object, null, 2).slice(0, 4000));
});
