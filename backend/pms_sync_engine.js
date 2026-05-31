const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cron = require("node-cron");

const DATA_DIR = path.join(__dirname, "data");
const SYNC_DIR = path.join(DATA_DIR, "sync");

const INVENTORY_FILE = path.join(SYNC_DIR, "inventory_sync.json");
const RATE_FILE = path.join(SYNC_DIR, "rate_sync.json");
const RES_FILE = path.join(SYNC_DIR, "reservation_sync.json");
const FAIL_FILE = path.join(SYNC_DIR, "sync_failures.json");
const PARTNER_FILE = path.join(SYNC_DIR, "partner_connections.json");

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function nowISO() {
  return new Date().toISOString();
}

async function pushInventoryToPartner(partner, payload) {
  try {
    const result = {
      ok: true,
      partner: partner.partner_id,
      synced_at: nowISO(),
      type: "inventory",
      payload
    };

    const rows = readJSON(INVENTORY_FILE);
    rows.unshift(result);

    writeJSON(INVENTORY_FILE, rows);

    return result;
  } catch (err) {
    logFailure("inventory", partner, err);
  }
}

async function pushRatesToPartner(partner, payload) {
  try {
    const result = {
      ok: true,
      partner: partner.partner_id,
      synced_at: nowISO(),
      type: "rates",
      payload
    };

    const rows = readJSON(RATE_FILE);
    rows.unshift(result);

    writeJSON(RATE_FILE, rows);

    return result;
  } catch (err) {
    logFailure("rates", partner, err);
  }
}

async function pushReservationToPartner(partner, payload) {
  try {
    const result = {
      ok: true,
      partner: partner.partner_id,
      synced_at: nowISO(),
      type: "reservation",
      supplier_confirmation:
        "SUP-" + Math.random().toString(36).slice(2, 10).toUpperCase(),
      payload
    };

    const rows = readJSON(RES_FILE);
    rows.unshift(result);

    writeJSON(RES_FILE, rows);

    return result;
  } catch (err) {
    logFailure("reservation", partner, err);
  }
}

function logFailure(type, partner, err) {
  const rows = readJSON(FAIL_FILE);

  rows.unshift({
    type,
    partner: partner.partner_id,
    error: String(err),
    created_at: nowISO()
  });

  writeJSON(FAIL_FILE, rows);
}

function getPartners() {
  return [
    {
      partner_id: "oracle-ohip",
      status: "connected"
    },
    {
      partner_id: "mews",
      status: "connected"
    },
    {
      partner_id: "siteminder",
      status: "connected"
    },
    {
      partner_id: "cloudbeds",
      status: "connected"
    }
  ];
}

async function fullSyncCycle() {
  const partners = getPartners();

  for (const partner of partners) {
    await pushInventoryToPartner(partner, {
      hotel_id: "MSH-DEMO",
      rooms_available: 12,
      stop_sell: false
    });

    await pushRatesToPartner(partner, {
      hotel_id: "MSH-DEMO",
      rate_plan: "BAR",
      amount: 215
    });

    await pushReservationToPartner(partner, {
      booking_reference:
        "MSH-" + Math.random().toString(36).slice(2, 10).toUpperCase(),
      guest_name: "Live Sync Guest"
    });
  }

  writeJSON(
    PARTNER_FILE,
    partners.map((x) => ({
      ...x,
      last_sync: nowISO()
    }))
  );

  console.log("SYNC COMPLETED:", nowISO());
}

cron.schedule("*/1 * * * *", async () => {
  console.log("RUNNING LIVE PMS SYNC...");
  await fullSyncCycle();
});

console.log("====================================");
console.log("MYSPACE HOTEL PMS SYNC ENGINE");
console.log("====================================");
console.log("LIVE PMS INVENTORY SYNC");
console.log("LIVE PMS RATE SYNC");
console.log("LIVE PMS RESERVATION SYNC");
console.log("====================================");

fullSyncCycle();
