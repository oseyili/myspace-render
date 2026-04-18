import express from "express";
import { createRoom, getRoomsByHotel } from "../controllers/roomController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/", protect, createRoom);
router.get("/:hotelId", getRoomsByHotel);

export default router;
