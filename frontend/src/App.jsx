import React, { useEffect, useMemo, useState } from "react";

const API =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

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

export default function App() {
  const [page, setPage] = useState("home");

  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());

  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const [loading, setLoading] = useState(false);

  const [reservation, setReservation] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    note: ""
  });

  const selectedCountry = useMemo(
    () => destinations.find((x) => x.country === country),
    [country, destinations]
  );

  async function loadDestinations() {
    try {
      const r = await fetch(`${API}/api/real-catalog/destinations`);
      const j = await r.json();
      setDestinations(j.countries || []);
    } catch {}
  }

  async function searchHotels(customCountry = country, customCity = city) {
    if (!customCountry || !customCity) {
      alert("Choose destination first.");
      return;
    }

    setLoading(true);

    try {
      const q = new URLSearchParams({
        country: customCountry,
        city: customCity,
        checkin,
        checkout,
        guests,
        rooms,
        limit: 50
      });

      const r = await fetch(`${API}/api/hotels/search?${q.toString()}`);
      const j = await r.json();

      setHotels(j.hotels || []);
      setPage("results");
    } catch {
      alert("Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function reserveHotel() {
    if (!selectedHotel) {
      alert("Select a hotel first.");
      return;
    }

    try {
      const r = await fetch(`${API}/reservation-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...reservation,
          hotel_name:
            selectedHotel.hotel_name || selectedHotel.name,
          hotel_id: selectedHotel.hotel_id,
          destination: `${city}, ${country}`,
          checkin,
          checkout,
          guests,
          rooms,
          rate_key:
            selectedHotel?.first_rate?.rate_key || ""
        })
      });

      const j = await r.json();

      alert(
        j.message ||
          "Reservation request received."
      );
    } catch {
      alert("Reservation failed.");
    }
  }

  useEffect(() => {
    loadDestinations();
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.logo}>
            MYSPACE HOTEL
          </div>

          <div style={styles.tag}>
            Global Hotel Booking Platform
          </div>
        </div>

        <div style={styles.headerButtons}>
          <button
            style={styles.topBtn}
            onClick={() => setPage("guide")}
          >
            Destination Guide
          </button>

          <button
            style={styles.topBtn}
            onClick={() => setPage("faq")}
          >
            FAQ
          </button>

          <button
            style={styles.topBtn}
            onClick={() => setPage("terms")}
          >
            Terms
          </button>

          <button
            style={styles.topBtn}
            onClick={() => setPage("contact")}
          >
            Contact
          </button>

          <button
            style={styles.partnerBtn}
            onClick={() => setPage("partner")}
          >
            Hotel / Partner Login
          </button>
        </div>
      </header>

      {page === "home" && (
        <>
          <section style={styles.hero}>
            <div style={styles.heroOverlay}>
              <h1 style={styles.heroTitle}>
                Search hotels worldwide
              </h1>

              <p style={styles.heroText}>
                Verified stays • Real hotels •
                Secure booking
              </p>

              <div style={styles.searchBox}>
                <div style={styles.field}>
                  <label>Country</label>

                  <select
                    value={country}
                    onChange={(e) => {
                      setCountry(e.target.value);
                      setCity("");
                    }}
                  >
                    <option value="">
                      Select country
                    </option>

                    {destinations.map((c) => (
                      <option
                        key={c.country}
                        value={c.country}
                      >
                        {c.country}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.field}>
                  <label>City</label>

                  <select
                    value={city}
                    onChange={(e) =>
                      setCity(e.target.value)
                    }
                  >
                    <option value="">
                      Select city
                    </option>

                    {(selectedCountry?.cities ||
                      []).map((c) => (
                      <option
                        key={c.city}
                        value={c.city}
                      >
                        {c.city}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={styles.field}>
                  <label>Check-in</label>

                  <input
                    type="date"
                    value={checkin}
                    onChange={(e) =>
                      setCheckin(e.target.value)
                    }
                  />
                </div>

                <div style={styles.field}>
                  <label>Check-out</label>

                  <input
                    type="date"
                    value={checkout}
                    onChange={(e) =>
                      setCheckout(e.target.value)
                    }
                  />
                </div>

                <div style={styles.field}>
                  <label>Guests</label>

                  <input
                    type="number"
                    min="1"
                    value={guests}
                    onChange={(e) =>
                      setGuests(e.target.value)
                    }
                  />
                </div>

                <div style={styles.field}>
                  <label>Rooms</label>

                  <input
                    type="number"
                    min="1"
                    value={rooms}
                    onChange={(e) =>
                      setRooms(e.target.value)
                    }
                  />
                </div>

                <button
                  style={styles.searchBtn}
                  onClick={() => searchHotels()}
                >
                  {loading
                    ? "Searching..."
                    : "Search Hotels"}
                </button>
              </div>
            </div>
          </section>

          <section style={styles.quickLinks}>
            <button
              style={styles.quickCard}
              onClick={() => setPage("guide")}
            >
              <h3>Destination Guide</h3>
              <p>
                Airports, emergency numbers,
                hospitals, restaurants and
                attractions.
              </p>
            </button>

            <button
              style={styles.quickCard}
              onClick={() => setPage("faq")}
            >
              <h3>FAQ</h3>
              <p>
                Booking help, payment support,
                cancellations and refunds.
              </p>
            </button>

            <button
              style={styles.quickCard}
              onClick={() => setPage("contact")}
            >
              <h3>Contact Us</h3>
              <p>
                Reach our booking support team
                anytime.
              </p>
            </button>

            <button
              style={styles.quickCard}
              onClick={() => setPage("partner")}
            >
              <h3>Hotel Extranet</h3>
              <p>
                PMS sync, onboarding and partner
                connectivity.
              </p>
            </button>
          </section>
        </>
      )}

      {page === "results" && (
        <main style={styles.results}>
          <button
            style={styles.back}
            onClick={() => setPage("home")}
          >
            ← Back
          </button>

          <div style={styles.resultsGrid}>
            <div>
              <h2>
                Hotels in {city}, {country}
              </h2>

              <div style={styles.hotelGrid}>
                {hotels.map((h) => (
                  <div
                    key={h.hotel_id}
                    style={styles.hotelCard}
                  >
                    {h.image_url ? (
                      <img
                        src={h.image_url}
                        style={styles.hotelImage}
                      />
                    ) : (
                      <div style={styles.noImage}>
                        MYSPACE HOTEL
                      </div>
                    )}

                    <div style={styles.hotelBody}>
                      <h3>
                        {h.hotel_name || h.name}
                      </h3>

                      <p>
                        {h.address ||
                          h.area ||
                          city}
                      </p>

                      <div style={styles.price}>
                        {h.first_rate ? (
                          <>
                            <strong>
                              {
                                h.first_rate
                                  .currency
                              }{" "}
                              {money(
                                h.first_rate
                                  .amount
                              )}
                            </strong>

                            <small>
                              per room / night
                            </small>
                          </>
                        ) : (
                          <strong>
                            Price confirmation
                            required
                          </strong>
                        )}
                      </div>

                      <button
                        style={styles.selectBtn}
                        onClick={() =>
                          setSelectedHotel(h)
                        }
                      >
                        Select Hotel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside style={styles.reserveBox}>
              <h2>Reserve / Pay</h2>

              {selectedHotel ? (
                <>
                  <h3>
                    {selectedHotel.hotel_name ||
                      selectedHotel.name}
                  </h3>

                  <p>
                    {city}, {country}
                  </p>

                  <input
                    style={styles.input}
                    placeholder="Full name"
                    value={
                      reservation.customer_name
                    }
                    onChange={(e) =>
                      setReservation({
                        ...reservation,
                        customer_name:
                          e.target.value
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Email"
                    value={
                      reservation.customer_email
                    }
                    onChange={(e) =>
                      setReservation({
                        ...reservation,
                        customer_email:
                          e.target.value
                      })
                    }
                  />

                  <input
                    style={styles.input}
                    placeholder="Phone"
                    value={
                      reservation.customer_phone
                    }
                    onChange={(e) =>
                      setReservation({
                        ...reservation,
                        customer_phone:
                          e.target.value
                      })
                    }
                  />

                  <textarea
                    style={styles.textarea}
                    placeholder="Special request"
                    value={reservation.note}
                    onChange={(e) =>
                      setReservation({
                        ...reservation,
                        note: e.target.value
                      })
                    }
                  />

                  <button
                    style={styles.payBtn}
                    onClick={reserveHotel}
                  >
                    Reserve / Pay Securely
                  </button>
                </>
              ) : (
                <div>
                  Select a hotel first.
                </div>
              )}
            </aside>
          </div>
        </main>
      )}

      {page === "guide" && (
        <InfoPage
          title="Destination Guide"
          setPage={setPage}
          content={[
            "Emergency Services: 112 / 999",
            "Airport transfers available in major cities",
            "Popular attractions and museums nearby",
            "Local restaurants and shopping guidance",
            "24/7 booking assistance available"
          ]}
        />
      )}

      {page === "faq" && (
        <InfoPage
          title="Frequently Asked Questions"
          setPage={setPage}
          content={[
            "Most bookings include instant confirmation.",
            "Some properties support free cancellation.",
            "Refund timelines depend on the property policy.",
            "Support is available for booking issues."
          ]}
        />
      )}

      {page === "terms" && (
        <InfoPage
          title="Terms & Conditions"
          setPage={setPage}
          content={[
            "Prices depend on live hotel availability.",
            "Hotels may request identity verification.",
            "Booking conditions vary by property.",
            "Guests must comply with local regulations."
          ]}
        />
      )}

      {page === "contact" && (
        <InfoPage
          title="Contact Us"
          setPage={setPage}
          content={[
            "Email: reservations@myspace-hotel.com",
            "Global booking support available.",
            "Enterprise partnership onboarding supported.",
            "Emergency reservation assistance available."
          ]}
        />
      )}

      {page === "partner" && (
        <PartnerPage setPage={setPage} />
      )}
    </div>
  );
}

function InfoPage({
  title,
  content,
  setPage
}) {
  return (
    <main style={styles.infoPage}>
      <button
        style={styles.back}
        onClick={() => setPage("home")}
      >
        ← Back
      </button>

      <h1>{title}</h1>

      <div style={styles.infoCard}>
        {content.map((x) => (
          <div key={x} style={styles.infoItem}>
            {x}
          </div>
        ))}
      </div>
    </main>
  );
}

function PartnerPage({ setPage }) {
  return (
    <main style={styles.infoPage}>
      <button
        style={styles.back}
        onClick={() => setPage("home")}
      >
        ← Back
      </button>

      <h1>Hotel / Partner Login</h1>

      <div style={styles.partnerGrid}>
        <div style={styles.partnerCard}>
          <h3>Hotel Extranet</h3>
          <p>
            Manage inventory, reservations and
            pricing.
          </p>
        </div>

        <div style={styles.partnerCard}>
          <h3>PMS Sync Monitor</h3>
          <p>
            Live PMS connectivity and sync
            monitoring.
          </p>
        </div>

        <div style={styles.partnerCard}>
          <h3>Hotel Onboarding</h3>
          <p>
            Connect hotels, PMS providers and
            channel managers.
          </p>
        </div>

        <div style={styles.partnerCard}>
          <h3>Enterprise Analytics</h3>
          <p>
            Reservation analytics and OTA
            reconciliation.
          </p>
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: {
    fontFamily: "Arial",
    background: "#f6f9ff",
    minHeight: "100vh"
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    background: "#07142f",
    color: "#fff"
  },

  logo: {
    fontSize: 28,
    fontWeight: 900
  },

  tag: {
    opacity: 0.8
  },

  headerButtons: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
  },

  topBtn: {
    border: 0,
    background: "#fff",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700
  },

  partnerBtn: {
    border: 0,
    background: "#f6c744",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 900
  },

  hero: {
    backgroundImage:
      "url(https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1800&q=80)",
    backgroundSize: "cover",
    backgroundPosition: "center",
    minHeight: 520
  },

  heroOverlay: {
    background:
      "rgba(7,20,47,.65)",
    minHeight: 520,
    padding: 50,
    color: "#fff"
  },

  heroTitle: {
    fontSize: 56,
    marginBottom: 10
  },

  heroText: {
    fontSize: 22,
    marginBottom: 30
  },

  searchBox: {
    background: "#fff",
    borderRadius: 20,
    padding: 20,
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(180px,1fr))",
    gap: 15,
    color: "#000"
  },

  field: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },

  searchBtn: {
    border: 0,
    background: "#1857df",
    color: "#fff",
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer"
  },

  quickLinks: {
    padding: 30,
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(240px,1fr))",
    gap: 20
  },

  quickCard: {
    border: 0,
    background: "#fff",
    borderRadius: 20,
    padding: 25,
    textAlign: "left",
    cursor: "pointer",
    boxShadow:
      "0 10px 30px rgba(0,0,0,.08)"
  },

  results: {
    padding: 30
  },

  back: {
    border: 0,
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
    marginBottom: 20
  },

  resultsGrid: {
    display: "grid",
    gridTemplateColumns:
      "1fr 360px",
    gap: 30
  },

  hotelGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(280px,1fr))",
    gap: 20
  },

  hotelCard: {
    background: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    boxShadow:
      "0 10px 30px rgba(0,0,0,.08)"
  },

  hotelImage: {
    width: "100%",
    height: 200,
    objectFit: "cover"
  },

  noImage: {
    height: 200,
    display: "grid",
    placeItems: "center",
    background: "#dbeafe",
    fontWeight: 900
  },

  hotelBody: {
    padding: 20
  },

  price: {
    margin: "15px 0"
  },

  selectBtn: {
    width: "100%",
    border: 0,
    background: "#1857df",
    color: "#fff",
    borderRadius: 12,
    padding: 12,
    fontWeight: 900,
    cursor: "pointer"
  },

  reserveBox: {
    background: "#fff",
    borderRadius: 20,
    padding: 25,
    height: "fit-content",
    position: "sticky",
    top: 20
  },

  input: {
    width: "100%",
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #ccc"
  },

  textarea: {
    width: "100%",
    minHeight: 100,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    border: "1px solid #ccc"
  },

  payBtn: {
    width: "100%",
    border: 0,
    background: "#10b981",
    color: "#fff",
    padding: 14,
    borderRadius: 12,
    fontWeight: 900,
    cursor: "pointer"
  },

  infoPage: {
    padding: 40
  },

  infoCard: {
    background: "#fff",
    borderRadius: 20,
    padding: 30
  },

  infoItem: {
    padding: 15,
    borderBottom: "1px solid #eee"
  },

  partnerGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(260px,1fr))",
    gap: 20
  },

  partnerCard: {
    background: "#fff",
    borderRadius: 20,
    padding: 25
  }
};