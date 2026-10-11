const express = require("express");
const router = express.Router();

// Import all route modules
const adminRoutes = require("./admin");
const destinationRoutes = require("./destinations");
const experienceRoutes = require("./experiences");
const healthRoutes = require("./health");
const hotelRoutes = require("./hotels");
const transferRoutes = require("./transfers");

// Mount routes
router.use("/api/admin", adminRoutes);
router.use("/api/destinations", destinationRoutes);
router.use("/api/experiences", experienceRoutes);
router.use("/api/health", healthRoutes);
router.use("/api", hotelRoutes); // This handles /api/customer-global-hotels and /api/platform/v2/search
router.use("/api/transfers", transferRoutes);

module.exports = router;