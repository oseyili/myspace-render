const { supplierStatus } = require("../../config/suppliers");
function status() { return { ok: true, architecture: "modular-v2", timestamp: new Date().toISOString(), suppliers: supplierStatus() }; }
module.exports = { status };
