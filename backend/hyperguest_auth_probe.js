require("dotenv").config();

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const LOG_DIR = path.join(DATA_DIR, "hyperguest-certification");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const TOKEN = process.env.HYPERGUEST_AUTH_TOKEN || "";
const USER = process.env.HYPERGUEST_USER || "developer";
const PASSWORD = process.env.HYPERGUEST_PASSWORD || "";
const SEARCH_URL = process.env.HYPERGUEST_SEARCH_URL || "https://search-api.hyperguest.io/2.0/";
const STATIC_URL = process.env.HYPERGUEST_STATIC_URL || "https://hg-static.hyperguest.com/hotels.json";
const PROPERTY_ID = process.env.HYPERGUEST_CERT_PROPERTY_ID || "19912";

function tomorrow(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function redactHeaders(headers) {
  const out = { ...headers };
  for (const key of Object.keys(out)) {
    const k = key.toLowerCase();
    if (k.includes("authorization") || k.includes("token") || k.includes("key")) {
      out[key] = "REDACTED";
    }
  }
  return out;
}

function save(name, data) {
  fs.writeFileSync(
    path.join(LOG_DIR, `${Date.now()}-${name}.json`),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function baseHeaders() {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "Accept-Encoding": "gzip, deflate"
  };
}

function authVariants() {
  const basic = Buffer.from(`${USER}:${PASSWORD}`).toString("base64");

  return [
    {
      name: "bearer-token",
      headers: {
        ...baseHeaders(),
        Authorization: `Bearer ${TOKEN}`
      }
    },
    {
      name: "raw-token-authorization",
      headers: {
        ...baseHeaders(),
        Authorization: TOKEN
      }
    },
    {
      name: "x-auth-token",
      headers: {
        ...baseHeaders(),
        "x-auth-token": TOKEN
      }
    },
    {
      name: "token-header",
      headers: {
        ...baseHeaders(),
        token: TOKEN
      }
    },
    {
      name: "api-key-header",
      headers: {
        ...baseHeaders(),
        "api-key": TOKEN
      }
    },
    {
      name: "basic-only",
      headers: {
        ...baseHeaders(),
        Authorization: `Basic ${basic}`
      }
    },
    {
      name: "basic-plus-x-auth-token",
      headers: {
        ...baseHeaders(),
        Authorization: `Basic ${basic}`,
        "x-auth-token": TOKEN
      }
    },
    {
      name: "username-password-token",
      headers: {
        ...baseHeaders(),
        username: USER,
        password: PASSWORD,
        token: TOKEN
      }
    }
  ];
}

const searchPayloads = [
  {
    name: "camel-case-property",
    body: {
      propertyId: Number(PROPERTY_ID),
      hotelIds: [Number(PROPERTY_ID)],
      checkIn: tomorrow(1),
      checkOut: tomorrow(2),
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "snake-case-property",
    body: {
      property_id: Number(PROPERTY_ID),
      hotel_ids: [Number(PROPERTY_ID)],
      check_in: tomorrow(1),
      check_out: tomorrow(2),
      currency: "USD",
      nationality: "GB",
      rooms: [{ adults: 1, children: [] }]
    }
  },
  {
    name: "hotel-id-occupancy",
    body: {
      hotels: [Number(PROPERTY_ID)],
      checkIn: tomorrow(1),
      checkOut: tomorrow(2),
      currency: "USD",
      nationality: "GB",
      occupancies: [{ rooms: 1, adults: 1, children: [] }]
    }
  }
];

async function postVariant(auth, payload) {
  const started = Date.now();

  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: auth.headers,
      body: JSON.stringify(payload.body),
      signal: AbortSignal.timeout(300000)
    });

    const text = await res.text();

    const result = {
      authVariant: auth.name,
      payloadVariant: payload.name,
      status: res.status,
      ok: res.ok,
      ms: Date.now() - started,
      requestHeaders: redactHeaders(auth.headers),
      requestBody: payload.body,
      responsePreview: text.slice(0, 2000)
    };

    save(`auth-test-${auth.name}-${payload.name}`, result);

    console.log(
      `${auth.name} + ${payload.name} => status ${res.status}, ok ${res.ok}`
    );

    return result;
  } catch (err) {
    const result = {
      authVariant: auth.name,
      payloadVariant: payload.name,
      ok: false,
      error: err.message,
      ms: Date.now() - started,
      requestHeaders: redactHeaders(auth.headers),
      requestBody: payload.body
    };

    save(`auth-test-${auth.name}-${payload.name}-error`, result);

    console.log(
      `${auth.name} + ${payload.name} => ERROR ${err.message}`
    );

    return result;
  }
}

async function staticWithoutAuth() {
  try {
    const res = await fetch(STATIC_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate"
      },
      signal: AbortSignal.timeout(300000)
    });

    const text = await res.text();

    const result = {
      step: "static-without-auth",
      status: res.status,
      ok: res.ok,
      propertyFound: text.includes(PROPERTY_ID),
      responsePreview: text.slice(0, 2000)
    };

    save("static-without-auth", result);

    console.log(`static-without-auth => status ${res.status}, ok ${res.ok}, propertyFound ${result.propertyFound}`);
  } catch (err) {
    save("static-without-auth-error", { error: err.message });
    console.log(`static-without-auth => ERROR ${err.message}`);
  }
}

async function run() {
  console.log("HyperGuest auth format test starting.");
  console.log("Token loaded:", Boolean(TOKEN));
  console.log("User loaded:", Boolean(USER));
  console.log("Password loaded:", Boolean(PASSWORD));
  console.log("Property:", PROPERTY_ID);

  await staticWithoutAuth();

  const results = [];

  for (const auth of authVariants()) {
    for (const payload of searchPayloads) {
      const r = await postVariant(auth, payload);
      results.push(r);
    }
  }

  const passed = results.filter((x) => x.ok);

  save("auth-test-summary", {
    created_at: new Date().toISOString(),
    total: results.length,
    passed: passed.map((x) => ({
      authVariant: x.authVariant,
      payloadVariant: x.payloadVariant,
      status: x.status
    })),
    failedStatuses: results.map((x) => ({
      authVariant: x.authVariant,
      payloadVariant: x.payloadVariant,
      status: x.status || null,
      ok: x.ok,
      error: x.error || null
    }))
  });

  console.log("====================================");
  console.log("AUTH TEST COMPLETE");
  console.log("Successful combinations:", passed.length);
  for (const p of passed) {
    console.log(`PASS: ${p.authVariant} + ${p.payloadVariant} => ${p.status}`);
  }
  console.log("Logs:", LOG_DIR);
  console.log("====================================");
}

run().catch((err) => {
  console.error(err);
});
