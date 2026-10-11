const router = require("express").Router();
const destinations = require("../controllers/destinationController");
router.get("/api/platform/v2/destinations", destinations.list);
module.exports = router;
