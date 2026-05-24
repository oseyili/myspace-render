import React, { useEffect, useMemo, useState } from "react";

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
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export default function App() {
  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());

  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [stayType, setStayType] = useState("hotel");

  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedHotel, setSelectedHotel] = useState(null);
  const [liveRate, setLiveRate] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const [currency, setCurrency] = useState("GBP");

  useEffect(() => {
    loadDestinations();
  }, []);

  async function loadDestinations() {
    try {
      const res = await fetch(
        `${API_BASE}/api/destinations`
      );

      const data = await res.json();

      const clean =
        (data?.countries || [])
          .filter((x) => x.country)
          .map((x) => ({
            country: x.country,
            cities: (x.cities || [])
              .filter(Boolean)
              .sort((a, b) =>
                a.localeCompare(b)
              )
          }))
          .sort((a, b) =>
            a.country.localeCompare(b.country)
          );

      setDestinations(clean);
    } catch (e) {
      console.log(e);
    }
  }

  const cities = useMemo(() => {
    const found = destinations.find(
      (x) => x.country === country
    );

    return found?.cities || [];
  }, [country, destinations]);

  async function searchHotels() {
    if (!country || !city) {
      alert("Please select country and city");
      return;
    }

    setLoading(true);
    setHotels([]);
    setSelectedHotel(null);
    setLiveRate(null);

    try {
      const url =
        `${API_BASE}/api/hotels/search?` +
        new URLSearchParams({
          country,
          city,
          stay_type: stayType,
          limit: "80"
        });

      const res = await fetch(url);

      const data = await res.json();

      setHotels(data.hotels || []);
    } catch (e) {
      console.log(e);
    }

    setLoading(false);
  }

  async function selectHotel(hotel) {
    setSelectedHotel(hotel);
    setLiveLoading(true);
    setLiveRate(null);

    try {
      const url =
        `${API_BASE}/api/hotels/live-rate?` +
        new URLSearchParams({
          hotel_id:
            hotel.hotelbeds_code ||
            hotel.hotel_id ||
            hotel.id,
          checkin,
          checkout,
          guests: String(guests),
          rooms: String(rooms)
        });

      const res = await fetch(url);

      const data = await res.json();

      setLiveRate(data);
    } catch (e) {
      console.log(e);
    }

    setLiveLoading(false);
  }

  return (
    <div
      style={{
        background: "#eef3fb",
        minHeight: "100vh",
        fontFamily:
          "Inter, Arial, sans-serif"
      }}
    >
      {/* HEADER */}

      <div
        style={{
          background: "#fff",
          padding: "20px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom:
            "1px solid #dde5f0"
        }}
      >
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#081b44"
            }}
          >
            MYSPACE HOTEL
          </div>

          <div
            style={{
              color: "#4c5d7c",
              fontWeight: 700
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
            Destinations
          </button>

          <button style={navBtn}>
            Offers
          </button>

          <button style={navBtn}>
            Help
          </button>

          <button style={yellowBtn}>
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
          padding: 32,
          backgroundImage:
            "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1600')",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        <div
          style={{
            maxWidth: 1500,
            margin: "0 auto"
          }}
        >
          <div
            style={{
              fontSize: 62,
              fontWeight: 900,
              color: "#081b44",
              maxWidth: 700,
              lineHeight: 1.05
            }}
          >
            Find your perfect stay
          </div>

          <div
            style={{
              marginTop: 20,
              fontSize: 22,
              color: "#24385e",
              fontWeight: 700,
              maxWidth: 900
            }}
          >
            Search hotels, apartments,
            villas and trusted stays
            worldwide with secure checkout
            and transparent pricing.
          </div>

          {/* SEARCH BAR */}

          <div
            style={{
              marginTop: 34,
              background: "#fff",
              borderRadius: 24,
              padding: 18,
              display: "grid",
              gridTemplateColumns:
                "1.1fr 1.1fr 1.3fr 1fr 1fr 0.7fr 0.7fr auto",
              gap: 14,
              alignItems: "end",
              boxShadow:
                "0 12px 40px rgba(0,0,0,0.10)"
            }}
          >
            <div>
              <label style={label}>
                Stay type
              </label>

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
              </select>
            </div>

            <div>
              <label style={label}>
                Country
              </label>

              <select
                value={country}
                onChange={(e) => {
                  setCountry(
                    e.target.value
                  );
                  setCity("");
                }}
                style={input}
              >
                <option value="">
                  Select country
                </option>

                {destinations.map((x) => (
                  <option
                    key={x.country}
                    value={x.country}
                  >
                    {x.country}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={label}>
                City
              </label>

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
            </div>

            <div>
              <label style={label}>
                Check-in
              </label>

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
            </div>

            <div>
              <label style={label}>
                Check-out
              </label>

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
            </div>

            <div>
              <label style={label}>
                Guests
              </label>

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
            </div>

            <div>
              <label style={label}>
                Rooms
              </label>

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
            </div>

            <button
              onClick={searchHotels}
              style={{
                background:
                  "#1d4ed8",
                color: "#fff",
                border: "none",
                borderRadius: 16,
                padding:
                  "18px 26px",
                fontSize: 18,
                fontWeight: 900,
                cursor: "pointer",
                height: 58,
                minWidth: 170
              }}
            >
              {loading
                ? "Searching..."
                : "Search stays"}
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT */}

      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          padding: 28,
          display: "grid",
          gridTemplateColumns:
            "1fr 400px",
          gap: 24
        }}
      >
        {/* HOTELS */}

        <div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 900,
              marginBottom: 22,
              color: "#081b44"
            }}
          >
            Available stays
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fill,minmax(360px,1fr))",
              gap: 22
            }}
          >
            {hotels.map((hotel) => (
              <div
                key={
                  hotel.hotel_id
                }
                style={{
                  background: "#fff",
                  borderRadius: 24,
                  overflow: "hidden",
                  boxShadow:
                    "0 10px 30px rgba(0,0,0,0.08)"
                }}
              >
                <img
                  src={
                    hotel.image_url
                  }
                  alt=""
                  style={{
                    width: "100%",
                    height: 240,
                    objectFit:
                      "cover"
                  }}
                />

                <div
                  style={{
                    padding: 20
                  }}
                >
                  <div
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      color:
                        "#081b44"
                    }}
                  >
                    {hotel.name}
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      color:
                        "#4b5f7d",
                      fontWeight: 700
                    }}
                  >
                    {hotel.address},{" "}
                    {hotel.city},{" "}
                    {
                      hotel.country
                    }
                  </div>

                  <div
                    style={{
                      marginTop: 18,
                      background:
                        "#eef6ff",
                      padding: 14,
                      borderRadius: 14,
                      color:
                        "#113d77",
                      fontWeight: 700
                    }}
                  >
                    Live pricing updates
                    automatically when
                    selected.
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      marginTop: 20
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
                        background:
                          "#f4c430",
                        border:
                          "none",
                        borderRadius: 14,
                        padding:
                          "16px 18px",
                        fontWeight: 900,
                        cursor:
                          "pointer"
                      }}
                    >
                      Select Stay
                    </button>

                    <button
                      style={{
                        flex: 1,
                        background:
                          "#fff",
                        border:
                          "2px solid #d8e1f0",
                        borderRadius: 14,
                        padding:
                          "16px 18px",
                        fontWeight: 900,
                        cursor:
                          "pointer"
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

        {/* SIDEBAR */}

        <div>
          <div
            style={{
              background: "#fff",
              borderRadius: 24,
              padding: 24,
              position: "sticky",
              top: 20,
              boxShadow:
                "0 10px 30px rgba(0,0,0,0.08)"
            }}
          >
            <div
              style={{
                fontSize: 38,
                fontWeight: 900,
                color: "#081b44"
              }}
            >
              Reserve / Pay
            </div>

            {selectedHotel && (
              <>
                <div
                  style={{
                    marginTop: 22,
                    fontSize: 28,
                    fontWeight: 900,
                    color:
                      "#081b44"
                  }}
                >
                  {
                    selectedHotel.name
                  }
                </div>

                <div
                  style={{
                    marginTop: 10,
                    color:
                      "#5d6d86",
                    fontWeight: 700
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
                      "#eef8ef",
                    borderRadius: 18,
                    padding: 20
                  }}
                >
                  {liveLoading ? (
                    <div
                      style={{
                        fontWeight: 900
                      }}
                    >
                      Searching live
                      pricing...
                    </div>
                  ) : liveRate?.live_available ? (
                    <>
                      <div
                        style={{
                          fontSize: 18,
                          color:
                            "#2a5f2f",
                          fontWeight: 800
                        }}
                      >
                        Current stay
                        price
                      </div>

                      <div
                        style={{
                          fontSize: 42,
                          fontWeight: 900,
                          marginTop: 8
                        }}
                      >
                        {
                          liveRate
                            .rate
                            ?.currency
                        }{" "}
                        {money(
                          liveRate
                            .rate
                            ?.amount
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          fontWeight: 700,
                          color:
                            "#39573f"
                        }}
                      >
                        {
                          liveRate.customer_message
                        }
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          color:
                            "#7a1d1d"
                        }}
                      >
                        Live rate not
                        available
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          color:
                            "#5f4c4c"
                        }}
                      >
                        Please try
                        another stay or
                        different dates.
                      </div>
                    </>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 22
                  }}
                >
                  <div
                    style={{
                      fontWeight: 900,
                      marginBottom: 8
                    }}
                  >
                    Currency
                  </div>

                  <select
                    value={currency}
                    onChange={(e) =>
                      setCurrency(
                        e.target.value
                      )
                    }
                    style={input}
                  >
                    <option>
                      GBP
                    </option>
                    <option>
                      USD
                    </option>
                    <option>
                      EUR
                    </option>
                  </select>
                </div>

                <button
                  style={{
                    width: "100%",
                    marginTop: 26,
                    background:
                      "#10b981",
                    border: "none",
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 20,
                    padding: 20,
                    borderRadius: 18,
                    cursor: "pointer"
                  }}
                >
                  Continue to secure
                  checkout
                </button>
              </>
            )}

            {!selectedHotel && (
              <div
                style={{
                  marginTop: 20,
                  color: "#5a6c84",
                  fontWeight: 700
                }}
              >
                Select a stay to view
                live pricing and
                continue securely.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const label = {
  display: "block",
  marginBottom: 8,
  fontWeight: 800,
  color: "#081b44"
};

const input = {
  width: "100%",
  height: 48,
  borderRadius: 12,
  border: "1px solid #cfd9ea",
  padding: "0 14px",
  fontSize: 16,
  boxSizing: "border-box"
};

const navBtn = {
  background: "#fff",
  border: "1px solid #dbe3ef",
  borderRadius: 12,
  padding: "12px 18px",
  fontWeight: 800,
  cursor: "pointer"
};

const yellowBtn = {
  background: "#f4c430",
  border: "none",
  borderRadius: 14,
  padding: "14px 22px",
  fontWeight: 900,
  cursor: "pointer"
};

const outlineBtn = {
  background: "#fff",
  border: "2px solid #dbe3ef",
  borderRadius: 14,
  padding: "14px 22px",
  fontWeight: 900,
  cursor: "pointer"
};