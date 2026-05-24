import React, { useEffect, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://myspace-hotel-backend.onrender.com";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000)
    .toISOString()
    .slice(0, 10);
}

function money(v) {
  const n = Number(v || 0);

  return Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    : "0.00";
}

export default function App() {
  const [countries, setCountries] =
    useState([]);

  const [cities, setCities] =
    useState([]);

  const [country, setCountry] =
    useState("");

  const [city, setCity] = useState("");

  const [stayType, setStayType] =
    useState("hotel");

  const [checkin, setCheckin] =
    useState(todayISO());

  const [checkout, setCheckout] =
    useState(tomorrowISO());

  const [guests, setGuests] =
    useState(2);

  const [rooms, setRooms] =
    useState(1);

  const [hotels, setHotels] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [selectedHotel, setSelectedHotel] =
    useState(null);

  const [liveRate, setLiveRate] =
    useState(null);

  const [currency, setCurrency] =
    useState("GBP");

  useEffect(() => {
    loadDestinations();
  }, []);

  async function loadDestinations() {
    try {
      const res = await fetch(
        `${API_BASE}/api/destinations`
      );

      const data = await res.json();

      setCountries(
        Array.isArray(data.countries)
          ? data.countries
          : []
      );
    } catch (err) {
      console.log(err);
    }
  }

  useEffect(() => {
    const selected = countries.find(
      (x) => x.country === country
    );

    if (!selected) {
      setCities([]);
      return;
    }

    setCities(selected.cities || []);
  }, [country, countries]);

  async function searchHotels() {
    if (!country || !city) return;

    setLoading(true);

    setHotels([]);

    setSelectedHotel(null);

    setLiveRate(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/hotels/search?country=${encodeURIComponent(
          country
        )}&city=${encodeURIComponent(
          city
        )}&stay_type=${encodeURIComponent(
          stayType
        )}&limit=60`
      );

      const data = await res.json();

      setHotels(data.hotels || []);
    } catch (err) {
      console.log(err);
    }

    setLoading(false);
  }

  async function selectHotel(hotel) {
    setSelectedHotel(hotel);

    setLiveRate({
      loading: true
    });

    try {
      const res = await fetch(
        `${API_BASE}/api/hotels/live-rate?hotel_id=${encodeURIComponent(
          hotel.hotel_id || hotel.id
        )}&checkin=${checkin}&checkout=${checkout}&guests=${guests}&rooms=${rooms}`
      );

      const data = await res.json();

      setLiveRate(data);
    } catch (err) {
      setLiveRate({
        ok: false,
        customer_message:
          "Pricing is temporarily unavailable."
      });
    }
  }

  return (
    <div
      style={{
        background: "#f4f7fb",
        minHeight: "100vh",
        fontFamily:
          "Inter, Arial, sans-serif"
      }}
    >
      {/* HEADER */}

      <div
        style={{
          background: "#fff",
          padding: "22px 36px",
          borderBottom:
            "1px solid #e5e7eb",
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          position: "sticky",
          top: 0,
          zIndex: 50
        }}
      >
        <div>
          <div
            style={{
              fontSize: 54,
              fontWeight: 900,
              color: "#071437",
              lineHeight: 1
            }}
          >
            MYSPACE HOTEL
          </div>

          <div
            style={{
              marginTop: 6,
              fontWeight: 600,
              color: "#6b7280",
              fontSize: 18
            }}
          >
            Stay with clarity
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center"
          }}
        >
          <button style={navBtn}>
            Stays
          </button>

          <button style={navBtn}>
            Destinations
          </button>

          <button style={navBtn}>
            Offers
          </button>

          <button style={navBtn}>
            Help
          </button>

          <select
            value={currency}
            onChange={(e) =>
              setCurrency(
                e.target.value
              )
            }
            style={currencyBox}
          >
            <option>GBP</option>
            <option>USD</option>
            <option>EUR</option>
          </select>

          <button style={goldBtn}>
            Partner Application Form
          </button>

          <button style={outlineBtn}>
            Partner Login
          </button>
        </div>
      </div>

      {/* HERO */}

      <div
        style={{
          padding:
            "70px 40px 100px",
          backgroundImage:
            "url(https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2200&auto=format&fit=crop)",
          backgroundSize: "cover",
          backgroundPosition:
            "center"
        }}
      >
        <div
          style={{
            maxWidth: 1100
          }}
        >
          <div
            style={{
              color: "#2563eb",
              fontWeight: 900,
              fontSize: 26
            }}
          >
            Trusted stays. Clear
            pricing. Worldwide
            support.
          </div>

          <div
            style={{
              marginTop: 24,
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1,
              color: "#071437"
            }}
          >
            Find your perfect stay
          </div>

          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              lineHeight: 1.45,
              color: "#1f2937",
              maxWidth: 1000,
              fontWeight: 600
            }}
          >
            Search hotels,
            apartments, villas and
            accommodation worldwide
            with transparent pricing
            and secure checkout.
          </div>
        </div>

        {/* SEARCH */}

        <div
          style={{
            marginTop: 50,
            background: "#fff",
            borderRadius: 32,
            padding: 28,
            boxShadow:
              "0 20px 60px rgba(0,0,0,0.12)"
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1.2fr 1fr 1.2fr 1fr 1fr 0.7fr 0.7fr auto",
              gap: 18,
              alignItems: "end"
            }}
          >
            <Field label="Stay type">
              <select
                value={stayType}
                onChange={(e) =>
                  setStayType(
                    e.target.value
                  )
                }
                style={input}
              >
                <option value="hotel">
                  Hotels only
                </option>

                <option value="apartment">
                  Apartments only
                </option>

                <option value="villa">
                  Villas only
                </option>

                <option value="all">
                  Hotels and apartments
                </option>
              </select>
            </Field>

            <Field label="Country">
              <select
                value={country}
                onChange={(e) =>
                  setCountry(
                    e.target.value
                  )
                }
                style={input}
              >
                <option value="">
                  Select country
                </option>

                {countries.map((c) => (
                  <option
                    key={c.country}
                    value={c.country}
                  >
                    {c.country}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="City">
              <select
                value={city}
                onChange={(e) =>
                  setCity(
                    e.target.value
                  )
                }
                style={input}
              >
                <option value="">
                  Select city
                </option>

                {cities.map((c) => (
                  <option
                    key={c}
                    value={c}
                  >
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Check-in">
              <input
                type="date"
                value={checkin}
                onChange={(e) =>
                  setCheckin(
                    e.target.value
                  )
                }
                style={input}
              />
            </Field>

            <Field label="Check-out">
              <input
                type="date"
                value={checkout}
                onChange={(e) =>
                  setCheckout(
                    e.target.value
                  )
                }
                style={input}
              />
            </Field>

            <Field label="Guests">
              <input
                type="number"
                min="1"
                value={guests}
                onChange={(e) =>
                  setGuests(
                    e.target.value
                  )
                }
                style={input}
              />
            </Field>

            <Field label="Rooms">
              <input
                type="number"
                min="1"
                value={rooms}
                onChange={(e) =>
                  setRooms(
                    e.target.value
                  )
                }
                style={input}
              />
            </Field>

            <button
              onClick={searchHotels}
              style={{
                height: 60,
                width: 180,
                border: "none",
                borderRadius: 18,
                background:
                  "#2563eb",
                color: "#fff",
                fontSize: 24,
                fontWeight: 900,
                cursor: "pointer"
              }}
            >
              Search stays
            </button>
          </div>
        </div>
      </div>

      {/* MAIN */}

      <div
        style={{
          padding: "40px",
          display: "grid",
          gridTemplateColumns:
            "1fr 420px",
          gap: 32
        }}
      >
        {/* LEFT */}

        <div>
          {loading && (
            <div
              style={{
                fontSize: 28,
                fontWeight: 900
              }}
            >
              Searching stays...
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill,minmax(420px,1fr))",
              gap: 28
            }}
          >
            {hotels.map((hotel) => (
              <div
                key={
                  hotel.hotel_id ||
                  hotel.id
                }
                style={hotelCard}
              >
                <img
                  src={hotel.image_url}
                  alt={hotel.name}
                  style={{
                    width: "100%",
                    height: 280,
                    objectFit: "cover"
                  }}
                />

                <div
                  style={{
                    padding: 24
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent:
                        "space-between",
                      fontWeight: 800,
                      color: "#2563eb"
                    }}
                  >
                    <span>
                      Verified stay
                    </span>

                    <span>
                      Live pricing
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 18,
                      fontSize: 38,
                      fontWeight: 900,
                      color: "#071437",
                      lineHeight: 1.1
                    }}
                  >
                    {hotel.name}
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      color: "#374151",
                      fontSize: 20
                    }}
                  >
                    {hotel.address},{" "}
                    {hotel.city},{" "}
                    {hotel.country}
                  </div>

                  <div
                    style={{
                      marginTop: 22,
                      background:
                        "#f4f7fb",
                      borderRadius: 18,
                      padding: 18
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 900,
                        fontSize: 22
                      }}
                    >
                      Fresh price check
                    </div>

                    <div
                      style={{
                        marginTop: 8,
                        color: "#4b5563",
                        fontSize: 17
                      }}
                    >
                      Latest available
                      pricing is checked
                      after selection.
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 14,
                      marginTop: 24
                    }}
                  >
                    <button
                      onClick={() =>
                        selectHotel(
                          hotel
                        )
                      }
                      style={{
                        flex: 1,
                        border: "none",
                        borderRadius: 16,
                        background:
                          "#f4c430",
                        padding:
                          "18px 0",
                        fontWeight: 900,
                        fontSize: 22,
                        cursor: "pointer"
                      }}
                    >
                      Select Stay
                    </button>

                    <button
                      style={{
                        flex: 1,
                        borderRadius: 16,
                        border:
                          "2px solid #dbe2ea",
                        background:
                          "#fff",
                        padding:
                          "18px 0",
                        fontWeight: 800,
                        fontSize: 22
                      }}
                    >
                      Guide / Map
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}

        <div
          style={{
            position: "sticky",
            top: 110,
            alignSelf: "start",
            background: "#fff",
            borderRadius: 28,
            padding: 28,
            boxShadow:
              "0 10px 40px rgba(0,0,0,0.08)"
          }}
        >
          <div
            style={{
              fontSize: 46,
              fontWeight: 900,
              color: "#071437"
            }}
          >
            Reserve / Pay
          </div>

          {!selectedHotel && (
            <div
              style={{
                marginTop: 24,
                fontSize: 22,
                color: "#6b7280"
              }}
            >
              Select a stay to
              continue.
            </div>
          )}

          {selectedHotel && (
            <>
              <div
                style={{
                  marginTop: 24,
                  fontSize: 30,
                  fontWeight: 900
                }}
              >
                {selectedHotel.name}
              </div>

              <div
                style={{
                  marginTop: 12,
                  color: "#4b5563",
                  fontSize: 18
                }}
              >
                {
                  selectedHotel.address
                }
              </div>

              <div
                style={{
                  marginTop: 24,
                  background:
                    "#ecfdf3",
                  borderRadius: 22,
                  padding: 24
                }}
              >
                {liveRate?.loading && (
                  <div
                    style={{
                      fontWeight: 900,
                      fontSize: 24
                    }}
                  >
                    Searching latest
                    price...
                  </div>
                )}

                {!liveRate?.loading &&
                  liveRate?.ok &&
                  liveRate?.rate && (
                    <>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 22
                        }}
                      >
                        Stay total
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          fontSize: 52,
                          fontWeight: 900
                        }}
                      >
                        {
                          liveRate.rate
                            .currency
                        }{" "}
                        {money(
                          liveRate
                            .rate
                            .amount
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          color: "#374151"
                        }}
                      >
                        {
                          liveRate.customer_message
                        }
                      </div>
                    </>
                  )}

                {!liveRate?.loading &&
                  !liveRate?.ok && (
                    <>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 24,
                          color:
                            "#b91c1c"
                        }}
                      >
                        Live pricing
                        unavailable
                      </div>

                      <div
                        style={{
                          marginTop: 12,
                          color: "#374151"
                        }}
                      >
                        {
                          liveRate.customer_message
                        }
                      </div>
                    </>
                  )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children
}) {
  return (
    <div>
      <div
        style={{
          marginBottom: 10,
          fontWeight: 900,
          fontSize: 18,
          color: "#071437"
        }}
      >
        {label}
      </div>

      {children}
    </div>
  );
}

const input = {
  width: "100%",
  height: 58,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  padding: "0 14px",
  fontSize: 18
};

const navBtn = {
  border: "1px solid #d1d5db",
  background: "#fff",
  borderRadius: 12,
  padding: "12px 18px",
  fontWeight: 700,
  cursor: "pointer"
};

const currencyBox = {
  height: 48,
  borderRadius: 12,
  border: "1px solid #d1d5db",
  padding: "0 10px",
  fontWeight: 700
};

const goldBtn = {
  border: "none",
  background: "#f4c430",
  borderRadius: 14,
  padding: "14px 22px",
  fontWeight: 900,
  cursor: "pointer"
};

const outlineBtn = {
  border: "1px solid #cbd5e1",
  background: "#fff",
  borderRadius: 14,
  padding: "14px 22px",
  fontWeight: 800,
  cursor: "pointer"
};

const hotelCard = {
  background: "#fff",
  borderRadius: 28,
  overflow: "hidden",
  boxShadow:
    "0 10px 40px rgba(0,0,0,0.08)"
};