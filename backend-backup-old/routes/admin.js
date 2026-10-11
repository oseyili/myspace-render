const router = require("express").Router();
const cache = require("../services/cache");
const hotelbeds = require("../services/suppliers/hotelbeds");

router.post("/api/platform/v2/admin/cache/clear", (req, res) => {
  cache.clear();
  res.json({ ok: true, message: "Platform v2 cache cleared." });
});

router.get("/api/platform/v2/suppliers/hotelbeds/status", (req, res) => {
  res.json(hotelbeds.status());
});

router.get("/api/platform/v2/suppliers/hotelbeds/search", async (req, res) => {
  const result = await hotelbeds.availabilitySearch(req.query || {});
  res.status(result.ok ? 200 : result.status || 400).json(result);
});

module.exports = router;
