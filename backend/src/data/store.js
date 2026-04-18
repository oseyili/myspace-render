import fs from "fs/promises";

const FILE = new URL("../../rooms.json", import.meta.url);

export async function readRooms() {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function writeRooms(rooms) {
  await fs.writeFile(FILE, JSON.stringify(rooms, null, 2), "utf8");
}
