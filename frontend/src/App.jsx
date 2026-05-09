import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE || "http://127.0.0.1:5050";

export default function App() {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  const [checkin, setCheckin] = useState("2026-05-09");
  const [checkout, setCheckout] = useState("2026-05-10");

  useEffect(() => {
    loadCountries();
  }, []);

  async function loadCountries() {
    try {
      const res = await fetch(`${API_BASE}/countries`);
      const data = await res.json();
      setCountries(data || []);
    } catch (err) {
      console.log(err);
    }
  }

  async function loadCities(value) {
    try {
      const res = await fetch(
        `${API_BASE}/cities?country=${encodeURIComponent(value)}`
      );
      const data = await res.json();
      setCities(data || []);
    } catch (err) {
      console.log(err);
    }
  }

  async function searchHotels(nextCountry, nextCity) {
    if (!nextCountry || !nextCity) {
      setHotels([]);
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE}/hotels?country=${encodeURIComponent(
          nextCountry
        )}&city=${encodeURIComponent(
          nextCity
        )}&checkin=${checkin}&checkout=${checkout}`
      );

      const data = await res.json();

      setHotels(data || []);

      if (data?.length) {
        setSelectedHotel(data[0]);
      } else {
        setSelectedHotel(null);
      }
    } catch (err) {
      console.log(err);
    }
  }

  async function handleCountryChange(value) {
    setCountry(value);
    setCity("");
    setHotels([]);
    setSelectedHotel(null);
    await loadCities(value);
  }

  async function handleCityChange(value) {
    setCity(value);
    await searchHotels(country, value);
  }

  function reserveHotel(hotel) {
    setSelectedHotel(hotel);
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function payHotel(hotel) {
    try {
      const res = await fetch(`${API_BASE}/create-checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotel,
          checkin,
          checkout,
        }),
      });

      const data = await res.json();

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.log(err);
    }
  }

  return (
    <div
      style={{
        background: "#031326",
        minHeight: "100vh",
        padding: 20,
        color: "#07162f",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg,#163b8f,#2458c2)",
          borderRadius: 30,
          padding: 26,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            color: "#ffd84d",
            fontWeight: 900,
            letterSpacing: 10,
            fontSize: 18,
            marginBottom: 12,
          }}
        >
          MYSPACE HOTEL
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 580px",
            gap: 20,
          }}
        >
          <div>
            <div
              style={{
                color: "white",
                fontSize: 58,
                fontWeight: 900,
                lineHeight: 1,
                marginBottom: 20,
              }}
            >
              Find available hotels and pay securely.
            </div>

            <div
              style={{
                color: "white",
                fontSize: 18,
                maxWidth: 900,
              }}
            >
              Search real destinations, review available rooms, reserve your
              stay, and continue through secure payment.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              alignSelf: "center",
            }}
          >
            {["Guide", "FAQ", "Terms", "Contact"].map((item) => (
              <button
                key={item}
                style={{
                  height: 80,
                  borderRadius: 18,
                  border: "none",
                  background: "white",
                  fontWeight: 900,
                  fontSize: 18,
                  cursor: "pointer",
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 18,
        }}
      >
        <div
          style={{
            background: "#d7dfeb",
            borderRadius: 30,
            padding: 20,
            height: "78vh",
            overflow: "auto",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 6,
              marginBottom: 20,
              color: "#5a6c8d",
            }}
          >
            SEARCH
          </div>

          <div
            style={{
              background: "white",
              borderRadius: 24,
              padding: 18,
            }}
          >
            <div
              style={{
                marginBottom: 20,
                color: "#667899",
                fontWeight: 700,
              }}
            >
              Choose your destination and travel dates.
            </div>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  marginBottom: 10,
                  fontWeight: 900,
                  fontSize: 16,
                }}
              >
                Country
              </div>

              <select
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 14,
                  padding: "0 12px",
                  fontSize: 18,
                }}
              >
                <option value="">Select country</option>

                {countries.map((item, index) => (
                  <option key={index} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  marginBottom: 10,
                  fontWeight: 900,
                  fontSize: 16,
                }}
              >
                City
              </div>

              <select
                value={city}
                onChange={(e) => handleCityChange(e.target.value)}
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 14,
                  padding: "0 12px",
                  fontSize: 18,
                }}
              >
                <option value="">Select city</option>

                {cities.map((item, index) => (
                  <option key={index} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div
          style={{
            background: "#d7dfeb",
            borderRadius: 30,
            padding: 20,
            height: "78vh",
            overflow: "auto",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 6,
              marginBottom: 20,
              color: "#5a6c8d",
            }}
          >
            AVAILABLE HOTELS
          </div>

          {!hotels.length && (
            <div
              style={{
                background: "white",
                borderRadius: 24,
                padding: 24,
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              No available hotels loaded for this search. Try another
              destination or date.
            </div>
          )}

          {hotels.map((hotel, index) => (
            <div
              key={index}
              style={{
                background: "white",
                borderRadius: 24,
                overflow: "hidden",
                marginBottom: 20,
                border: "4px solid #f5d24d",
              }}
            >
              <img
                src={hotel.image}
                loading="lazy"
                style={{
                  width: "100%",
                  height: 240,
                  objectFit: "cover",
                }}
              />

              <div style={{ padding: 18 }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 22,
                    marginBottom: 10,
                  }}
                >
                  {hotel.hotel_name}
                </div>

                <div
                  style={{
                    color: "#5b6d8d",
                    marginBottom: 14,
                  }}
                >
                  {hotel.city}, {hotel.country}
                </div>

                <div
                  style={{
                    background: "#d7f0dc",
                    color: "#005f1f",
                    fontWeight: 900,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  Available to reserve
                </div>

                <div
                  style={{
                    background: "#f4f5f8",
                    borderRadius: 18,
                    padding: 14,
                    marginBottom: 18,
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <strong>Room:</strong> {hotel.room_name}
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <strong>Board:</strong> {hotel.board_name}
                  </div>

                  <div>
                    <strong>Price:</strong> {hotel.currency} {hotel.amount}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <button
                    onClick={() => reserveHotel(hotel)}
                    style={{
                      height: 52,
                      borderRadius: 16,
                      border: "none",
                      background: "#0d2761",
                      color: "white",
                      fontWeight: 900,
                      fontSize: 18,
                      cursor: "pointer",
                    }}
                  >
                    Reserve
                  </button>

                  <button
                    onClick={() => payHotel(hotel)}
                    style={{
                      height: 52,
                      borderRadius: 16,
                      border: "none",
                      background: "#f5d04b",
                      color: "black",
                      fontWeight: 900,
                      fontSize: 18,
                      cursor: "pointer",
                    }}
                  >
                    Pay
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: "#d7dfeb",
            borderRadius: 30,
            padding: 20,
            height: "78vh",
            overflow: "auto",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: 6,
              marginBottom: 20,
              color: "#5a6c8d",
            }}
          >
            RESERVE / PAY
          </div>

          {!selectedHotel && (
            <div
              style={{
                background: "white",
                borderRadius: 24,
                padding: 24,
                fontSize: 20,
                fontWeight: 700,
              }}
            >
              Select an available hotel to reserve or pay.
            </div>
          )}

          {selectedHotel && (
            <div
              style={{
                background: "white",
                borderRadius: 24,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 24,
                  marginBottom: 18,
                }}
              >
                {selectedHotel.hotel_name}
              </div>

              <div
                style={{
                  color: "#164ab9",
                  fontWeight: 900,
                  fontSize: 28,
                  marginBottom: 20,
                }}
              >
                {selectedHotel.currency} {selectedHotel.amount}
              </div>

              <img
                src={selectedHotel.image}
                loading="lazy"
                style={{
                  width: "100%",
                  borderRadius: 20,
                  marginBottom: 20,
                }}
              />

              <input
                placeholder="Your full name"
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid #ccd5e0",
                  padding: "0 14px",
                  marginBottom: 12,
                  fontSize: 16,
                }}
              />

              <input
                placeholder="Your email"
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid #ccd5e0",
                  padding: "0 14px",
                  marginBottom: 12,
                  fontSize: 16,
                }}
              />

              <input
                placeholder="Phone number"
                style={{
                  width: "100%",
                  height: 48,
                  borderRadius: 14,
                  border: "1px solid #ccd5e0",
                  padding: "0 14px",
                  marginBottom: 12,
                  fontSize: 16,
                }}
              />

              <textarea
                placeholder="Special requests"
                style={{
                  width: "100%",
                  height: 120,
                  borderRadius: 14,
                  border: "1px solid #ccd5e0",
                  padding: 14,
                  marginBottom: 14,
                  fontSize: 16,
                }}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <button
                  style={{
                    height: 56,
                    borderRadius: 18,
                    border: "none",
                    background: "#0d2761",
                    color: "white",
                    fontWeight: 900,
                    fontSize: 22,
                    cursor: "pointer",
                  }}
                >
                  Reserve
                </button>

                <button
                  onClick={() => payHotel(selectedHotel)}
                  style={{
                    height: 56,
                    borderRadius: 18,
                    border: "none",
                    background: "#f5d04b",
                    color: "black",
                    fontWeight: 900,
                    fontSize: 22,
                    cursor: "pointer",
                  }}
                >
                  Pay
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
