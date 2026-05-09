import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "http://127.0.0.1:5050";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function money(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);

  if (!hotel?.image_url || failed) {
    return (
      <div style={styles.realImageMissing}>
        <div style={styles.imageBadge}>MYSPACE HOTEL</div>
        <div style={styles.imageMissingTitle}>Verified property</div>
        <div style={styles.imageMissingText}>
          Real hotel photo unavailable.
        </div>
      </div>
    );
  }

  return (
    <img
      loading="eager"
      decoding="async"
      fetchPriority="high"
      src={hotel.image_url}
      alt={hotel.hotel_name}
      style={styles.hotelImage}
      onError={() => setFailed(true)}
    />
  );
}

export default function App() {
  const [catalog, setCatalog] = useState([]);

  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");

  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());

  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");

  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const [message, setMessage] = useState("");

  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const [convertedPrice, setConvertedPrice] = useState("");

  const selectedCountry = useMemo(() => {
    return catalog.find((x) => x.country === country) || null;
  }, [catalog, country]);

  const cities = selectedCountry?.cities || [];

  useEffect(() => {
    async function loadCatalog() {
      try {
        const res = await fetch(`${API_BASE}/api/real-catalog/destinations`);
        const data = await res.json();

        const countries = Array.isArray(data.countries)
          ? data.countries
          : [];

        setCatalog(countries);

        let bestCountry = "";
        let bestCity = "";

        for (const c of countries) {
          const live = c.cities
            ?.filter((x) => Number(x.live_hotels || 0) > 20)
            ?.sort((a, b) => b.live_hotels - a.live_hotels)?.[0];

          if (live) {
            bestCountry = c.country;
            bestCity = live.city;
            break;
          }
        }

        if (!bestCountry && countries.length > 0) {
          bestCountry = countries[0].country;
          bestCity = countries[0].cities?.[0]?.city || "";
        }

        setCountry(bestCountry);
        setCity(bestCity);

        if (bestCountry && bestCity) {
          setTimeout(() => {
            runSearch(bestCountry, bestCity);
          }, 100);
        }
      } catch {
        setMessage("Could not load destinations.");
      }
    }

    loadCatalog();
  }, []);

  async function runSearch(nextCountry = country, nextCity = city) {
    if (!nextCountry || !nextCity) return;

    setLoading(true);
    setMessage("");
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams();

      params.set("country", nextCountry);
      params.set("city", nextCity);
      params.set("checkin", checkin);
      params.set("checkout", checkout);
      params.set("guests", String(guests));
      params.set("rooms", String(rooms));
      params.set("limit", "120");

      if (area.trim()) params.set("area", area.trim());
      if (keyword.trim()) params.set("keyword", keyword.trim());

      const res = await fetch(
        `${API_BASE}/api/hotels/search?${params.toString()}`
      );

      const data = await res.json();

      let list = Array.isArray(data.hotels) ? data.hotels : [];

      list = list.sort((a, b) => {
        const aReady = a.live_rate_ready ? 1 : 0;
        const bReady = b.live_rate_ready ? 1 : 0;

        if (aReady !== bReady) return bReady - aReady;

        const aAmount = Number(a?.first_rate?.amount || 0);
        const bAmount = Number(b?.first_rate?.amount || 0);

        if (aAmount !== bAmount) return aAmount - bAmount;

        return a.hotel_name.localeCompare(b.hotel_name);
      });

      setHotels(list);

      const firstLive = list.find(
        (x) =>
          x.live_rate_ready &&
          Number(x?.first_rate?.amount || 0) > 0
      );

      if (firstLive) {
        setSelectedHotel(firstLive);
        refreshSelectedHotel(firstLive);
      }

      setMessage(
        `${list.length} hotels loaded for ${nextCity}.`
      );
    } catch {
      setMessage("Search unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshSelectedHotel(hotel) {
    if (!hotel) return;

    try {
      const params = new URLSearchParams();

      params.set("hotel_id", hotel.hotel_id);
      params.set("checkin", checkin);
      params.set("checkout", checkout);
      params.set("guests", guests);
      params.set("rooms", rooms);

      const res = await fetch(
        `${API_BASE}/api/hotels/selected-live-price-v2?${params.toString()}`
      );

      const data = await res.json();

      if (!data.ok || !data.live_payment_ready) {
        return;
      }

      const updated = {
        ...hotel,
        live_rate_ready: true,
        first_rate: {
          ...hotel.first_rate,
          amount: data.amount,
          currency: data.currency,
          room_name: data.room_name,
          board_name: data.board_name,
          rate_key: data.rate_key,
        },
      };

      setSelectedHotel(updated);

      setHotels((prev) =>
        prev.map((x) =>
          x.hotel_id === updated.hotel_id ? updated : x
        )
      );
    } catch {}
  }

  async function convertCurrency() {
    if (
      !selectedHotel ||
      !selectedHotel.live_rate_ready ||
      Number(selectedHotel.first_rate.amount || 0) <= 0
    ) {
      setConvertedPrice("Live price required.");
      return;
    }

    try {
      const params = new URLSearchParams();

      params.set("amount", selectedHotel.first_rate.amount);
      params.set("from", selectedHotel.first_rate.currency);
      params.set("to", displayCurrency);

      const res = await fetch(
        `${API_BASE}/api/currency/convert?${params.toString()}`
      );

      const data = await res.json();

      if (!data.ok) {
        setConvertedPrice("Conversion unavailable.");
        return;
      }

      setConvertedPrice(
        `${displayCurrency} ${money(data.converted)}`
      );
    } catch {
      setConvertedPrice("Conversion unavailable.");
    }
  }

  async function requestBooking(hotel = selectedHotel) {
    if (!hotel) {
      setMessage("Select a hotel.");
      return;
    }

    if (
      !hotel.live_rate_ready ||
      Number(hotel?.first_rate?.amount || 0) <= 0
    ) {
      setMessage(
        "Live price unavailable for selected dates."
      );
      return;
    }

    if (!customerName.trim() || !customerEmail.trim()) {
      setMessage("Enter your name and email.");
      return;
    }

    setRequesting(true);

    try {
      const rate = hotel.first_rate;

      const payload = {
        hotel_id: hotel.hotel_id,
        hotel_name: hotel.hotel_name,
        destination: `${hotel.city}, ${hotel.country}`,
        checkin,
        checkout,
        guests,
        rooms,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        note,
        rate_key: rate.rate_key,
        amount: rate.amount,
        currency: rate.currency,
        room_name: rate.room_name,
        board_name: rate.board_name,
        payment_type: rate.payment_type,
      };

      const res = await fetch(
        `${API_BASE}/reservation-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (!data.ok) {
        setMessage(
          data.message || "Secure checkout unavailable."
        );
        return;
      }

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(
        `Reservation created: ${data.reservation_code}`
      );
    } catch {
      setMessage("Checkout unavailable.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.brand}>MYSPACE HOTEL</div>

          <h1 style={styles.heroTitle}>
            Find available hotels and pay securely.
          </h1>

          <p style={styles.heroText}>
            Real hotels. Real availability. Real live pricing.
          </p>
        </div>

        <div style={styles.buttonRow}>
          <button style={styles.whiteButton}>Guide</button>
          <button style={styles.whiteButton}>FAQ</button>
          <button style={styles.whiteButton}>Terms</button>
          <button style={styles.whiteButton}>Contact</button>
        </div>
      </section>

      <section style={styles.mainGrid}>
        <div style={styles.column}>
          <div style={styles.label}>SEARCH</div>

          <div style={styles.searchBox}>
            <label style={styles.formLabel}>Country</label>

            <select
              style={styles.input}
              value={country}
              onChange={(e) => {
                const nextCountry = e.target.value;

                const found = catalog.find(
                  (x) => x.country === nextCountry
                );

                setCountry(nextCountry);
                setCity(found?.cities?.[0]?.city || "");
              }}
            >
              {catalog.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country}
                </option>
              ))}
            </select>

            <label style={styles.formLabel}>City</label>

            <select
              style={styles.input}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              {cities.map((c) => (
                <option key={c.city} value={c.city}>
                  {c.city}
                </option>
              ))}
            </select>

            <label style={styles.formLabel}>Area</label>

            <input
              style={styles.input}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Neighbourhood or area"
            />

            <label style={styles.formLabel}>Keyword</label>

            <input
              style={styles.input}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Hotel keyword"
            />

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>
                  Check-in
                </label>

                <input
                  style={styles.input}
                  type="date"
                  value={checkin}
                  onChange={(e) =>
                    setCheckin(e.target.value)
                  }
                />
              </div>

              <div>
                <label style={styles.formLabel}>
                  Check-out
                </label>

                <input
                  style={styles.input}
                  type="date"
                  value={checkout}
                  onChange={(e) =>
                    setCheckout(e.target.value)
                  }
                />
              </div>
            </div>

            <div style={styles.twoInput}>
              <div>
                <label style={styles.formLabel}>
                  Guests
                </label>

                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={guests}
                  onChange={(e) =>
                    setGuests(Number(e.target.value))
                  }
                />
              </div>

              <div>
                <label style={styles.formLabel}>
                  Rooms
                </label>

                <input
                  style={styles.input}
                  type="number"
                  min="1"
                  value={rooms}
                  onChange={(e) =>
                    setRooms(Number(e.target.value))
                  }
                />
              </div>
            </div>

            <button
              style={styles.goldButton}
              onClick={() => runSearch()}
            >
              {loading
                ? "Searching live prices..."
                : "Search available hotels"}
            </button>

            {message && (
              <div style={styles.notice}>{message}</div>
            )}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>AVAILABLE HOTELS</div>

          <div style={styles.scroll}>
            {hotels.map((hotel) => {
              const amount = Number(
                hotel?.first_rate?.amount || 0
              );

              const canPay =
                hotel.live_rate_ready && amount > 0;

              return (
                <div
                  key={hotel.hotel_id}
                  style={
                    selectedHotel?.hotel_id ===
                    hotel.hotel_id
                      ? styles.hotelCardSelected
                      : styles.hotelCard
                  }
                  onClick={() => {
                    setSelectedHotel(hotel);
                    refreshSelectedHotel(hotel);
                  }}
                >
                  <PropertyImage hotel={hotel} />

                  <div style={styles.hotelBody}>
                    <h2 style={styles.hotelName}>
                      {hotel.hotel_name}
                    </h2>

                    <p style={styles.hotelLocation}>
                      {hotel.city}, {hotel.country}
                    </p>

                    <div
                      style={
                        canPay
                          ? styles.rateGood
                          : styles.rateBlocked
                      }
                    >
                      {canPay
                        ? "Live price available"
                        : "Live price unavailable for selected dates"}
                    </div>

                    {canPay ? (
                      <div style={styles.rateBox}>
                        <p>
                          <b>Room:</b>{" "}
                          {hotel.first_rate.room_name}
                        </p>

                        <p>
                          <b>Board:</b>{" "}
                          {hotel.first_rate.board_name}
                        </p>

                        <p>
                          <b>Price:</b>{" "}
                          {hotel.first_rate.currency}{" "}
                          {money(
                            hotel.first_rate.amount
                          )}
                        </p>
                      </div>
                    ) : (
                      <div style={styles.rateBox}>
                        Real-time hotel rate required.
                      </div>
                    )}

                    <div style={styles.buttonPair}>
                      <button
                        style={styles.reserveMini}
                      >
                        Reserve
                      </button>

                      <button
                        style={
                          canPay
                            ? styles.payMini
                            : styles.payDisabled
                        }
                        disabled={!canPay}
                        onClick={(e) => {
                          e.stopPropagation();

                          if (canPay) {
                            requestBooking(hotel);
                          }
                        }}
                      >
                        {canPay
                          ? "Pay"
                          : "Unavailable"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={styles.column}>
          <div style={styles.label}>RESERVE / PAY</div>

          {!selectedHotel ? (
            <div style={styles.emptyBox}>
              Select a hotel.
            </div>
          ) : (
            <div style={styles.reservePanel}>
              <h2 style={styles.hotelName}>
                {selectedHotel.hotel_name}
              </h2>

              {selectedHotel.live_rate_ready &&
              Number(
                selectedHotel?.first_rate?.amount || 0
              ) > 0 ? (
                <div style={styles.selectedPrice}>
                  {selectedHotel.first_rate.currency}{" "}
                  {money(
                    selectedHotel.first_rate.amount
                  )}
                </div>
              ) : (
                <div style={styles.selectedUnavailable}>
                  Live rate unavailable.
                </div>
              )}

              <div style={styles.mapBox}>
                <iframe
                  title="Hotel map"
                  style={styles.map}
                  loading="lazy"
                  src={
                    selectedHotel.latitude &&
                    selectedHotel.longitude
                      ? `https://maps.google.com/maps?q=${selectedHotel.latitude},${selectedHotel.longitude}&z=14&output=embed`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(
                          selectedHotel.hotel_name
                        )}&z=14&output=embed`
                  }
                />
              </div>

              <div style={styles.currencyBox}>
                <div style={styles.currencyTitle}>
                  Currency converter
                </div>

                <div style={styles.currencyRow}>
                  <select
                    style={styles.currencySelect}
                    value={displayCurrency}
                    onChange={(e) =>
                      setDisplayCurrency(
                        e.target.value
                      )
                    }
                  >
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                    <option>NGN</option>
                    <option>AED</option>
                  </select>

                  <button
                    style={styles.convertButton}
                    onClick={convertCurrency}
                  >
                    Convert
                  </button>
                </div>

                <div style={styles.convertedText}>
                  {convertedPrice ||
                    "Select a hotel and convert the total room price."}
                </div>
              </div>

              <input
                style={styles.input}
                value={customerName}
                onChange={(e) =>
                  setCustomerName(e.target.value)
                }
                placeholder="Your full name"
              />

              <input
                style={styles.input}
                value={customerEmail}
                onChange={(e) =>
                  setCustomerEmail(e.target.value)
                }
                placeholder="Your email"
              />

              <input
                style={styles.input}
                value={customerPhone}
                onChange={(e) =>
                  setCustomerPhone(e.target.value)
                }
                placeholder="Phone number"
              />

              <textarea
                style={styles.textarea}
                value={note}
                onChange={(e) =>
                  setNote(e.target.value)
                }
                placeholder="Special requests"
              />

              <button
                style={
                  selectedHotel.live_rate_ready
                    ? styles.payLarge
                    : styles.payDisabledLarge
                }
                disabled={
                  !selectedHotel.live_rate_ready ||
                  requesting
                }
                onClick={() =>
                  requestBooking(selectedHotel)
                }
              >
                {requesting
                  ? "Preparing secure checkout..."
                  : selectedHotel.live_rate_ready
                  ? "Pay securely"
                  : "Live price unavailable"}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#06101f",
    color: "white",
    padding: 18,
    fontFamily: "Arial, sans-serif",
  },

  hero: {
    background:
      "linear-gradient(135deg,#0f2f69,#1e5cc7)",
    borderRadius: 24,
    padding: 24,
    display: "grid",
    gridTemplateColumns: "1.2fr .8fr",
    gap: 20,
    marginBottom: 18,
  },

  brand: {
    letterSpacing: 12,
    fontWeight: 900,
    color: "#ffd34d",
    marginBottom: 10,
  },

  heroTitle: {
    fontSize: 52,
    lineHeight: 1,
    margin: 0,
  },

  heroText: {
    fontSize: 20,
    marginTop: 16,
  },

  buttonRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },

  whiteButton: {
    background: "white",
    color: "#07111f",
    border: 0,
    borderRadius: 14,
    padding: 16,
    fontWeight: 900,
    cursor: "pointer",
  },

  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 18,
  },

  column: {
    background: "#eaf2fb",
    borderRadius: 24,
    padding: 18,
    color: "#07111f",
    height: "74vh",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },

  label: {
    letterSpacing: 4,
    fontWeight: 900,
    color: "#5d708c",
    marginBottom: 12,
  },

  searchBox: {
    background: "white",
    borderRadius: 18,
    padding: 16,
    overflow: "auto",
  },

  formLabel: {
    display: "block",
    fontWeight: 900,
    marginTop: 10,
    marginBottom: 5,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: 13,
    borderRadius: 12,
    border: "1px solid #c8d6e7",
    marginBottom: 10,
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    minHeight: 100,
    padding: 13,
    borderRadius: 12,
    border: "1px solid #c8d6e7",
    marginBottom: 10,
  },

  twoInput: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  goldButton: {
    width: "100%",
    background: "#ffd34d",
    border: 0,
    borderRadius: 14,
    padding: 16,
    fontWeight: 900,
    fontSize: 18,
    cursor: "pointer",
    marginTop: 10,
  },

  notice: {
    background: "#fff2be",
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    fontWeight: 900,
  },

  scroll: {
    overflowY: "auto",
    paddingRight: 5,
  },

  hotelCard: {
    background: "white",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    cursor: "pointer",
  },

  hotelCardSelected: {
    background: "white",
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 16,
    border: "4px solid #ffd34d",
    cursor: "pointer",
  },

  hotelImage: {
    width: "100%",
    height: 220,
    objectFit: "cover",
    display: "block",
  },

  hotelBody: {
    padding: 16,
  },

  hotelName: {
    fontSize: 22,
    margin: "0 0 8px",
    fontWeight: 900,
  },

  hotelLocation: {
    margin: 0,
    color: "#5f6d84",
  },

  rateGood: {
    background: "#dff7e6",
    color: "#075b24",
    padding: 12,
    borderRadius: 12,
    fontWeight: 900,
    margin: "12px 0",
  },

  rateBlocked: {
    background: "#ffe1e1",
    color: "#8a1111",
    padding: 12,
    borderRadius: 12,
    fontWeight: 900,
    margin: "12px 0",
  },

  rateBox: {
    background: "#f4f7fb",
    borderRadius: 14,
    padding: 14,
    lineHeight: 1.5,
    marginBottom: 12,
  },

  buttonPair: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },

  reserveMini: {
    background: "#10254a",
    color: "white",
    border: 0,
    borderRadius: 12,
    padding: 13,
    fontWeight: 900,
    cursor: "pointer",
  },

  payMini: {
    background: "#ffd34d",
    border: 0,
    borderRadius: 12,
    padding: 13,
    fontWeight: 900,
    cursor: "pointer",
  },

  payDisabled: {
    background: "#c8d0dd",
    color: "#4d5560",
    border: 0,
    borderRadius: 12,
    padding: 13,
    fontWeight: 900,
  },

  reservePanel: {
    background: "white",
    borderRadius: 18,
    padding: 16,
    overflow: "auto",
  },

  selectedPrice: {
    fontSize: 36,
    fontWeight: 900,
    color: "#0e4eb7",
    marginBottom: 16,
  },

  selectedUnavailable: {
    background: "#ffe1e1",
    color: "#8a1111",
    padding: 14,
    borderRadius: 12,
    fontWeight: 900,
    marginBottom: 16,
  },

  mapBox: {
    background: "#f4f7fb",
    padding: 8,
    borderRadius: 16,
    marginBottom: 14,
  },

  map: {
    width: "100%",
    height: 190,
    border: 0,
    borderRadius: 12,
  },

  currencyBox: {
    background: "#f4f7fb",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },

  currencyTitle: {
    fontWeight: 900,
    fontSize: 16,
    marginBottom: 10,
  },

  currencyRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 10,
  },

  currencySelect: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #ccd7e5",
  },

  convertButton: {
    background: "#123f87",
    color: "white",
    border: 0,
    borderRadius: 12,
    padding: "12px 18px",
    fontWeight: 900,
    cursor: "pointer",
  },

  convertedText: {
    marginTop: 12,
    fontWeight: 900,
    color: "#123f87",
  },

  payLarge: {
    width: "100%",
    background: "#ffd34d",
    border: 0,
    borderRadius: 14,
    padding: 18,
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 12,
  },

  payDisabledLarge: {
    width: "100%",
    background: "#c8d0dd",
    border: 0,
    borderRadius: 14,
    padding: 18,
    fontSize: 18,
    fontWeight: 900,
    marginTop: 12,
  },

  emptyBox: {
    background: "white",
    borderRadius: 18,
    padding: 22,
    fontWeight: 900,
  },

  realImageMissing: {
    height: 220,
    background:
      "linear-gradient(135deg,#10254a,#1d4da8)",
    color: "white",
    padding: 22,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  imageBadge: {
    letterSpacing: 6,
    fontWeight: 900,
    fontSize: 11,
  },

  imageMissingTitle: {
    fontSize: 24,
    marginTop: 10,
    fontWeight: 900,
  },

  imageMissingText: {
    marginTop: 8,
  },
};
