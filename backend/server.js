async function bestAvailableRate(hotel, query) {
  const fresh = await searchHotelbeds({
    hotel,
    checkin: query.checkin,
    checkout: query.checkout,
    guests: query.guests,
    rooms: query.rooms
  });

  // FRESH LIVE PRICE SUCCESS
  if (fresh.ok && fresh.rate) {
    return {
      ok: true,
      live_available: true,
      hotel,
      rate_status: "fresh_live",
      customer_message: "Today’s available price is confirmed.",
      warning: "",
      rate: fresh.rate
    };
  }

  // BUILD MATCH KEYS FOR SMART FALLBACK
  const hotelIds = [
    clean(hotel.hotelbeds_code),
    clean(hotel.hotel_id),
    clean(hotel.id)
  ].filter(Boolean);

  const hotelName = key(hotel.hotel_name || hotel.name);
  const hotelCity = key(hotel.city);
  const hotelCountry = key(hotel.country);

  let best = null;

  // SEARCH SAVED INDEX FIRST
  const index = safeJson(RATE_INDEX, {});

  for (const id of hotelIds) {
    const row = index[id];

    if (row && Number(row.amount) > 0) {
      best = {
        amount: Number(row.amount),
        currency: clean(row.currency || "GBP"),
        rate_key: clean(row.rate_key || `RECENT-${id}`),
        source: "recent_verified_price"
      };

      break;
    }
  }

  // DEEP SEARCH HARVESTED FILES
  if (!best) {
    for (const file of RATE_FILES) {
      if (!fs.existsSync(file)) continue;

      try {
        // NDJSON.GZ
        if (file.toLowerCase().endsWith(".ndjson.gz")) {
          const stream = fs
            .createReadStream(file)
            .pipe(zlib.createGunzip());

          const rl = readline.createInterface({
            input: stream,
            crlfDelay: Infinity
          });

          for await (const line of rl) {
            if (!line.trim()) continue;

            try {
              const row = JSON.parse(line);

              const rowIds = [
                clean(row.hotel_id),
                clean(row.hotelId),
                clean(row.hotel_code),
                clean(row.hotelCode),
                clean(row.code),
                clean(row.supplier_hotel_id),
                clean(row.hotelbeds_code)
              ].filter(Boolean);

              const rowHotelName = key(
                row.hotel_name ||
                  row.name
              );

              const rowCity = key(
                row.city ||
                  row.destination ||
                  row.destination_name
              );

              const rowCountry = key(
                row.country ||
                  row.country_name
              );

              const idMatch =
                rowIds.some((x) =>
                  hotelIds.includes(x)
                );

              const nameMatch =
                rowHotelName &&
                hotelName &&
                rowHotelName === hotelName &&
                rowCity === hotelCity;

              const deepMatch =
                rowHotelName &&
                hotelName &&
                rowHotelName.includes(hotelName) &&
                rowCity === hotelCity &&
                rowCountry === hotelCountry;

              if (
                !idMatch &&
                !nameMatch &&
                !deepMatch
              ) {
                continue;
              }

              const src =
                row.first_rate ||
                row.rate ||
                row;

              const amount = Number(
                src.amount ||
                  src.price ||
                  src.total ||
                  src.net ||
                  src.sellingRate ||
                  src.rate
              );

              if (!(amount > 0)) continue;

              const candidate = {
                amount,
                currency:
                  clean(
                    src.currency ||
                      src.currencyCode
                  ) || "GBP",
                rate_key:
                  clean(
                    src.rate_key ||
                      src.rateKey
                  ) ||
                  `RECENT-${hotel.hotel_id}`,
                source:
                  "recent_verified_price"
              };

              if (
                !best ||
                candidate.amount <
                  best.amount
              ) {
                best = candidate;
              }
            } catch {}
          }
        }

        // JSON.GZ
        else {
          const text = zlib
            .gunzipSync(
              fs.readFileSync(file)
            )
            .toString("utf8");

          const parsed =
            JSON.parse(text);

          const rows = Array.isArray(
            parsed
          )
            ? parsed
            : parsed.hotels ||
              parsed.rates ||
              parsed.data ||
              [];

          for (const row of rows) {
            const rowIds = [
              clean(row.hotel_id),
              clean(row.hotelId),
              clean(row.hotel_code),
              clean(row.hotelCode),
              clean(row.code),
              clean(row.supplier_hotel_id),
              clean(row.hotelbeds_code)
            ].filter(Boolean);

            const rowHotelName = key(
              row.hotel_name ||
                row.name
            );

            const rowCity = key(
              row.city ||
                row.destination ||
                row.destination_name
            );

            const rowCountry = key(
              row.country ||
                row.country_name
            );

            const idMatch =
              rowIds.some((x) =>
                hotelIds.includes(x)
              );

            const nameMatch =
              rowHotelName &&
              hotelName &&
              rowHotelName ===
                hotelName &&
              rowCity === hotelCity;

            const deepMatch =
              rowHotelName &&
              hotelName &&
              rowHotelName.includes(
                hotelName
              ) &&
              rowCity === hotelCity &&
              rowCountry ===
                hotelCountry;

            if (
              !idMatch &&
              !nameMatch &&
              !deepMatch
            ) {
              continue;
            }

            const src =
              row.first_rate ||
              row.rate ||
              row;

            const amount = Number(
              src.amount ||
                src.price ||
                src.total ||
                src.net ||
                src.sellingRate ||
                src.rate
            );

            if (!(amount > 0)) continue;

            const candidate = {
              amount,
              currency:
                clean(
                  src.currency ||
                    src.currencyCode
                ) || "GBP",
              rate_key:
                clean(
                  src.rate_key ||
                    src.rateKey
                ) ||
                `RECENT-${hotel.hotel_id}`,
              source:
                "recent_verified_price"
            };

            if (
              !best ||
              candidate.amount <
                best.amount
            ) {
              best = candidate;
            }
          }
        }
      } catch {}
    }
  }

  // FALLBACK SUCCESS
  if (best) {
    return {
      ok: true,
      live_available: true,
      hotel,
      rate_status: "saved_recent",
      customer_message:
        "A recent verified price is available for this stay.",
      warning:
        "Final confirmation happens before payment is completed.",
      rate: best,
      fresh_price_check: {
        customer_message:
          fresh.customer_message,
        internal_reason:
          fresh.internal_reason
      }
    };
  }

  // NOTHING FOUND
  return {
    ok: false,
    live_available: false,
    hotel,
    rate_status: "unavailable",
    customer_message:
      "This stay is not available for instant pricing right now. Please choose another stay.",
    fresh_price_check: {
      customer_message:
        fresh.customer_message,
      internal_reason:
        fresh.internal_reason
    }
  };
}