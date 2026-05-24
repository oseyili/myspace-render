# COMPLETE REPLACEMENT — frontend/src/App.jsx

```jsx
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
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);

  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");

  const [stayType, setStayType] = useState("hotel");

  const [checkin, setCheckin] = useState(todayISO());
  const [checkout, setCheckout] = useState(tomorrowISO());

  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedHotel, setSelectedHotel] = useState(null);
  const [liveRate, setLiveRate] = useState(null);

  useEffect(() => {
    loadDestinations();
  }, []);

  async function loadDestinations() {
    try {
      const res = await fetch(`${API_BASE}/api/destinations`);
      const data = await res.json();

      const rows = Array.isArray(data.countries)
        ? data.countries
        : [];

      setCountries(rows);
    } catch (err) {
      console.log(err);
    }
  }

  useEffect(() => {
    const found = countries.find(
      (x) => x.country === country
    );

    if (!found) {
      setCities([]);
      setCity("");
      return;
    }

    const rows = Array.isArray(found.cities)
      ? found.cities.map((x) =>
          typeof x === "string"
            ? x
            : x.city
        )
      : [];

    setCities(rows);

    if (rows.length > 0) {
      setCity(rows[0]);
    }
  }, [country, countries]);

  async function searchHotels() {
    if (!country || !city) {
      alert("Please select country and city.");
      return;
    }

    setLoading(true);

    setHotels([]);
    setSelectedHotel(null);
    setLiveRate(null);

    try {
      const url = `${API_BASE}/api/hotels/search?country=${encodeURIComponent(
        country
      )}&city=${encodeURIComponent(
        city
      )}&stay_type=${encodeURIComponent(
        stayType
      )}&limit=60`;

      const res = await fetch(url);
      const data = await res.json();

      setHotels(Array.isArray(data.hotels) ? data.hotels : []);
    } catch (err) {
      console.log(err);
      alert("Hotel search failed.");
    }

    setLoading(false);
  }

  async function selectHotel(hotel) {
    setSelectedHotel(hotel);

    setLiveRate({
      loading: true
    });

    try {
      const url = `${API_BASE}/api/hotels/live-rate?hotel_id=${encodeURIComponent(
        hotel.hotel_id || hotel.id
      )}&checkin=${checkin}&checkout=${checkout}&guests=${guests}&rooms=${rooms}`;

      const res = await fetch(url);
      const data = await res.json();

      setLiveRate(data);
    } catch (err) {
      console.log(err);

      setLiveRate({
        ok: false,
        customer_message:
          "Pricing is temporarily unavailable."
      });
    }
  }

  function openHelp() {
    alert(
      "MySpace Hotel Support\n\nEmail: reservations@myspace-hotel.com"
    );
  }

  function openOffers() {
    alert(
      "Special destination offers are being updated."
    );
  }

  function openPartnerForm() {
    alert(
      "Partner onboarding available through MySpace Hotel support."
    );
  }

  function openPartnerLogin() {
    alert(
      "Partner login access is available after approval."
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.logo}>
            MYSPACE HOTEL
          </div>

          <div style={styles.tagline}>
            Trusted stays worldwide
          </div>
        </div>

        <div style={styles.navArea}>
          <button style={styles.navBtn}>
            Stays
          </button>

          <button style={styles.navBtn}>
            Destinations
          </button>

          <button
            style={styles.navBtn}
            onClick={openOffers}
          >
            Offers
          </button>

          <button
            style={styles.navBtn}
            onClick={openHelp}
          >
            Help
          </button>

          <button
            style={styles.goldBtn}
            onClick={openPartnerForm}
          >
            Partner Form
          </button>

          <button
            style={styles.outlineBtn}
            onClick={openPartnerLogin}
          >
            Partner Login
          </button>
        </div>
      </div>

      <div style={styles.hero}>
        <div style={styles.heroOverlay}>
          <div style={styles.heroText1}>
            Hotels, apartments and villas
          </div>

          <div style={styles.heroText2}>
            Find your next stay
          </div>

          <div style={styles.heroText3}>
            Clear pricing. Secure checkout.
            Worldwide destinations.
          </div>

          <div style={styles.searchBox}>
            <div style={styles.searchGrid}>
              <Field label="Stay type">
                <select
                  value={stayType}
                  onChange={(e) =>
                    setStayType(e.target.value)
                  }
                  style={styles.input}
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
                    setCountry(e.target.value)
                  }
                  style={styles.input}
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
                    setCity(e.target.value)
                  }
                  style={styles.input}
                >
                  <option value="">
                    Select city
                  </option>

                  {cities.map((c) => (
                    <option key={c} value={c}>
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
                    setCheckin(e.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Check-out">
                <input
                  type="date"
                  value={checkout}
                  onChange={(e) =>
                    setCheckout(e.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Guests">
                <input
                  type="number"
                  min="1"
                  value={guests}
                  onChange={(e) =>
                    setGuests(e.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <Field label="Rooms">
                <input
                  type="number"
                  min="1"
                  value={rooms}
                  onChange={(e) =>
                    setRooms(e.target.value)
                  }
                  style={styles.input}
                />
              </Field>

              <button
                style={styles.searchBtn}
                onClick={searchHotels}
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.main}>
        <div>
          {loading && (
            <div style={styles.loading}>
              Searching stays...
            </div>
          )}

          <div style={styles.hotelGrid}>
            {hotels.map((hotel) => (
              <div
                key={hotel.hotel_id || hotel.id}
                style={styles.card}
              >
                <img
                  src={hotel.image_url}
                  alt={hotel.name}
                  style={styles.hotelImage}
                />

                <div style={styles.cardBody}>
                  <div style={styles.hotelTitle}>
                    {hotel.name}
                  </div>

                  <div style={styles.hotelLocation}>
                    {hotel.address}, {hotel.city}, {hotel.country}
                  </div>

                  <div style={styles.infoBox}>
                    Latest available pricing is checked after stay selection.
                  </div>

                  <div style={styles.cardBtns}>
                    <button
                      style={styles.selectBtn}
                      onClick={() =>
                        selectHotel(hotel)
                      }
                    >
                      Select Stay
                    </button>

                    <button
                      style={styles.guideBtn}
                    >
                      Guide
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.sidePanel}>
          <div style={styles.sideTitle}>
            Reserve / Pay
          </div>

          {!selectedHotel && (
            <div style={styles.sideText}>
              Select a stay to continue.
            </div>
          )}

          {selectedHotel && (
            <>
              <div style={styles.sideHotel}>
                {selectedHotel.name}
              </div>

              <div style={styles.sideAddress}>
                {selectedHotel.address}
              </div>

              <div style={styles.priceBox}>
                {liveRate?.loading && (
                  <div style={styles.priceSearching}>
                    Searching latest price...
                  </div>
                )}

                {!liveRate?.loading &&
                  liveRate?.ok &&
                  liveRate?.rate && (
                    <>
                      <div style={styles.totalLabel}>
                        Stay total
                      </div>

                      <div style={styles.priceBig}>
                        {liveRate.rate.currency} {money(liveRate.rate.amount)}
                      </div>

                      <div style={styles.sideText}>
                        {liveRate.customer_message}
                      </div>
                    </>
                  )}

                {!liveRate?.loading &&
                  !liveRate?.ok && (
                    <>
                      <div style={styles.errorTitle}>
                        Live pricing unavailable
                      </div>

                      <div style={styles.sideText}>
                        {liveRate.customer_message}
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

function Field({ label, children }) {
  return (
    <div>
      <div style={styles.label}>{label}</div>
      {children}
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
    background: "#fff",
    padding: "20px 30px",
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },

  logo: {
    fontSize: 48,
    fontWeight: 900,
    color: "#071437"
  },

  tagline: {
    marginTop: 6,
    color: "#6b7280",
    fontWeight: 600
  },

  navArea: {
    display: "flex",
    gap: 12,
    alignItems: "center"
  },

  navBtn: {
    border: "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 12,
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer"
  },

  goldBtn: {
    border: "none",
    background: "#f4c430",
    borderRadius: 14,
    padding: "14px 20px",
    fontWeight: 900,
    cursor: "pointer"
  },

  outlineBtn: {
    border: "1px solid #d1d5db",
    background: "#fff",
    borderRadius: 14,
    padding: "14px 20px",
    fontWeight: 800,
    cursor: "pointer"
  },

  hero: {
    backgroundImage:
      "url(https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=2200&auto=format&fit=crop)",
    backgroundSize: "cover",
    backgroundPosition: "center"
  },

  heroOverlay: {
    background: "rgba(255,255,255,0.82)",
    padding: "70px 40px"
  },

  heroText1: {
    fontSize: 24,
    color: "#2563eb",
    fontWeight: 900
  },

  heroText2: {
    marginTop: 20,
    fontSize: 80,
    lineHeight: 1,
    fontWeight: 900,
    color: "#071437"
  },

  heroText3: {
    marginTop: 24,
    fontSize: 28,
    lineHeight: 1.4,
    maxWidth: 900,
    color: "#1f2937",
    fontWeight: 600
  },

  searchBox: {
    marginTop: 40,
    background: "#fff",
    borderRadius: 28,
    padding: 24,
    boxShadow:
      "0 20px 60px rgba(0,0,0,0.10)"
  },

  searchGrid: {
    display: "grid",
    gridTemplateColumns:
      "1fr 1fr 1fr 1fr 1fr 0.7fr 0.7fr auto",
    gap: 16,
    alignItems: "end"
  },

  label: {
    marginBottom: 10,
    fontWeight: 800,
    color: "#071437"
  },

  input: {
    width: "100%",
    height: 56,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    padding: "0 14px",
    fontSize: 16
  },

  searchBtn: {
    height: 56,
    width: 150,
    border: "none",
    borderRadius: 16,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 900,
    fontSize: 20,
    cursor: "pointer"
  },

  main: {
    padding: 40,
    display: "grid",
    gridTemplateColumns: "1fr 420px",
    gap: 28
  },

  loading: {
    fontSize: 24,
    fontWeight: 900,
    marginBottom: 20
  },

  hotelGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fill,minmax(420px,1fr))",
    gap: 28
  },

  card: {
    background: "#fff",
    borderRadius: 28,
    overflow: "hidden",
    boxShadow:
      "0 10px 40px rgba(0,0,0,0.08)"
  },

  hotelImage: {
    width: "100%",
    height: 260,
    objectFit: "cover"
  },

  cardBody: {
    padding: 22
  },

  hotelTitle: {
    fontSize: 34,
    lineHeight: 1.1,
    fontWeight: 900,
    color: "#071437"
  },

  hotelLocation: {
    marginTop: 12,
    color: "#4b5563",
    fontSize: 18
  },

  infoBox: {
    marginTop: 20,
    background: "#f3f6fb",
    padding: 18,
    borderRadius: 18,
    color: "#374151",
    lineHeight: 1.5
  },

  cardBtns: {
    display: "flex",
    gap: 14,
    marginTop: 24
  },

  selectBtn: {
    flex: 1,
    border: "none",
    borderRadius: 16,
    background: "#f4c430",
    padding: "18px 0",
    fontWeight: 900,
    fontSize: 20,
    cursor: "pointer"
  },

  guideBtn: {
    flex: 1,
    borderRadius: 16,
    border: "2px solid #dbe2ea",
    background: "#fff",
    padding: "18px 0",
    fontWeight: 800,
    fontSize: 20,
    cursor: "pointer"
  },

  sidePanel: {
    background: "#fff",
    borderRadius: 28,
    padding: 28,
    position: "sticky",
    top: 30,
    height: "fit-content",
    boxShadow:
      "0 10px 40px rgba(0,0,0,0.08)"
  },

  sideTitle: {
    fontSize: 40,
    fontWeight: 900,
    color: "#071437"
  },

  sideText: {
    marginTop: 14,
    color: "#4b5563",
    lineHeight: 1.6
  },

  sideHotel: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: 900
  },

  sideAddress: {
    marginTop: 10,
    color: "#6b7280"
  },

  priceBox: {
    marginTop: 24,
    background: "#ecfdf3",
    borderRadius: 22,
    padding: 22
  },

  priceSearching: {
    fontSize: 24,
    fontWeight: 900
  },

  totalLabel: {
    fontSize: 20,
    fontWeight: 900
  },

  priceBig: {
    marginTop: 12,
    fontSize: 50,
    fontWeight: 900
  },

  errorTitle: {
    fontSize: 24,
    fontWeight: 900,
    color: "#b91c1c"
  }
};
```

After pasting:

```powershell
# FRONTEND WINDOW — Windows PowerShell

cd C:\frontend\hotel-booking-app\frontend

Ctrl+C

npm run build

cd C:\frontend\hotel-booking-app

git add frontend/src/App.jsx

git commit -m "Restore stable full customer frontend"

git push origin main
```
