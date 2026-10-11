const logger = require("../config/logger");
function errorHandler(err, req, res, next) {
  logger.error(err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, message: "MySpace backend error.", error: err.message });
}
module.exports = { errorHandler };
