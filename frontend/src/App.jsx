cd C:\frontend\hotel-booking-app\frontend

# Stop frontend first in THIS SAME WINDOW
# Press Ctrl+C

@'
import React, { useEffect, useMemo, useState } from "react";

const API =
  import.meta.env.VITE_API_BASE ||
  "https://myspace-hotel-backend.onrender.com";

const FALLBACK_DESTINATIONS = [
  {
    country: "United Kingdom",
    cities: ["London", "Manchester", "Liverpool", "Birmingham"]
  },
  {
    country: "France",
    cities: ["Paris", "Nice", "Lyon", "Marseille"]
  },
  {
    country: "United States",
    cities: ["New York", "Miami", "Los Angeles", "Las Vegas"]
  },
  {
    country: "United Arab Emirates",
    cities: ["Dubai", "Abu Dhabi"]
  },
  {
    country: "Spain",
    cities: ["Barcelona", "Madrid", "Valencia"]
  },
  {
    country: "Nigeria",
    cities: ["Lagos", "Abuja", "Benin City"]
  }
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000)
    .toISOString()
    .slice(0, 10);
}

function money(v) {
  return Number(v || 0).toFixed(2);
}

export default function App() {
  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(tomorrowISO());

  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [currency, setCurrency] = useState("GBP");

  const [loading, setLoading] = useState(false);

  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const [activePage, setActivePage] = useState("home");

  useEffect(() => {
    loadDestinations();
  }, []);

  async function loadDestinations() {
    try {
      const res = await fetch(
        `${API}/api/real-catalog/destinations`,
        { cache: "no-store" }
      );

      const data = await res.json();

      const normalized = normalizeDestinations(data);

      setDestinations(
        normalized.length
          ? normalized
          : FALLBACK_DESTINATIONS
      );
    } catch {
      setDestinations(FALLBACK_DESTINATIONS);
    }
  }

  function normalizeDestinations(payload) {
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.countries)
        ? payload.countries
        : Array.isArray(payload?.destinations)
          ? payload.destinations
          : [];

    return rows
      .map((x) => ({
        country:
          x.country ||
          x.name ||
          "",
        cities:
          Array.isArray(x.cities)
            ? x.cities.map((c) =>
                typeof c === "string"
                  ? c
                  : c.city || c.name || ""
              )
            : []
      }))
      .filter(
        (x) =>
          x.country &&
          x.cities.length
      );
  }

  const cities = useMemo(() => {
    const found = destinations.find(
      (x) => x.country === country
    );

    return found?.cities || [];
  }, [country, destinations]);

  async function searchHotels() {
    if (!country || !city) {
      alert("Please choose country and city.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/api/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          country,
          city,
          check_in: checkIn,
          check_out: checkOut,
          guests,
          rooms
        })
      });

      const data = await res.json();

      setHotels(data.hotels || []);
    } catch {
      alert("Hotel search failed.");
    }

    setLoading(false);
  }

  async function payNow(hotel) {
    try {
      const res = await fetch(
        `${API}/api/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            hotel_name:
              hotel.hotel_name ||
              hotel.name,
            amount:
              Number(
                hotel.price ||
                hotel.first_rate?.net ||
                100
              ),
            currency:
              currency.toLowerCase()
          })
        }
      );

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Stripe payment failed.");
      }
    } catch {
      alert("Stripe payment failed.");
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logoBox}>
          <div style={styles.logo}>
            ✦
          </div>

          <div>
            <div style={styles.brand}>
              MYSPACE HOTEL
            </div>

            <div style={styles.tag}>
              Stay with clarity
            </div>
          </div>
        </div>

        <div style={styles.nav}>
          <button
            style={styles.navBtn}
            onClick={() =>
              setActivePage("home")
            }
          >
            Stays
          </button>

          <button
            style={styles.navBtn}
            onClick={() =>
              setActivePage("destinations")
            }
          >
            Destinations
          </button>

          <button
            style={styles.navBtn}
            onClick={() =>
              setActivePage("offers")
            }
          >
            Offers
          </button>

          <button
            style={styles.navBtn}
            onClick={() =>
              setActivePage("help")
            }
          >
            Help
          </button>

          <select
            value={currency}
            onChange={(e) =>
              setCurrency(
                e.target.value
              )
            }
            style={styles.currency}
          >
            <option>GBP</option>
            <option>USD</option>
            <option>EUR</option>
          </select>

          <button
            style={styles.partnerBtn}
            onClick={() =>
              setActivePage("partner")
            }
          >
            Hotel / Partner Login
          </button>
        </div>
      </header>

      {activePage === "home" && (
        <>
          <section style={styles.hero}>
            <div style={styles.heroOverlay} />

            <div style={styles.heroContent}>
              <h1 style={styles.heroTitle}>
                Find your perfect stay
              </h1>

              <div style={styles.heroText}>
                Search 100,000+ hotels and apartments worldwide
              </div>

              <div style={styles.searchCard}>
                <div>
                  <div style={styles.label}>
                    Country
                  </div>

                  <select
                    value={country}
                    onChange={(e) => {
                      setCountry(
                        e.target.value
                      );
                      setCity("");
                    }}
                    style={styles.input}
                  >
                    <option value="">
                      Select country
                    </option>

                    {destinations.map((d) => (
                      <option
                        key={d.country}
                        value={d.country}
                      >
                        {d.country}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div style={styles.label}>
                    Destination
                  </div>

                  <select
                    value={city}
                    onChange={(e) =>
                      setCity(
                        e.target.value
                      )
                    }
                    style={styles.input}
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
                  <div style={styles.label}>
                    Check-in
                  </div>

                  <input
                    type="date"
                    value={checkIn}
                    onChange={(e) =>
                      setCheckIn(
                        e.target.value
                      )
                    }
                    style={styles.input}
                  />
                </div>

                <div>
                  <div style={styles.label}>
                    Check-out
                  </div>

                  <input
                    type="date"
                    value={checkOut}
                    onChange={(e) =>
                      setCheckOut(
                        e.target.value
                      )
                    }
                    style={styles.input}
                  />
                </div>

                <div>
                  <div style={styles.label}>
                    Guests
                  </div>

                  <input
                    type="number"
                    min={1}
                    value={guests}
                    onChange={(e) =>
                      setGuests(
                        e.target.value
                      )
                    }
                    style={styles.input}
                  />
                </div>

                <div>
                  <div style={styles.label}>
                    Rooms
                  </div>

                  <input
                    type="number"
                    min={1}
                    value={rooms}
                    onChange={(e) =>
                      setRooms(
                        e.target.value
                      )
                    }
                    style={styles.input}
                  />
                </div>

                <button
                  style={styles.searchBtn}
                  onClick={searchHotels}
                >
                  {loading
                    ? "Searching..."
                    : "Search hotels"}
                </button>
              </div>
            </div>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>
              Popular destinations
            </div>

            <div style={styles.destinations}>
              {[
                {
                  city: "Dubai",
                  img: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=1200"
                },
                {
                  city: "London",
                  img: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=1200"
                },
                {
                  city: "Paris",
                  img: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=1200"
                },
                {
                  city: "New York",
                  img: "https://images.unsplash.com/photo-1499092346589-b9b6be3e94b2?q=80&w=1200"
                }
              ].map((x) => (
                <div
                  key={x.city}
                  style={styles.destinationCard}
                >
                  <img
                    src={x.img}
                    style={styles.destinationImage}
                  />

                  <div style={styles.destinationName}>
                    {x.city}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={styles.section}>
            <div style={styles.sectionTitle}>
              Live hotel results
            </div>

            <div style={styles.hotelsGrid}>
              {hotels.map((hotel) => (
                <div
                  key={
                    hotel.hotel_id ||
                    hotel.id
                  }
                  style={styles.hotelCard}
                >
                  <img
                    src={
                      hotel.image_url ||
                      "https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1200"
                    }
                    style={styles.hotelImage}
                  />

                  <div style={styles.hotelBody}>
                    <div style={styles.hotelName}>
                      {hotel.hotel_name ||
                        hotel.name}
                    </div>

                    <div style={styles.hotelLocation}>
                      {hotel.city} ·{" "}
                      {hotel.country}
                    </div>

                    <div style={styles.price}>
                      {currency}{" "}
                      {money(
                        hotel.price ||
                          hotel.first_rate
                            ?.net ||
                          120
                      )}
                    </div>

                    <div style={styles.hotelButtons}>
                      <button
                        style={styles.reserveBtn}
                        onClick={() =>
                          setSelectedHotel(
                            hotel
                          )
                        }
                      >
                        Destination Guide
                      </button>

                      <button
                        style={styles.payBtn}
                        onClick={() =>
                          payNow(hotel)
                        }
                      >
                        Pay Now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {selectedHotel && (
            <section style={styles.guideBox}>
              <h2>
                Destination Guide
              </h2>

              <div style={styles.guideGrid}>
                <div style={styles.guideCard}>
                  <h3>Emergency</h3>
                  <div>Police</div>
                  <div>Hospital</div>
                  <div>Ambulance</div>
                  <div>Fire service</div>
                </div>

                <div style={styles.guideCard}>
                  <h3>Nearby Places</h3>
                  <div>Restaurants</div>
                  <div>Museums</div>
                  <div>Shopping malls</div>
                  <div>Tour buses</div>
                </div>

                <div style={styles.guideCard}>
                  <h3>Transport</h3>
                  <div>Airport transfers</div>
                  <div>Taxi service</div>
                  <div>Metro stations</div>
                  <div>Train routes</div>
                </div>

                <div style={styles.guideCard}>
                  <h3>Directions</h3>

                  <a
                    href={`https://www.google.com/maps/search/${selectedHotel.hotel_name || selectedHotel.name}`}
                    target="_blank"
                  >
                    Open Google Maps
                  </a>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {activePage === "offers" && (
        <section style={styles.infoPage}>
          <h1>Special Offers</h1>

          <div style={styles.infoGrid}>
            <div style={styles.offerCard}>
              <h2>Luxury Escapes</h2>
              <p>
                Save on premium hotels worldwide.
              </p>
            </div>

            <div style={styles.offerCard}>
              <h2>Family Deals</h2>
              <p>
                Discounted stays for family trips.
              </p>
            </div>

            <div style={styles.offerCard}>
              <h2>Business Travel</h2>
              <p>
                Flexible business booking packages.
              </p>
            </div>
          </div>
        </section>
      )}

      {activePage === "partner" && (
        <section style={styles.infoPage}>
          <h1>Hotel & Partner Area</h1>

          <div style={styles.partnerGrid}>
            <div style={styles.partnerCard}>
              <h2>Partner Login</h2>

              <input
                placeholder="Email"
                style={styles.input}
              />

              <input
                placeholder="Password"
                type="password"
                style={styles.input}
              />

              <button style={styles.payBtn}>
                Login
              </button>
            </div>

            <div style={styles.partnerCard}>
              <h2>Hotel Onboarding Form</h2>

              <input
                placeholder="Hotel name"
                style={styles.input}
              />

              <input
                placeholder="Country"
                style={styles.input}
              />

              <input
                placeholder="City"
                style={styles.input}
              />

              <input
                placeholder="Hotel email"
                style={styles.input}
              />

              <textarea
                placeholder="Tell us about your property"
                style={{
                  ...styles.input,
                  minHeight: 120
                }}
              />

              <button style={styles.searchBtn}>
                Submit onboarding
              </button>
            </div>
          </div>
        </section>
      )}

      {activePage === "help" && (
        <section style={styles.infoPage}>
          <h1>Customer Support</h1>

          <div style={styles.infoGrid}>
            <div style={styles.offerCard}>
              <h2>24/7 Assistance</h2>
              <p>
                Dedicated travel support around the clock.
              </p>
            </div>

            <div style={styles.offerCard}>
              <h2>Booking Help</h2>
              <p>
                Reservation changes and cancellations.
              </p>
            </div>

            <div style={styles.offerCard}>
              <h2>Travel Safety</h2>
              <p>
                Destination guidance and local support.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const styles = {
  page: {
    background: "#f4f7fb",
    minHeight: "100vh",
    fontFamily: "Arial"
  },

  header: {
    background: "#ffffff",
    padding: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },

  logoBox: {
    display: "flex",
    alignItems: "center",
    gap: 18
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: "#f3df9c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: 24
  },

  brand: {
    fontSize: 42,
    fontWeight: 900
  },

  tag: {
    color: "#6d7991"
  },

  nav: {
    display: "flex",
    gap: 12,
    alignItems: "center"
  },

  navBtn: {
    border: "none",
    background: "transparent",
    fontWeight: 700,
    cursor: "pointer"
  },

  currency: {
    padding: 10,
    borderRadius: 12
  },

  partnerBtn: {
    background: "#2555e8",
    color: "#ffffff",
    border: "none",
    borderRadius: 14,
    padding: "14px 20px",
    fontWeight: 800,
    cursor: "pointer"
  },

  hero: {
    height: 500,
    margin: 24,
    borderRadius: 28,
    overflow: "hidden",
    position: "relative",
    backgroundImage:
      "url('https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=1600')",
    backgroundSize: "cover",
    backgroundPosition: "center"
  },

  heroOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(to right, rgba(255,255,255,0.92), rgba(255,255,255,0.35))"
  },

  heroContent: {
    position: "relative",
    zIndex: 2,
    padding: 40
  },

  heroTitle: {
    fontSize: 68,
    marginBottom: 10
  },

  heroText: {
    fontSize: 24,
    color: "#5f6980",
    marginBottom: 30
  },

  searchCard: {
    background: "#ffffff",
    borderRadius: 26,
    padding: 22,
    display: "grid",
    gridTemplateColumns: "repeat(7,1fr)",
    gap: 16,
    boxShadow: "0 10px 30px rgba(0,0,0,0.08)"
  },

  label: {
    marginBottom: 8,
    fontWeight: 700
  },

  input: {
    width: "100%",
    padding: 14,
    borderRadius: 14,
    border: "1px solid #d9e2f1"
  },

  searchBtn: {
    background: "#2555e8",
    color: "#ffffff",
    border: "none",
    borderRadius: 16,
    fontWeight: 800,
    cursor: "pointer",
    padding: 16
  },

  section: {
    margin: 24
  },

  sectionTitle: {
    fontSize: 36,
    fontWeight: 900,
    marginBottom: 20
  },

  destinations: {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 20
  },

  destinationCard: {
    background: "#ffffff",
    borderRadius: 24,
    overflow: "hidden",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)"
  },

  destinationImage: {
    width: "100%",
    height: 240,
    objectFit: "cover"
  },

  destinationName: {
    padding: 18,
    fontSize: 24,
    fontWeight: 800
  },

  hotelsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fill,minmax(320px,1fr))",
    gap: 24
  },

  hotelCard: {
    background: "#ffffff",
    borderRadius: 24,
    overflow: "hidden",
    boxShadow: "0 8px 20px rgba(0,0,0,0.08)"
  },

  hotelImage: {
    width: "100%",
    height: 240,
    objectFit: "cover"
  },

  hotelBody: {
    padding: 18
  },

  hotelName: {
    fontSize: 26,
    fontWeight: 900
  },

  hotelLocation: {
    marginTop: 6,
    color: "#5f6980"
  },

  price: {
    marginTop: 16,
    fontSize: 34,
    fontWeight: 900
  },

  hotelButtons: {
    display: "flex",
    gap: 12,
    marginTop: 18
  },

  reserveBtn: {
    flex: 1,
    padding: 14,
    border: "none",
    borderRadius: 14,
    background: "#0c1c45",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer"
  },

  payBtn: {
    flex: 1,
    padding: 14,
    border: "none",
    borderRadius: 14,
    background: "#1da971",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer"
  },

  guideBox: {
    background: "#ffffff",
    margin: 24,
    padding: 28,
    borderRadius: 24
  },

  guideGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4,1fr)",
    gap: 20,
    marginTop: 20
  },

  guideCard: {
    background: "#f6f8fc",
    borderRadius: 18,
    padding: 18,
    lineHeight: 2
  },

  infoPage: {
    padding: 40
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 24,
    marginTop: 30
  },

  offerCard: {
    background: "#ffffff",
    borderRadius: 22,
    padding: 28
  },

  partnerGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 30,
    marginTop: 30
  },

  partnerCard: {
    background: "#ffffff",
    borderRadius: 24,
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 16
  }
};
'@ | Set-Content .\src\App.jsx -Encoding UTF8

npm run build