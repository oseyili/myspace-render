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

const found = [];

function walk(value, trail = []) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, [...trail, index]));
    return;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);

    const interestingKeys = keys.filter((k) =>
      /rate|room|book|token|hash|code|id|price|amount|board|cancel|policy|tax|fee|remark|package/i.test(k)
    );

    if (interestingKeys.length) {
      found.push({
        path: trail.join("."),
        keys: interestingKeys,
        sample: Object.fromEntries(
          interestingKeys.slice(0, 20).map((k) => [k, value[k]])
        )
      });
    }

    for (const [k, v] of Object.entries(value)) {
      walk(v, [...trail, k]);
    }
  }
}

walk(data);

console.log("Interesting objects found:", found.length);
console.log(JSON.stringify(found.slice(0, 30), null, 2));
