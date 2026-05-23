import React, { useEffect, useMemo, useState } from "react";

const API =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://myspace-hotel-backend.onrender.com";

const CURRENCIES = [
  "GBP",
  "USD",
  "EUR",
  "NGN",
  "AED",
  "CAD",
  "AUD",
  "JPY",
  "ZAR",
  "CHF"
];

const GUIDE_DATA = {
  emergency: [
    "Police Emergency: 112 / 999",
    "Ambulance Emergency: 112 / 999",
    "Fire Brigade Emergency: 112 / 999",
    "24/7 Travel Assistance Available"
  ],

  airports: [
    "International Airport Transfers",
    "Airport Taxi Guidance",
    "Airport Train Connections",
    "VIP Chauffeur Support"
  ],

  hospitals: [
    "Nearby Emergency Hospitals",
    "Private Medical Clinics",
    "24 Hour Pharmacies",
    "Tourist Medical Assistance"
  ],

  restaurants: [
    "Local Restaurants",
    "Luxury Dining",
    "Family Friendly Dining",
    "Late Night Food Locations"
  ],

  tourism: [
    "Museums and Art Galleries",
    "Zoos and Attractions",
    "Sightseeing Tours",
    "Historic Landmarks"
  ],

  transport: [
    "Metro and Train Guidance",
    "Taxi and Uber Support",
    "Bus Stations",
    "Car Rental Services"
  ]
};

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

function nightsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);

  const diff = Math.ceil(
    (end - start) / 86400000
  );

  return diff > 0 ? diff : 1;
}

export default function App() {
  const [page, setPage] = useState("home");

  const [destinations, setDestinations] =
    useState([]);

  const [country, setCountry] =
    useState("");

  const [city, setCity] =
    useState("");

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

  const [displayCurrency, setDisplayCurrency] =
    useState("GBP");

  const [convertedTotal, setConvertedTotal] =
    useState(0);

  const [reservation, setReservation] =
    useState({
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      note: ""
    });

  const selectedCountry = useMemo(
    () =>
      destinations.find(
        (x) => x.country === country
      ),
    [country, destinations]
  );

  const nights = nightsBetween(
    checkin,
    checkout
  );

  const selectedRate =
    selectedHotel?.first_rate || null;

  const baseCurrency =
    selectedRate?.currency || "GBP";

  const total =
    Number(selectedRate?.amount || 0) *
    Number(rooms || 1) *
    nights;

  async function loadDestinations() {
    try {
      const r = await fetch(
        `${API}/api/real-catalog/destinations`
      );

      const j = await r.json();

      setDestinations(j.countries || []);
    } catch {}
  }

  async function searchHotels(
    customCountry = country,
    customCity = city
  ) {
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
        limit: 80
      });

      const r = await fetch(
        `${API}/api/hotels/search?${q.toString()}`
      );

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
      alert("Select hotel first.");
      return;
    }

    try {
      const r = await fetch(
        `${API}/reservation-request`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            ...reservation,

            hotel_id:
              selectedHotel.hotel_id,

            hotel_name:
              selectedHotel.hotel_name ||
              selectedHotel.name,

            destination: `${city}, ${country}`,

            checkin,
            checkout,
            guests,
            rooms,

            rate_key:
              selectedRate?.rate_key || "",

            amount: total,
            currency: baseCurrency
          })
        }
      );

      const j = await r.json();

      if (j.payment_url) {
        window.location.href =
          j.payment_url;

        return;
      }

      alert(
        j.message ||
          "Reservation request received."
      );
    } catch {
      alert("Reservation failed.");
    }
  }

  async function convertCurrency() {
    if (!total) {
      setConvertedTotal(0);
      return;
    }

    try {
      const q = new URLSearchParams({
        amount: String(total),
        from: baseCurrency,
        to: displayCurrency
      });

      const r = await fetch(
        `${API}/api/currency/convert?${q.toString()}`
      );

      const j = await r.json();

      if (j.ok) {
        setConvertedTotal(
          Number(j.converted || 0)
        );
      } else {
        setConvertedTotal(total);
      }
    } catch {
      setConvertedTotal(total);
    }
  }

  useEffect(() => {
    loadDestinations();
  }, []);

  useEffect(() => {
    convertCurrency();
  }, [total, displayCurrency]);

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

        <div style={styles.nav}>
          <button
            style={styles.navBtn}
            onClick={() => setPage("guide")}
          >
            Destination Guide
          </button>

          <button
            style={styles.navBtn}
            onClick={() => setPage("faq")}
          >
            FAQ
          </button>

          <button
            style={styles.navBtn}
            onClick={() => setPage("contact")}
          >
            Contact
          </button>

          <button
            style={styles.partnerBtn}
            onClick={() => setPage("partner")}
          >
            Partner Login
          </button>
        </div>
      </header>

      {page === "home" && (
        <>
          <section style={styles.hero}>
            <div style={styles.heroOverlay}>
              <div style={styles.heroContent}>
                <h1 style={styles.heroTitle}>
                  Search hotels worldwide
                </h1>

                <p style={styles.heroText}>
                  Verified hotels • Secure
                  booking • Trusted stays
                </p>

                <div style={styles.searchBox}>
                  <div style={styles.field}>
                    <label>Country</label>

                    <select
                      value={country}
                      onChange={(e) => {
                        setCountry(
                          e.target.value
                        );

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
                        setCity(
                          e.target.value
                        )
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
                        setCheckin(
                          e.target.value
                        )
                      }
                    />
                  </div>

                  <div style={styles.field}>
                    <label>Check-out</label>

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

                  <div style={styles.field}>
                    <label>Guests</label>

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

                  <div style={styles.field}>
                    <label>Rooms</label>

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
                    style={styles.searchBtn}
                    onClick={() =>
                      searchHotels()
                    }
                  >
                    {loading
                      ? "Searching..."
                      : "Search Hotels"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section style={styles.infoGrid}>
            <div style={styles.infoCard}>
              <h3>
                Global Hotel Inventory
              </h3>

              <p>
                Access verified stays across
                113 countries and 12,000+
                destinations.
              </p>
            </div>

            <div style={styles.infoCard}>
              <h3>
                Secure Reservation System
              </h3>

              <p>
                Safe booking flow with payment
                protection and live rate
                updates.
              </p>
            </div>

            <div style={styles.infoCard}>
              <h3>
                Enterprise Connectivity
              </h3>

              <p>
                Real PMS integrations and OTA
                distribution connectivity.
              </p>
            </div>
          </section>

          <section style={styles.guideSection}>
            <h2 style={styles.sectionTitle}>
              Destination Guide
            </h2>

            <div style={styles.guideGrid}>
              <GuideCard
                title="Emergency Services"
                items={GUIDE_DATA.emergency}
              />

              <GuideCard
                title="Airports & Transfers"
                items={GUIDE_DATA.airports}
              />

              <GuideCard
                title="Hospitals & Clinics"
                items={GUIDE_DATA.hospitals}
              />

              <GuideCard
                title="Restaurants & Dining"
                items={GUIDE_DATA.restaurants}
              />

              <GuideCard
                title="Tourism & Attractions"
                items={GUIDE_DATA.tourism}
              />

              <GuideCard
                title="Transport & Navigation"
                items={GUIDE_DATA.transport}
              />
            </div>
          </section>
        </>
      )}

      {page === "results" && (
        <main style={styles.results}>
          <button
            style={styles.backBtn}
            onClick={() => setPage("home")}
          >
            ← Back
          </button>

          <div style={styles.resultsGrid}>
            <div>
              <h2>
                Hotels in {city},{" "}
                {country}
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
                      <div
                        style={styles.noImage}
                      >
                        MYSPACE HOTEL
                      </div>
                    )}

                    <div style={styles.hotelBody}>
                      <h3>
                        {h.hotel_name ||
                          h.name}
                      </h3>

                      <p>
                        {h.address ||
                          h.area ||
                          city}
                      </p>

                      <div
                        style={styles.priceBox}
                      >
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
                        style={
                          styles.selectBtn
                        }
                        onClick={() =>
                          setSelectedHotel(
                            h
                          )
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

                  <div
                    style={styles.totalBox}
                  >
                    <strong>
                      {baseCurrency}{" "}
                      {money(total)}
                    </strong>

                    <small>
                      {nights} nights •{" "}
                      {rooms} room(s)
                    </small>
                  </div>

                  <div
                    style={styles.converterBox}
                  >
                    <label>
                      Currency Converter
                    </label>

                    <select
                      style={styles.input}
                      value={
                        displayCurrency
                      }
                      onChange={(e) =>
                        setDisplayCurrency(
                          e.target.value
                        )
                      }
                    >
                      {CURRENCIES.map(
                        (c) => (
                          <option
                            key={c}
                            value={c}
                          >
                            {c}
                          </option>
                        )
                      )}
                    </select>

                    <strong>
                      {displayCurrency}{" "}
                      {money(
                        convertedTotal
                      )}
                    </strong>
                  </div>

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
        <GuidePage setPage={setPage} />
      )}

      {page === "faq" && (
        <InfoPage
          title="Frequently Asked Questions"
          setPage={setPage}
          items={[
            "Booking confirmations",
            "Cancellation policies",
            "Refund guidance",
            "Reservation changes",
            "Secure payment support",
            "Live availability updates"
          ]}
        />
      )}

      {page === "contact" && (
        <InfoPage
          title="Contact"
          setPage={setPage}
          items={[
            "reservations@myspace-hotel.com",
            "24/7 booking support",
            "Enterprise onboarding support",
            "Travel assistance services"
          ]}
        />
      )}

      {page === "partner" && (
        <PartnerPage setPage={setPage} />
      )}
    </div>
  );
}

function GuideCard({ title, items }) {
  return (
    <div style={styles.guideCard}>
      <h3>{title}</h3>

      {items.map((x) => (
        <div
          key={x}
          style={styles.guideItem}
        >
          {x}
        </div>
      ))}
    </div>
  );
}

function GuidePage({ setPage }) {
  return (
    <main style={styles.infoPage}>
      <button
        style={styles.backBtn}
        onClick={() => setPage("home")}
      >
        ← Back
      </button>

      <h1>Destination Guide</h1>

      <div style={styles.guideGrid}>
        <GuideCard
          title="Emergency Services"
          items={GUIDE_DATA.emergency}
        />

        <GuideCard
          title="Airports & Transfers"
          items={GUIDE_DATA.airports}
        />

        <GuideCard
          title="Hospitals & Clinics"
          items={GUIDE_DATA.hospitals}
        />

        <GuideCard
          title="Restaurants & Dining"
          items={GUIDE_DATA.restaurants}
        />

        <GuideCard
          title="Tourism & Attractions"
          items={GUIDE_DATA.tourism}
        />

        <GuideCard
          title="Transport & Navigation"
          items={GUIDE_DATA.transport}
        />
      </div>
    </main>
  );
}

function InfoPage({
  title,
  items,
  setPage
}) {
  return (
    <main style={styles.infoPage}>
      <button
        style={styles.backBtn}
        onClick={() => setPage("home")}
      >
        ← Back
      </button>

      <h1>{title}</h1>

      <div style={styles.infoCard}>
        {items.map((x) => (
          <div
            key={x}
            style={styles.infoItem}
          >
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
        style={styles.backBtn}
        onClick={() => setPage("home")}
      >
        ← Back
      </button>

      <h1>Partner Access</h1>

      <div style={styles.partnerGrid}>
        <div style={styles.partnerCard}>
          <h3>Hotel Extranet</h3>

          <p>
            Inventory management and
            reservation control.
          </p>
        </div>

        <div style={styles.partnerCard}>
          <h3>PMS Connectivity</h3>

          <p>
            Real PMS synchronization and live
            inventory updates.
          </p>
        </div>

        <div style={styles.partnerCard}>
          <h3>Hotel Onboarding</h3>

          <p>
            Enterprise hotel onboarding and
            OTA connectivity.
          </p>
        </div>

        <div style={styles.partnerCard}>
          <h3>Enterprise Analytics</h3>

          <p>
            OTA reconciliation and reporting
            systems.
          </p>
        </div>
      </div>
    </main>
  );
}

const styles = {
  page: {
    fontFamily: "Arial",
    background: "#f5f8ff",
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
    fontSize: 30,
    fontWeight: 900
  },

  tag: {
    opacity: 0.8
  },

  nav: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
  },

  navBtn: {
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
    minHeight: 550
  },

  heroOverlay: {
    background:
      "rgba(7,20,47,.62)",

    minHeight: 550
  },

  heroContent: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: 50,
    color: "#fff"
  },

  heroTitle: {
    fontSize: 60,
    marginBottom: 10
  },

  heroText: {
    fontSize: 24,
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

  infoGrid: {
    padding: 30,
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(260px,1fr))",

    gap: 20
  },

  infoCard: {
    background: "#fff",
    borderRadius: 20,
    padding: 25,
    boxShadow:
      "0 10px 30px rgba(0,0,0,.08)"
  },

  sectionTitle: {
    fontSize: 34,
    marginBottom: 20
  },

  guideSection: {
    padding: 30
  },

  guideGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(280px,1fr))",

    gap: 20
  },

  guideCard: {
    background: "#fff",
    borderRadius: 20,
    padding: 25,
    boxShadow:
      "0 10px 30px rgba(0,0,0,.08)"
  },

  guideItem: {
    padding: 12,
    borderBottom: "1px solid #eee"
  },

  results: {
    padding: 30
  },

  backBtn: {
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

  priceBox: {
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

  totalBox: {
    background: "#dcfce7",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14
  },

  converterBox: {
    background: "#eff6ff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14
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
  },

  infoPage: {
    padding: 40
  }
};