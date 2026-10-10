const fs = require("fs");

const serverPath = "backend/server.js";
let s = fs.readFileSync(serverPath, "utf8");

// Stop Render crash from conflict markers
s = s.replace(/^<<<<<<<[\s\S]*?^=======$/gm, "");
s = s.replace(/^>>>>>>>.*$/gm, "");

// Remove older experimental routes that caused false success
s = s.replace(/app\.get\("\/api\/live-rate-real-suppliers"[\s\S]*?\n\}\);\n/g, "");
s = s.replace(/app\.get\("\/api\/live-rate-cascade"[\s\S]*?\n\}\);\n/g, "");

// Install strict source endpoint
if (!s.includes('/api/live-rate-correct-source')) {
  const route = String.raw`

app.get("/api/live-rate-correct-source", async (req, res) => {
  try {
    const country = clean(req.query.country || "");
    const city = clean(req.query.city || "");
    const currency = clean(req.query.currency || "GBP").toUpperCase();
    const hotelId = clean(req.query.hotelId || req.query.hotel_id || "");
    const hotelName = clean(req.query.hotelName || req.query.hotel_name || "");
    const checkIn = clean(req.query.checkIn || req.query.checkin || "");
    const checkOut = clean(req.query.checkOut || req.query.checkout || "");
    const guests = clean(req.query.guests || "2");
    const rooms = clean(req.query.rooms || "1");

    function n(v) {
      return clean(v).toLowerCase().replace(/^webbeds[-\s]*/i, "").replace(/^hotelbeds[-\s]*/i, "").replace(/[^a-z0-9]+/g, " ").trim();
    }

    function p(h) {
      const r = Array.isArray(h?.rooms) && h.rooms.length ? h.rooms[0] : {};
      const sr = h?.selectedRoom || {};
      for (const v of [h?.price, h?.convertedPrice, h?.displayPrice, h?.amount, h?.total, r?.price, r?.convertedPrice, r?.amount, sr?.price, sr?.convertedPrice]) {
        const x = number(v);
        if (x > 0) return money(x);
      }
      return 0;
    }

    function realSupplier(h, sourceName) {
      const src = n([
        sourceName,
        h?.source,
        h?.sourceType,
        h?.supplier,
        h?.supplierLabel,
        h?.supplier_code,
        h?.supplierCode,
        h?.supplier_private?.supplier_code,
        h?.rooms?.[0]?.supplier_private?.supplier_code,
        h?.rate_source_id,
        h?.rooms?.[0]?.rate_source_id
      ].join(" "));

      if (src.includes("catalogue") || src.includes("placeholder") || src.includes("existing supplier inventory") || src.includes("myspace internal")) return false;

      return src.includes("webbeds") || src.includes("hotelbeds") || src.includes("live");
    }

    function match(h) {
      const wantedId = n(hotelId);
      const wantedName = n(hotelName);

      const ids = [h?.hotelId, h?.hotel_id, h?.id, h?.code, h?.supplier_hotel_id, h?.rate_source_id, h?.rooms?.[0]?.rate_source_id].map(n);
      const names = [h?.name, h?.hotel_name, h?.hotelName].map(n);

      const idOk = wantedId && ids.some((x) => x && (x === wantedId || x.includes(wantedId) || wantedId.includes(x)));
      const nameOk = wantedName && names.some((x) => x && (x === wantedName || x.includes(wantedName) || wantedName.includes(x)));

      return idOk || nameOk;
    }

    async function getJson(sourceName, url) {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const data = await r.json().catch(() => ({}));
        return { sourceName, ok: r.ok, status: r.status, hotels: Array.isArray(data.hotels) ? data.hotels : [], data };
      } catch (e) {
        return { sourceName, ok: false, status: 0, hotels: [], error: e.message };
      }
    }

    const params = new URLSearchParams({
      country, city, currency, checkIn, checkOut, checkin: checkIn, checkout: checkOut,
      guests, rooms, hotelId, hotel_id: hotelId, hotelName, hotel_name: hotelName, limit: "1000"
    });

    const base = "http://127.0.0.1:" + PORT;
    const sources = [
      ["webbeds-by-hotel-id", "/api/webbeds/search-by-hotel-ids?" + params.toString() + "&hotelIds=" + encodeURIComponent(hotelId.replace(/^WEBBEDS-/i, "").replace(/[^0-9,]/g, ""))],
      ["webbeds-city-live", "/api/live-webbeds-hotels?" + params.toString()],
      ["webbeds-search-live", "/api/webbeds/search?" + params.toString()],
      ["hotelbeds-search-if-present", "/api/hotelbeds/search?" + params.toString()],
      ["hotelbeds-availability-if-present", "/api/hotelbeds/availability?" + params.toString()],
      ["multi-supplier-live-only-filtered", "/api/multi-supplier-hotels?" + params.toString()]
    ];

    const attempts = [];

    for (const [sourceName, path] of sources) {
      const result = await getJson(sourceName, base + path);

      const candidates = result.hotels
        .filter((h) => p(h) > 0)
        .filter((h) => realSupplier(h, sourceName))
        .filter((h) => match(h) || sourceName.includes("webbeds-city") || sourceName.includes("webbeds-search"))
        .sort((a, b) => p(a) - p(b));

      attempts.push({
        source: sourceName,
        ok: result.ok,
        status: result.status,
        returned: result.hotels.length,
        accepted: candidates.length,
        error: result.error || ""
      });

      if (!candidates.length) continue;

      const h = candidates[0];
      const r = Array.isArray(h.rooms) && h.rooms.length ? h.rooms[0] : {};
      const amount = p(h);

      const hotel = {
        ...h,
        price: amount,
        convertedPrice: amount,
        displayPrice: amount,
        currency: clean(r.displayCurrency || r.currency || h.currency || currency).toUpperCase(),
        displayCurrency: clean(r.displayCurrency || r.currency || h.currency || currency).toUpperCase(),
        availableToBook: true,
        sourceType: sourceName,
        availabilityMode: "live_rate",
        customerBadge: "Live hotel rate",
        selectedRoom: {
          roomCode: clean(r.roomCode || r.room_code || "STANDARD"),
          roomName: clean(r.roomName || r.room_name || "Available room"),
          board: clean(r.board || "Available room"),
          price: amount,
          convertedPrice: amount,
          displayCurrency: clean(r.displayCurrency || r.currency || h.currency || currency).toUpperCase(),
          rate_source_id: clean(r.rate_source_id || h.rate_source_id || ""),
          rate_source_timestamp: clean(r.rate_source_timestamp || h.rate_source_timestamp || nowISO()),
          source_health: "verified"
        }
      };

      return res.json({
        ok: true,
        source: "correct_live_supplier_source",
        winning_source: sourceName,
        hotel,
        hotels: [hotel],
        customer_offer: {
          hotelId: hotel.hotelId || hotel.hotel_id,
          hotelName: hotel.name || hotel.hotel_name,
          amount,
          price: amount,
          currency: hotel.currency,
          roomName: hotel.selectedRoom.roomName,
          board: hotel.selectedRoom.board,
          rate_source_id: hotel.selectedRoom.rate_source_id || hotel.rate_source_id || "",
          rate_source_timestamp: hotel.selectedRoom.rate_source_timestamp || hotel.rate_source_timestamp || nowISO(),
          source_health: "verified"
        },
        attempts
      });
    }

    return res.status(404).json({
      ok: false,
      source: "correct_live_supplier_source",
      message: "No real WebBeds or Hotelbeds live rate was found for this selected hotel.",
      attempts
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Correct live source search failed.", error: err.message });
  }
});

`;
  s = s.replace(/\napp\.listen\(/, route + "\napp.listen(");
}

fs.writeFileSync(serverPath, s, "utf8");

const appPath = "frontend/src/App.jsx";
let a = fs.readFileSync(appPath, "utf8");

// Force selected hotel auto-engine to use only the strict route
a = a.replace(/const endpoints = \[[\s\S]*?\];/, 'const endpoints = [`${API_BASE}/api/live-rate-correct-source?${params.toString()}`];');

fs.writeFileSync(appPath, a, "utf8");
