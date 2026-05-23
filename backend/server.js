const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Redis = require("ioredis");
const { Pool } = require("pg");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");

const app = express();

const PORT = process.env.PORT || 5050;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "MSH_ENTERPRISE_JWT_SECRET";

const REDIS_URL =
  process.env.REDIS_URL ||
  "redis://127.0.0.1:6379";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5432/myspacehotel";

let redis = null;

try {
  redis = process.env.REDIS_URL ? new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false }) : null;
  if (redis) { redis.on("error", () => {}); redis.connect().then(() => console.log("REDIS: CONNECTED")).catch(() => { redis = null; console.log("REDIS: OFFLINE - using file cache"); }); } else { console.log("REDIS: OFFLINE - using file cache"); }
} catch {
  console.log("REDIS: OFFLINE");
}

let pg = null;

try {
  pg = new Pool({
    connectionString: DATABASE_URL,
  });

  console.log("POSTGRESQL: READY");
} catch {
  console.log("POSTGRESQL: OFFLINE");
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
});

app.use("/api/", apiLimiter);

const DATA_DIR = path.join(__dirname, "data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const BOOKINGS_FILE = path.join(DATA_DIR, "bookings.json");
const WEBHOOK_FILE = path.join(DATA_DIR, "webhook_events.json");
const AUDIT_FILE = path.join(DATA_DIR, "partner_audit_log.json");
const HOTELS_FILE = path.join(DATA_DIR, "live_hotels.json");
const PARTNERS_FILE = path.join(DATA_DIR, "partners.json");
const RETRY_FILE = path.join(DATA_DIR, "webhook_retry_queue.json");
const FAILOVER_FILE = path.join(DATA_DIR, "supplier_failover.json");
const RECOVERY_FILE = path.join(DATA_DIR, "booking_recovery.json");
const MAPPINGS_FILE = path.join(DATA_DIR, "pms_mappings.json");

function ensureFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
  }
}

ensureFile(BOOKINGS_FILE, []);
ensureFile(WEBHOOK_FILE, []);
ensureFile(AUDIT_FILE, []);
ensureFile(RETRY_FILE, []);
ensureFile(FAILOVER_FILE, []);
ensureFile(RECOVERY_FILE, []);
ensureFile(MAPPINGS_FILE, []);
ensureFile(PARTNERS_FILE, [
  {
    partner_id: "oracle-ohip",
    token: "MSH_ENTERPRISE_TOKEN_001",
    webhook_secret: "MSH_WEBHOOK_SECRET_001",
    enabled: true,
  },
]);

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

function getHotels() {
  return fs.existsSync(HOTELS_FILE)
    ? readJSON(HOTELS_FILE)
    : [];
}

function bookingCode() {
  return (
    "MSH-" +
    Math.random().toString(36).substring(2, 8).toUpperCase() +
    "-" +
    Date.now().toString().slice(-5)
  );
}

function audit(event, payload = {}) {
  const logs = readJSON(AUDIT_FILE);

  logs.unshift({
    id: uuidv4(),
    event,
    created_at: nowISO(),
    payload,
  });

  writeJSON(AUDIT_FILE, logs.slice(0, 15000));
}

function webhookEvent(event, payload = {}) {
  const logs = readJSON(WEBHOOK_FILE);

  logs.unshift({
    id: uuidv4(),
    event,
    created_at: nowISO(),
    payload,
  });

  writeJSON(WEBHOOK_FILE, logs.slice(0, 15000));
}

function createJWT(partner) {
  return jwt.sign(
    {
      partner_id: partner.partner_id,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}

function authMiddleware(req, res, next) {
  const auth =
    req.headers.authorization || "";

  const token = auth.replace(
    "Bearer ",
    ""
  );

  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    req.partner = decoded;

    next();
  } catch {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }
}

function verifyWebhookSignature(req, secret) {
  const signature =
    req.headers["x-webhook-signature"];

  if (!signature) return false;

  const body = JSON.stringify(req.body);

  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  return signature === expected;
}

async function queueWebhookRetry(row) {
  const queue = readJSON(RETRY_FILE);

  queue.unshift({
    id: uuidv4(),
    retry_count: 0,
    next_retry_at: nowISO(),
    ...row,
  });

  writeJSON(RETRY_FILE, queue);
}

async function simulateStripeCapture(
  booking
) {
  return {
    payment_intent:
      "pi_" +
      Math.random()
        .toString(36)
        .slice(2),
    payment_status: "CAPTURED",
    amount:
      booking.total_amount || 0,
  };
}

async function pollSupplier(
  booking
) {
  return {
    supplier_reference:
      "SUP-" +
      Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase(),
    supplier_status:
      "CONFIRMED",
  };
}

const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title:
      "MySpace Hotel Enterprise API",
    version: "3.0.0",
  },
};

app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument)
);

app.get("/", (_, res) => {
  res.json({
    ok: true,
    service:
      "MySpace Hotel Enterprise API V3",
    hotels: getHotels().length,
    timestamp: nowISO(),
  });
});

app.post("/api/auth/login", (req, res) => {
  const {
    partner_id,
    token,
  } = req.body || {};

  const partners =
    readJSON(PARTNERS_FILE);

  const partner = partners.find(
    (x) =>
      x.partner_id === partner_id &&
      x.token === token
  );

  if (!partner) {
    return res.status(401).json({
      ok: false,
      error: "Invalid credentials",
    });
  }

  const jwtToken =
    createJWT(partner);

  audit("auth.login", {
    partner_id,
  });

  res.json({
    ok: true,
    jwt: jwtToken,
  });
});

app.get(
  "/api/hotels",
  authMiddleware,
  async (_, res) => {
    const hotels = getHotels();

    if (redis) {
      await redis.set(
        "msh:hotel_count",
        String(hotels.length)
      );
    }

    res.json({
      ok: true,
      total: hotels.length,
      hotels: hotels.slice(0, 1000),
    });
  }
);

app.post(
  "/api/reservations",
  authMiddleware,
  async (req, res) => {
    const body = req.body || {};

    const bookings =
      readJSON(BOOKINGS_FILE);

    const booking = {
      booking_reference:
        bookingCode(),
      created_at: nowISO(),
      status: "CONFIRMED",
      supplier_status:
        "PENDING_CONFIRMATION",
      payment_status:
        "PENDING_CAPTURE",
      polling_status: "ACTIVE",
      partner_id:
        req.partner.partner_id,
      hotel_id:
        body.hotel_id || null,
      customer:
        body.customer || {},
      total_amount:
        body.total_amount || 0,
      currency:
        body.currency || "GBP",
    };

    const stripe =
      await simulateStripeCapture(
        booking
      );

    booking.payment_status =
      stripe.payment_status;

    booking.payment_intent =
      stripe.payment_intent;

    const supplier =
      await pollSupplier(
        booking
      );

    booking.supplier_reference =
      supplier.supplier_reference;

    booking.supplier_status =
      supplier.supplier_status;

    bookings.unshift(booking);

    writeJSON(
      BOOKINGS_FILE,
      bookings
    );

    webhookEvent(
      "reservation.created",
      booking
    );

    audit(
      "reservation.created",
      booking
    );

    res.json({
      ok: true,
      booking,
    });
  }
);

app.get(
  "/api/reservations/:code/status",
  authMiddleware,
  (req, res) => {
    const bookings =
      readJSON(BOOKINGS_FILE);

    const booking = bookings.find(
      (x) =>
        x.booking_reference ===
        req.params.code
    );

    if (!booking) {
      return res.status(404).json({
        ok: false,
        error:
          "Booking not found",
      });
    }

    res.json({
      ok: true,
      booking_reference:
        booking.booking_reference,
      booking_status:
        booking.status,
      supplier_status:
        booking.supplier_status,
      payment_status:
        booking.payment_status,
      polling_status:
        booking.polling_status,
      timestamp: nowISO(),
    });
  }
);

app.post(
  "/api/webhooks/:partner",
  async (req, res) => {
    const partners =
      readJSON(PARTNERS_FILE);

    const partner = partners.find(
      (x) =>
        x.partner_id ===
        req.params.partner
    );

    if (!partner) {
      return res.status(404).json({
        ok: false,
        error:
          "Partner not found",
      });
    }

    const valid =
      verifyWebhookSignature(
        req,
        partner.webhook_secret
      );

    if (!valid) {
      await queueWebhookRetry({
        partner:
          partner.partner_id,
        reason:
          "INVALID_SIGNATURE",
        payload: req.body,
      });

      return res.status(401).json({
        ok: false,
        error:
          "Invalid webhook signature",
      });
    }

    webhookEvent(
      "partner.webhook.received",
      {
        partner:
          partner.partner_id,
        payload: req.body,
      }
    );

    res.json({
      ok: true,
      received: true,
    });
  }
);

app.get(
  "/api/admin/dashboard",
  authMiddleware,
  (_, res) => {
    res.json({
      ok: true,
      hotels_loaded:
        getHotels().length,
      reservations:
        readJSON(BOOKINGS_FILE)
          .length,
      webhook_events:
        readJSON(WEBHOOK_FILE)
          .length,
      retry_queue:
        readJSON(RETRY_FILE)
          .length,
      failovers:
        readJSON(FAILOVER_FILE)
          .length,
      recoveries:
        readJSON(RECOVERY_FILE)
          .length,
      mappings:
        readJSON(MAPPINGS_FILE)
          .length,
      timestamp: nowISO(),
    });
  }
);

app.post(
  "/api/failover",
  authMiddleware,
  (req, res) => {
    const rows =
      readJSON(FAILOVER_FILE);

    const row = {
      id: uuidv4(),
      created_at: nowISO(),
      ...req.body,
    };

    rows.unshift(row);

    writeJSON(
      FAILOVER_FILE,
      rows
    );

    audit(
      "supplier.failover",
      row
    );

    res.json({
      ok: true,
      failover: row,
    });
  }
);

app.post(
  "/api/recovery",
  authMiddleware,
  (req, res) => {
    const rows =
      readJSON(RECOVERY_FILE);

    const row = {
      id: uuidv4(),
      created_at: nowISO(),
      ...req.body,
    };

    rows.unshift(row);

    writeJSON(
      RECOVERY_FILE,
      rows
    );

    audit(
      "booking.recovery",
      row
    );

    res.json({
      ok: true,
      recovery: row,
    });
  }
);

app.get(
  "/api/mappings",
  authMiddleware,
  (_, res) => {
    res.json({
      ok: true,
      mappings:
        readJSON(MAPPINGS_FILE),
    });
  }
);

app.post(
  "/api/mappings",
  authMiddleware,
  (req, res) => {
    const rows =
      readJSON(MAPPINGS_FILE);

    const row = {
      id: uuidv4(),
      created_at: nowISO(),
      ...req.body,
    };

    rows.unshift(row);

    writeJSON(
      MAPPINGS_FILE,
      rows
    );

    audit(
      "mapping.created",
      row
    );

    res.json({
      ok: true,
      mapping: row,
    });
  }
);

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log("");
    console.log(
      "===================================="
    );
    console.log(
      "MYSPACE HOTEL ENTERPRISE API V3"
    );
    console.log(
      "===================================="
    );
    console.log(
      "HOTELS:",
      getHotels().length
    );
    console.log(
      "Swagger:",
      "http://127.0.0.1:5050/docs"
    );
    console.log(
      "===================================="
    );
  }
);
