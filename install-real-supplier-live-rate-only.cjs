const fs = require("fs");

const serverPath = "backend/server.js";
let server = fs.readFileSync(serverPath, "utf8");

if (!server.includes('/api/live-rate-real-suppliers')) {
  const route = String.raw`

app.get("/api/live-rate-real-suppliers", async (req, res) => {
  const startedAt = Date.now();

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

    function realNorm(v) {
      return clean(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
    }

    function realPrice(h) {
      const room = Array.isArray(h?.rooms) && h.rooms.length ? h.rooms[0] : {};
      const selectedRoom = h?.selectedRoom || {};
      const values = [
        h?.price, h?.convertedPrice, h?.displayPrice, h?.amount, h?.total, h?.totalPrice,
        room?.price, room?.convertedPrice, room?.displayPrice, room?.amount, room?.total,
        selectedRoom?.price, selectedRoom?.convertedPrice, selectedRoom?.displayPrice, selectedRoom?.amount
      ];

      for (const value of values) {
        const n = number(value);
        if (n > 0) return money(n);
      }

      return 0;
    }

    function realSupplierCode(h) {
      return clean(
        h?.supplier_code ||
        h?.supplierCode ||
        h?.supplier_private?.supplier_code ||
        h?.internalSupplierSettlement?.supplierCode ||
        h?._supplier_code ||
        h?.selectedRoom?.supplier_code ||
        h?.rooms?.[0]?.supplier_code ||
        h?.rooms?.[0]?.supplier_private?.supplier_code ||
        h?.source ||
        h?.sourceType ||
        h?.supplier ||
        h?.supplierLabel ||
        ""
      ).toUpperCase();
    }

    function isRealSupplierLive(h, sourceName) {
      const source = realNorm(`${sourceName} ${h?.source || ""} ${h?.sourceType || ""} ${h?.supplier || ""} ${h?.supplierLabel || ""} ${realSupplierCode(h)}`);
      const price = realPrice(h);

      if (price <= 0) return false;

      if (source.includes("catalogue")) return false;
      if (source.includes("placeholder")) return false;
      if (source.includes("existing supplier inventory")) return false;
      if (source.includes("plain search")) return false;
      if (source.includes("myspace internal")) return false;

      return (
        source.includes("webbeds") ||
        source.includes("hotelbeds") ||
        source.includes("supplier live") ||
        source.includes("live hotel id batch") ||
        source.includes("webbeds live") ||
        source.includes("hotelbeds live")
      );
    }

    function idsMatch(h) {
      const wanted = realNorm(hotelId).replace(/^webbeds /, "").replace(/^hotelbeds /, "");
      if (!wanted) return false;

      const ids = [
        h?.hotelId, h?.hotel_id, h?.id, h?.code, h?.hotel_code,
        h?.supplier_hotel_id, h?.supplierHotelId, h?.rate_source_id,
        h?.rooms?.[0]?.rate_source_id
      ].map((x) => realNorm(x).replace(/^webbeds /, "").replace(/^hotelbeds /, ""));

      return ids.some((x) => x && (x === wanted || x.includes(wanted) || wanted.includes(x)));
    }

    function namesMatch(h) {
      const wanted = realNorm(hotelName);
      if (!wanted) return false;

      const names = [h?.name, h?.hotel_name, h?.hotelName].map(realNorm);
      return names.some((x) => x && (x === wanted || x.includes(wanted) || wanted.includes(x)));
    }

    function bestRoom(h) {
      const allRooms = [
        ...(Array.isArray(h?.rooms) ? h.rooms : []),
        ...(h?.selectedRoom ? [h.selectedRoom] : [])
      ];

      return allRooms
        .map((room) => ({
          ...room,
          _realPrice: money(room.convertedPrice || room.price || room.displayPrice || room.amount || room.total || 0)
        }))
        .filter((room) => room._realPrice > 0)
        .sort((a, b) => a._realPrice - b._realPrice)[0] || null;
    }

    function chooseReal(sourceName, hotels) {
      const candidates = (hotels || [])
        .filter((h) => isRealSupplierLive(h, sourceName))
        .filter((h) => {
          if (hotelId || hotelName) return idsMatch(h) || namesMatch(h);
          return true;
        })
        .map((h) => {
          let score = 0;
          if (idsMatch(h)) score += 500;
          if (namesMatch(h)) score += 400;
          if (realNorm(h.city).includes(realNorm(city)) || realNorm(city).includes(realNorm(h.city))) score += 50;
          if (realNorm(h.country) === realNorm(country)) score += 50;
          return { hotel: h, score, price: realPrice(h) };
        })
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.price - b.price;
        });

      return candidates[0]?.hotel || null;
    }

    function normaliseReal(h, sourceName) {
      const room = bestRoom(h);
      const amount = room ? room._realPrice : realPrice(h);
      const displayCurrency = clean(room?.displayCurrency || room?.currency || h?.displayCurrency || h?.currency || currency).toUpperCase();

      return {
        ...h,
        hotelId: h?.hotelId || h?.hotel_id || h?.id || hotelId,
        hotel_id: h?.hotel_id || h?.hotelId || h?.id || hotelId,
        name: clean(h?.name || h?.hotel_name || h?.hotelName || hotelName),
        hotel_name: clean(h?.hotel_name || h?.name || h?.hotelName || hotelName),
        country: clean(h?.country || country),
        city: clean(h?.city || city),
        price: amount,
        convertedPrice: amount,
        displayPrice: amount,
        currency: displayCurrency,
        displayCurrency,
        availableToBook: true,
        customerBadge: "Live hotel rate",
        availabilityMode: "live_rate",
        sourceType: sourceName,
        selectedRoom: {
          roomCode: clean(room?.roomCode || room?.room_code || h?.roomCode || "STANDARD"),
          roomName: clean(room?.roomName || room?.room_name || h?.roomName || "Available room"),
          board: clean(room?.board || h?.board || "Available room"),
          price: amount,
          convertedPrice: amount,
          displayCurrency,
          rate_source_id: clean(room?.rate_source_id || h?.rate_source_id || ""),
          rate_source_timestamp: clean(room?.rate_source_timestamp || h?.rate_source_timestamp || nowISO()),
          source_health: "verified"
        },
        rate_source_id: clean(room?.rate_source_id || h?.rate_source_id || ""),
        rate_source_timestamp: clean(room?.rate_source_timestamp || h?.rate_source_timestamp || nowISO()),
        source_health: "verified"
      };
    }

    async function fetchJson(sourceName, path) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        return {
          sourceName,
          ok: response.ok,
          status: response.status,
          hotels: Array.isArray(payload.hotels) ? payload.hotels : [],
          payload
        };
      } catch (err) {
        return { sourceName, ok: false, status: 0, hotels: [], error: err.message };
      }
    }

    const fixed = typeof MSH_PUBLIC_CITY_PARENT === "function"
      ? MSH_PUBLIC_CITY_PARENT(country, city)
      : { supplierCity: city, area: "" };

    const supplierCity = fixed.supplierCity || city;

    const params = new URLSearchParams({
      country,
      city,
      checkIn,
      checkOut,
      checkin: checkIn,
      checkout: checkOut,
      guests,
      rooms,
      currency,
      hotelId,
      hotel_id: hotelId,
      hotelName,
      hotel_name: hotelName,
      limit: "1000"
    });

    const supplierParams = new URLSearchParams(params);
    supplierParams.set("city", supplierCity);

    const attempts = [];

    const sources = [
      ["webbeds_city_live", `/api/live-webbeds-hotels?${supplierParams.toString()}`],
      ["webbeds_search_live", `/api/webbeds/search?${supplierParams.toString()}`],
      ["multi_supplier_real_live", `/api/multi-supplier-hotels?${supplierParams.toString()}`],
      ["multi_supplier_requested_city_real_live", `/api/multi-supplier-hotels?${params.toString()}`]
    ];

    const numericWebBedsId = hotelId.replace(/^WEBBEDS-/i, "").replace(/[^0-9,]/g, "");
    if (numericWebBedsId) {
      const idParams = new URLSearchParams(supplierParams);
      idParams.set("hotelIds", numericWebBedsId);
      sources.unshift(["webbeds_hotel_id_live", `/api/webbeds/search-by-hotel-ids?${idParams.toString()}`]);
    }

    for (const [sourceName, path] of sources) {
      const result = await fetchJson(sourceName, path);
      const found = chooseReal(sourceName, result.hotels);

      attempts.push({
        source: sourceName,
        ok: result.ok,
        status: result.status,
        candidates: result.hotels.length,
        foundRealLiveRate: Boolean(found),
        error: result.error || ""
      });

      if (found) {
        const hotel = normaliseReal(found, sourceName);
        return res.json({
          ok: true,
          source: "real_supplier_live_rate",
          winning_source: sourceName,
          hotel,
          hotels: [hotel],
          customer_offer: {
            hotelId: hotel.hotelId || hotel.hotel_id,
            hotelName: hotel.name || hotel.hotel_name,
            country: hotel.country,
            city: hotel.city,
            roomCode: hotel.selectedRoom.roomCode,
            roomName: hotel.selectedRoom.roomName,
            board: hotel.selectedRoom.board,
            amount: hotel.price,
            price: hotel.price,
            currency: hotel.displayCurrency || hotel.currency || currency,
            rate_source_id: hotel.selectedRoom.rate_source_id || hotel.rate_source_id || "",
            rate_source_timestamp: hotel.selectedRoom.rate_source_timestamp || hotel.rate_source_timestamp || nowISO(),
            source_health: "verified"
          },
          attempts,
          elapsedMs: Date.now() - startedAt,
          message: "Real supplier live rate found."
        });
      }
    }

    return res.status(404).json({
      ok: false,
      source: "real_supplier_live_rate",
      message: "No real WebBeds or Hotelbeds live rate was found for this selected hotel.",
      selected_hotel: { hotelId, hotelName, country, city },
      attempts,
      elapsedMs: Date.now() - startedAt
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      source: "real_supplier_live_rate",
      message: "Real supplier live-rate search failed.",
      error: err.message
    });
  }
});

`;
  server = server.replace(/\napp\.listen\(/, route + "\napp.listen(");
}

fs.writeFileSync(serverPath, server, "utf8");

const appPath = "frontend/src/App.jsx";
let app = fs.readFileSync(appPath, "utf8");

app = app.replace(
  /const endpoints = \[[\s\S]*?\];/,
  'const endpoints = [`${API_BASE}/api/live-rate-real-suppliers?${params.toString()}`];'
);

app = app.replace(
  /setLiveRateNotice\("Live rate refreshed for the selected hotel\."\);/g,
  'setLiveRateNotice("Live rate refreshed for the selected hotel.");'
);

fs.writeFileSync(appPath, app, "utf8");
