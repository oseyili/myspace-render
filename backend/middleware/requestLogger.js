const logger = require("../config/logger");
function requestLogger(req, res, next) {
  const started = Date.now();
  res.on("finish", () => {
    if (req.originalUrl.startsWith("/api/platform/v2") || req.originalUrl === "/api/search") {
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
  next();
}
module.exports = { requestLogger };
