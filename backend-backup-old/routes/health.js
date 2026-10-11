const router = require("express").Router();
const health = require("../controllers/healthController");
router.get("/api/platform/v2/status", health.status);
router.get("/api/health", health.status);
router.get("/health", health.status);
module.exports = router;
