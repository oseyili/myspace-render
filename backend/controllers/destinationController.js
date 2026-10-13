const { callLegacy } = require("../services/suppliers/legacy/bridge");
async function list(req, res, next) { try { const r = await callLegacy("/api/destinations", req.query); res.status(r.status || 200).json(r.data); } catch (err) { next(err); } }
module.exports = { list };
