const assert = require("assert");
assert.ok(require("../services/search/searchOrchestrator").searchHotels);
assert.ok(require("../services/suppliers").length === 4);
console.log("Modular v2 smoke test passed");
