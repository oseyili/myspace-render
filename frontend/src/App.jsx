import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
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
    ? n.toFixed(2)
    : "0.00";
}

export default function App() {
  const [destinations, setDestinations] =
    useState([]);

  const [country, setCountry] =
    useState("");

  const [city, setCity] =
    useState("");

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

  const [loading, setLoading] =
    useState(false);

  const [hotels, setHotels] =
    useState([]);

  const [selectedHotel, setSelectedHotel] =
    useState(null);

  const [liveRate, setLiveRate] =
    useState(null);

  const [rateLoading, setRateLoading] =
    useState(false);

  const [checkoutLoading, setCheckoutLoading] =
    useState(false);

  useEffect(() => {
    loadDestinations();
  }, []);

  async function loadDestinations() {
    try {
      const res = await fetch(
        `${API_BASE}/api/destinations`
      );

      const data = await res.json();

      const countries = Array.isArray(
        data.countries
      )
        ? data.countries
        : [];

      setDestinations(countries);

      if (countries.length > 0) {
        setCountry(countries[0].country);

        if (
          countries[0].cities?.length
        ) {
          setCity(
            countries[0].cities[0]
              .city
          );
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  const cities = useMemo(() => {
    const found =
      destinations.find(
        (x) =>
          x.country === country
      );

    return Array.isArray(
      found?.cities
    )
      ? found.cities
      : [];
  }, [country, destinations]);

  useEffect(() => {
    if (
      cities.length &&
      !cities.find(
        (x) => x.city === city
      )
    ) {
      setCity(cities[0].city);
    }
  }, [cities]);

  async function searchHotels() {
    if (!country || !city) {
      return;
    }

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
        )}&limit=100`
      );

      const data = await res.json();

      setHotels(
        Array.isArray(
          data.hotels
        )
          ? data.hotels
          : []
      );
    } catch (e) {
      console.error(e);
    }

    setLoading(false);
  }

  async function loadRate(
    hotel
  ) {
    setSelectedHotel(hotel);

    setRateLoading(true);

    setLiveRate(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/hotels/live-rate?hotel_id=${encodeURIComponent(
          hotel.hotel_id
        )}&checkin=${checkin}&checkout=${checkout}&guests=${guests}&rooms=${rooms}`
      );

      const data = await res.json();

      setLiveRate(data);
    } catch (e) {
      console.error(e);
    }

    setRateLoading(false);
  }

  async function checkoutNow() {
    if (
      !liveRate?.rate?.amount
    ) {
      return;
    }

    setCheckoutLoading(true);

    try {
      const res = await fetch(
        `${API_BASE}/api/create-checkout-session`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            hotel_id:
              selectedHotel.hotel_id,

            hotel_name:
              selectedHotel.hotel_name,

            amount:
              liveRate.rate.amount,

            currency:
              liveRate.rate.currency,

            rate_key:
              liveRate.rate.rate_key,

            rate_status:
              liveRate.rate_status,

            checkin,
            checkout
          })
        }
      );

      const data = await res.json();

      if (data.url) {
        window.location.href =
          data.url;
      }
    } catch (e) {
      console.error(e);
    }

    setCheckoutLoading(false);
  }

  return (
    <div style={styles.page}>
      <div style={styles.hero}>
        <div
          style={styles.heroOverlay}
        >
          <div style={styles.logo}>
            MySpace Hotel
          </div>

          <h1 style={styles.heroTitle}>
            Book trusted global
            stays with confidence
          </h1>

          <p
            style={
              styles.heroText
            }
          >
            Hotels, apartments,
            villas and premium
            stays across 113+
            countries and
            thousands of cities.
          </p>

          <div
            style={
              styles.badges
            }
          >
            <div
              style={
                styles.badge
              }
            >
              Verified global
              stays
            </div>

            <div
              style={
                styles.badge
              }
            >
              Live supplier
              pricing
            </div>

            <div
              style={
                styles.badge
              }
            >
              Secure checkout
            </div>

            <div
              style={
                styles.badge
              }
            >
              PMS/API ready
            </div>
          </div>
        </div>
      </div>

      <div style={styles.searchBox}>
        <div
          style={
            styles.searchGrid
          }
        >
          <div
            style={
              styles.searchCell
            }
          >
            <label>
              Stay Type
            </label>

            <select
              value={stayType}
              onChange={(e) =>
                setStayType(
                  e.target.value
                )
              }
            >
              <option value="hotel">
                Hotels only
              </option>

              <option value="other">
                Other stays only
              </option>

              <option value="both">
                Hotels + other
                stays
              </option>
            </select>
          </div>

          <div
            style={
              styles.searchCell
            }
          >
            <label>
              Country
            </label>

            <select
              value={country}
              onChange={(e) =>
                setCountry(
                  e.target.value
                )
              }
            >
              {destinations.map(
                (c) => (
                  <option
                    key={
                      c.country
                    }
                    value={
                      c.country
                    }
                  >
                    {c.country}
                  </option>
                )
              )}
            </select>
          </div>

          <div
            style={
              styles.searchCell
            }
          >
            <label>City</label>

            <select
              value={city}
              onChange={(e) =>
                setCity(
                  e.target.value
                )
              }
            >
              {cities.map((c) => (
                <option
                  key={c.city}
                  value={c.city}
                >
                  {c.city}
                </option>
              ))}
            </select>
          </div>

          <div
            style={
              styles.searchCell
            }
          >
            <label>
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
            />
          </div>

          <div
            style={
              styles.searchCell
            }
          >
            <label>
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
            />
          </div>

          <div
            style={
              styles.searchCell
            }
          >
            <label>
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
            />
          </div>

          <div
            style={
              styles.searchCell
            }
          >
            <label>
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
            />
          </div>

          <button
            style={
              styles.searchButton
            }
            onClick={
              searchHotels
            }
          >
            {loading
              ? "Searching..."
              : "Search stays"}
          </button>
        </div>
      </div>

      <div style={styles.main}>
        <div style={styles.results}>
          {hotels.map((hotel) => (
            <div
              key={
                hotel.hotel_id
              }
              style={
                styles.hotelCard
              }
            >
              <img
                src={
                  hotel.image_url
                }
                alt={
                  hotel.hotel_name
                }
                style={
                  styles.hotelImage
                }
              />

              <div
                style={
                  styles.hotelInfo
                }
              >
                <div
                  style={
                    styles.hotelName
                  }
                >
                  {
                    hotel.hotel_name
                  }
                </div>

                <div
                  style={
                    styles.meta
                  }
                >
                  {
                    hotel.city
                  }
                  ,{" "}
                  {
                    hotel.country
                  }
                </div>

                <div
                  style={
                    styles.meta
                  }
                >
                  {
                    hotel.address
                  }
                </div>

                <button
                  style={
                    styles.rateButton
                  }
                  onClick={() =>
                    loadRate(
                      hotel
                    )
                  }
                >
                  View live rate
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.sidebar}>
          <div
            style={
              styles.sideCard
            }
          >
            <div
              style={
                styles.sideTitle
              }
            >
              Live Rate Engine
            </div>

            {selectedHotel && (
              <>
                <div
                  style={
                    styles.selected
                  }
                >
                  {
                    selectedHotel.hotel_name
                  }
                </div>

                {rateLoading && (
                  <div>
                    Searching live
                    supplier
                    systems and
                    saved hotelbeds
                    rates...
                  </div>
                )}

                {!rateLoading &&
                  liveRate?.ok &&
                  liveRate?.rate && (
                    <>
                      <div
                        style={
                          styles.price
                        }
                      >
                        {
                          liveRate
                            .rate
                            .currency
                        }{" "}
                        {money(
                          liveRate
                            .rate
                            .amount
                        )}
                      </div>

                      {liveRate.rate_status ===
                        "fresh_live" && (
                        <div
                          style={
                            styles.liveBox
                          }
                        >
                          Fresh live
                          supplier
                          rate
                          confirmed
                        </div>
                      )}

                      {liveRate.rate_status ===
                        "saved_recent" && (
                        <div
                          style={
                            styles.warningBox
                          }
                        >
                          {
                            liveRate.warning
                          }
                        </div>
                      )}

                      <button
                        style={
                          styles.checkoutButton
                        }
                        onClick={
                          checkoutNow
                        }
                      >
                        {checkoutLoading
                          ? "Opening secure checkout..."
                          : "Continue to secure checkout"}
                      </button>
                    </>
                  )}

                {!rateLoading &&
                  liveRate &&
                  !liveRate.ok && (
                    <div
                      style={
                        styles.errorBox
                      }
                    >
                      No live or
                      saved supplier
                      rate available
                      for this stay.
                    </div>
                  )}
              </>
            )}
          </div>

          <div
            style={
              styles.sideCard
            }
          >
            <div
              style={
                styles.sideTitle
              }
            >
              Why travellers
              choose MySpace
              Hotel
            </div>

            <ul
              style={
                styles.list
              }
            >
              <li>
                Global stay
                inventory
              </li>

              <li>
                Live supplier
                integrations
              </li>

              <li>
                Secure payment
                processing
              </li>

              <li>
                Professional
                travel support
              </li>

              <li>
                PMS/API
                partnership
                ready
              </li>
            </ul>
          </div>

          <div
            style={
              styles.sideCard
            }
          >
            <div
              style={
                styles.sideTitle
              }
            >
              Terms &
              Conditions
            </div>

            <div
              style={
                styles.terms
              }
            >
              MySpace Hotel
              operates as a
              travel technology
              and accommodation
              booking platform
              connecting guests
              with hotels,
              accommodation
              providers and
              travel partners
              worldwide. Final
              room availability,
              taxes, resort
              fees, local
              charges,
              cancellation
              policies and
              supplier approval
              remain subject to
              supplier systems
              and local hotel
              rules at the time
              of confirmation.
              Saved supplier
              rates shown
              during temporary
              supplier outages
              are displayed for
              convenience and
              may require final
              supplier
              reconfirmation
              before issuance
              or ticketing.
              MySpace Hotel
              reserves the
              right to cancel,
              amend or
              reconfirm
              bookings where
              supplier pricing
              errors,
              connectivity
              issues, fraud
              prevention,
              payment failures
              or force majeure
              events occur.
            </div>
          </div>
        </div>
      </div>

      <div
        style={
          styles.featureSection
        }
      >
        <div
          style={
            styles.featureCard
          }
        >
          <div
            style={
              styles.featureTitle
            }
          >
            Global partner
            ecosystem
          </div>

          <div
            style={
              styles.featureText
            }
          >
            Hotels, PMS
            providers, channel
            managers and API
            integrations ready
            for scalable
            global growth.
          </div>
        </div>

        <div
          style={
            styles.featureCard
          }
        >
          <div
            style={
              styles.featureTitle
            }
          >
            Supplier-backed
            pricing
          </div>

          <div
            style={
              styles.featureText
            }
          >
            Live supplier
            integrations and
            saved harvested
            rates help maintain
            global search
            continuity during
            supplier downtime.
          </div>
        </div>

        <div
          style={
            styles.featureCard
          }
        >
          <div
            style={
              styles.featureTitle
            }
          >
            Professional
            booking platform
          </div>

          <div
            style={
              styles.featureText
            }
          >
            Built for global
            travellers seeking
            secure, transparent
            and scalable stay
            booking.
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    background: "#07111f",
    minHeight: "100vh",
    color: "#fff",
    fontFamily:
      "Arial, sans-serif"
  },

  hero: {
    background:
      "linear-gradient(135deg,#081120,#12233d)",
    padding:
      "60px 40px"
  },

  heroOverlay: {
    maxWidth: 1400,
    margin: "0 auto"
  },

  logo: {
    fontSize: 20,
    fontWeight: 900,
    color: "#4da3ff",
    marginBottom: 16
  },

  heroTitle: {
    fontSize: 54,
    margin: 0,
    lineHeight: 1.1,
    maxWidth: 850
  },

  heroText: {
    fontSize: 20,
    color: "#cbd5e1",
    maxWidth: 850,
    marginTop: 20
  },

  badges: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 28
  },

  badge: {
    background: "#0f172a",
    padding:
      "12px 16px",
    borderRadius: 999
  },

  searchBox: {
    maxWidth: 1500,
    margin:
      "-35px auto 20px",
    background: "#0f172a",
    borderRadius: 28,
    padding: 24
  },

  searchGrid: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr 1fr .9fr .9fr .7fr .7fr 1fr",
    gap: 14,
    alignItems: "end"
  },

  searchCell: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },

  searchButton: {
    border: 0,
    background: "#1857df",
    color: "#fff",
    fontWeight: 900,
    fontSize: 16,
    borderRadius: 18,
    minHeight: 66,
    cursor: "pointer"
  },

  main: {
    display: "grid",
    gridTemplateColumns:
      "1.45fr .8fr",
    gap: 22,
    padding:
      "20px 40px"
  },

  results: {
    display: "grid",
    gap: 18
  },

  hotelCard: {
    background: "#0f172a",
    borderRadius: 24,
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns:
      "320px 1fr"
  },

  hotelImage: {
    width: "100%",
    height: 260,
    objectFit: "cover"
  },

  hotelInfo: {
    padding: 22
  },

  hotelName: {
    fontSize: 26,
    fontWeight: 900,
    marginBottom: 12
  },

  meta: {
    color: "#cbd5e1",
    marginBottom: 10
  },

  rateButton: {
    border: 0,
    background: "#1857df",
    color: "#fff",
    padding:
      "14px 18px",
    borderRadius: 14,
    marginTop: 16,
    cursor: "pointer",
    fontWeight: 900
  },

  sidebar: {
    display: "grid",
    gap: 20,
    alignContent: "start"
  },

  sideCard: {
    background: "#0f172a",
    borderRadius: 24,
    padding: 24
  },

  sideTitle: {
    fontSize: 24,
    fontWeight: 900,
    marginBottom: 20
  },

  selected: {
    fontWeight: 800,
    marginBottom: 16
  },

  price: {
    fontSize: 46,
    fontWeight: 900,
    marginBottom: 18
  },

  liveBox: {
    background: "#14532d",
    padding: 14,
    borderRadius: 14,
    marginBottom: 18
  },

  warningBox: {
    background: "#7c2d12",
    padding: 14,
    borderRadius: 14,
    marginBottom: 18,
    color: "#fff7ed"
  },

  errorBox: {
    background: "#7f1d1d",
    padding: 14,
    borderRadius: 14
  },

  checkoutButton: {
    width: "100%",
    border: 0,
    background: "#16a34a",
    color: "#fff",
    padding:
      "18px 20px",
    borderRadius: 18,
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer"
  },

  list: {
    color: "#cbd5e1",
    lineHeight: 2
  },

  terms: {
    color: "#cbd5e1",
    lineHeight: 1.8
  },

  featureSection: {
    display: "grid",
    gridTemplateColumns:
      "repeat(3,1fr)",
    gap: 20,
    padding:
      "20px 40px 60px"
  },

  featureCard: {
    background: "#0f172a",
    borderRadius: 24,
    padding: 28
  },

  featureTitle: {
    fontSize: 24,
    fontWeight: 900,
    marginBottom: 16
  },

  featureText: {
    color: "#cbd5e1",
    lineHeight: 1.7
  }
};