import { v4 as uuid } from "uuid";
import { readRooms, writeRooms } from "../data/store.js";

export async function getRoomsByHotel(req, res) {
  const { hotelId } = req.params;
  const rooms = await readRooms();
  res.json(rooms.filter((r) => r.hotelId === hotelId));
}

export async function createRoom(req, res) {
  const { hotelId, roomNumber, roomType, price } = req.body || {};

  if (!hotelId || !roomNumber) {
    return res.status(400).json({ message: "hotelId and roomNumber are required" });
  }

  const rooms = await readRooms();

  const room = {
    id: uuid(),
    hotelId: String(hotelId),
    roomNumber: String(roomNumber),
    roomType: roomType ? String(roomType) : "",
    price: typeof price === "number" ? price : null,
    createdAt: new Date().toISOString()
  };

  rooms.push(room);
  await writeRooms(rooms);

  res.status(201).json(room);
}
