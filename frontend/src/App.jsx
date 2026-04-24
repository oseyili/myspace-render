import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";

const FACILITIES = [
  "wifi",
  "spa",
  "gym",
  "restaurant",
  "pool",
  "parking",
  "airport shuttle",
  "family rooms",
  "beach access",
  "business lounge",
];

export default function App() {
  const [page, setPage] = useState("home");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [guests, setGuests] = useState(2);
  const [hotels, setHotels] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", requests: "" });

  const filteredHotels = useMemo(() => {
    return hotels.filter((hotel) =>
      selectedFacilities.every((facility) =>
        (hotel.facilities || []).includes(facility)
      )
    );
  }, [hotels, selectedFacilities]);

  async function searchHotels() {
    setSearching(true);
    setMessage("");

    const params = new URLSearchParams();
    if (country.trim()) params.set("country", country.trim());
    if (city.trim()) params.set("city", city.trim());
    if (area.trim()) params.set("area", area.trim());
    params.set("adults", guests);

    try {
      const res = await fetch(`${API_BASE}/api/hotels?${params.toString()}`);
      const data = await res.json();
      const nextHotels = data.hotels || [];

      setHotels(nextHotels);
      setSelectedHotel(nextHotels[0] || null);

      if (nextHotels.length === 0) {
        setMessage("No matching hotels found. Try a broader country, city, or area search.");
      }
    } catch {
      setMessage("Search is temporarily unavailable. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    searchHotels();
  }, []);

  function toggleFacility(facility) {
    setSelectedFacilities((prev) =>
      prev.includes(facility)
        ? prev.filter((x) => x !== facility)
        : [...prev, facility]
    );
  }

  async function submitRequest() {
    if (!selectedHotel) {
      setMessage("Please select a hotel before sending your request.");
      return;
    }

    if (!form.name.trim() || !form.email.trim()) {
      setMessage("Please enter your name and email before sending your request.");
      return;
    }

    setSending(true);
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          hotel: selectedHotel.name,
          name: form.name.trim(),
          email: form.email.trim(),
          message: form.requests.trim(),
        }),
      });

      const data = await res.json();
      setMessage(data.message || data.status || "Your reservation request has been received.");
    } catch {
      setMessage("Your request could not be sent right now. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (page !== "home") {
    return <InfoPage page={page} setPage={setPage} city={city || "your destination"} />;
  }

  return (
    <div style={styles.app}>
      <div style={styles.wrap}>
        <section style={styles.heroGrid}>
          <div style={styles.hero}>
            <div style={styles.kicker}>Worldwide hotel search</div>
            <h1 style={styles.title}>My Space Hotel</h1>
            <p style={styles.heroText}>
              Search a stronger global hotel database, compare the right stays faster,
              and request your hotel directly with confidence.
            </p>

            <div style={styles.statBox}>
              <div style={styles.statLabel}>Live choices shown</div>
              <div style={styles.statNumber}>{filteredHotels.length}</div>
              <div style={styles.statText}>hotel options ready for review in this search</div>
            </div>

            <div style={styles.nav}>
              <button style={styles.navBtn} onClick={() => setPage("guide")}>Travel Guides</button>
              <button style={styles.navBtn} onClick={() => setPage("faq")}>FAQs</button>
              <button style={styles.navBtn} onClick={() => setPage("terms")}>Booking Terms</button>
              <button style={styles.navBtn} onClick={() => setPage("support")}>Customer Support</button>
            </div>

            <div style={styles.promiseGrid}>
              <b>Search globally</b>
              <b>Filter by facilities</b>
              <b>Compare clearly</b>
              <b>Request directly</b>
            </div>
          </div>

          <div style={styles.searchPanel}>
            <div style={styles.kickerDark}>Search</div>
            <h2 style={styles.searchTitle}>Find the stay that fits your trip</h2>
            <p style={styles.searchText}>
              Search by country, city, or specific area. Leave boxes blank to search more broadly.
            </p>

            <input style={styles.input} placeholder="Country e.g. France, Nigeria, United Kingdom" value={country} onChange={(e) => setCountry(e.target.value)} />
            <input style={styles.input} placeholder="City e.g. Paris, Lagos, Dubai" value={city} onChange={(e) => setCity(e.target.value)} />
            <input style={styles.input} placeholder="Area e.g. Mayfair, Lekki, Marina" value={area} onChange={(e) => setArea(e.target.value)} />

            <div style={styles.guestRow}>
              <b>Guests</b>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button key={n} onClick={() => setGuests(n)} style={guests === n ? styles.guestActive : styles.guestBtn}>
                  {n}
                </button>
              ))}
            </div>

            <div style={styles.filters}>
              <b>Choose facilities that matter</b>
              <div style={styles.filterGrid}>
                {FACILITIES.map((f) => (
                  <label key={f} style={styles.checkLabel}>
                    <input type="checkbox" checked={selectedFacilities.includes(f)} onChange={() => toggleFacility(f)} />
                    {f}
                  </label>
                ))}
              </div>
            </div>

            <div style={styles.actionGrid}>
              <button style={styles.yellowBtn} onClick={searchHotels}>
                {searching ? "Searching..." : "Search hotels"}
              </button>
              <button
                style={styles.blueBtn}
                onClick={() => {
                  setCountry("");
                  setCity("");
                  setArea("");
                  setSelectedFacilities([]);
                  searchHotels();
                }}
              >
                Broad search
              </button>
            </div>
          </div>
        </section>

        <section style={styles.mainGrid}>
          <div style={styles.resultsPanel}>
            <div style={styles.kickerDark}>Available hotels</div>
            <h2 style={styles.resultsTitle}>Choose the hotel that fits the trip</h2>

            <div style={styles.resultsScroll}>
              {filteredHotels.map((hotel) => (
                <div
                  key={hotel.id}
                  style={{
                    ...styles.hotelCard,
                    border: selectedHotel?.id === hotel.id ? "3px solid #f1c644" : "1px solid #d7e3f4",
                  }}
                  onClick={() => setSelectedHotel(hotel)}
                >
                  {hotel.image && <img src={hotel.image} alt={hotel.name} style={styles.hotelImg} />}
                  <div style={styles.hotelBody}>
                    <h3 style={styles.hotelName}>{hotel.name}</h3>
                    <p style={styles.hotelLoc}>{hotel.area}, {hotel.city}, {hotel.country}</p>
                    <p style={styles.hotelSummary}>
                      A strong stay option for travellers who want clarity before they reserve.
                    </p>
                    <p style={styles.facilities}>Facilities: {(hotel.facilities || []).join(", ")}</p>
                    <div style={styles.priceRow}>
                      <b style={styles.price}>{hotel.currency} {hotel.price}</b>
                      <button style={styles.reserveBtn} onClick={(e) => { e.stopPropagation(); setSelectedHotel(hotel); }}>
                        Reserve in app
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {filteredHotels.length === 0 && (
                <div style={styles.emptyBox}>
                  {message || "Enter a country, city, or area to begin a global hotel search."}
                </div>
              )}
            </div>
          </div>

          <aside style={styles.reservePanel}>
            <div style={styles.kickerDark}>Request availability</div>
            <h2 style={styles.reserveTitle}>Complete your reservation request</h2>
            <p style={styles.searchText}>
              Select the stay you prefer, enter your details, and send your request directly.
            </p>

            <div style={styles.selectedBox}>
              {selectedHotel ? (
                <>
                  <h3 style={styles.selectedName}>{selectedHotel.name}</h3>
                  <p>{selectedHotel.area}, {selectedHotel.city}, {selectedHotel.country}</p>
                  <b style={styles.price}>{selectedHotel.currency} {selectedHotel.price}</b>
                </>
              ) : (
                <p>Select a hotel to continue.</p>
              )}
            </div>

            <input style={styles.formInput} placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input style={styles.formInput} placeholder="Your email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <textarea style={styles.textarea} placeholder="Special requests" value={form.requests} onChange={(e) => setForm({ ...form, requests: e.target.value })} />

            <button style={styles.yellowBtn} onClick={submitRequest}>
              {sending ? "Sending request..." : "Request availability"}
            </button>

            {message && <div style={styles.message}>{message}</div>}
          </aside>
        </section>
      </div>
    </div>
  );
}

function InfoPage({ page, setPage, city }) {
  const content = {
    guide: {
      title: `${city} travel guide`,
      text: "Choose the right area before you reserve. Compare location, facilities, convenience, and trip purpose so your hotel decision feels clearer.",
    },
    faq: {
      title: "Frequently asked questions",
      text: "Search globally, compare hotels, select the stay you prefer, and send a reservation request. My Space Hotel helps you move from choice to request with less confusion.",
    },
    terms: {
      title: "Booking terms",
      text: "A reservation request is not a final confirmed booking until availability and next steps are confirmed. Prices and availability may change depending on property rules and dates.",
    },
    support: {
      title: "Customer support",
      text: "For help with a reservation request, contact reservations@myspace-hotel.com and include your name, destination, selected hotel, and travel details.",
    },
  }[page];

  return (
    <div style={styles.app}>
      <div style={styles.infoPage}>
        <button style={styles.yellowBtnSmall} onClick={() => setPage("home")}>Return to search</button>
        <h1 style={styles.infoTitle}>{content.title}</h1>
        <p style={styles.infoText}>{content.text}</p>
        <button style={styles.yellowBtn} onClick={() => setPage("home")}>Continue hotel search</button>
      </div>
    </div>
  );
}

const styles = {
  app: { background: "#07152f", color: "#fff", minHeight: "100vh", padding: 20, fontFamily: "Arial, sans-serif" },
  wrap: { maxWidth: 1600, margin: "0 auto" },
  heroGrid: { display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 24, marginBottom: 24 },
  hero: { background: "linear-gradient(135deg,#163a87,#2d5fcb)", borderRadius: 30, padding: 34 },
  kicker: { letterSpacing: 3, textTransform: "uppercase", fontWeight: 800, opacity: 0.9 },
  kickerDark: { letterSpacing: 3, textTransform: "uppercase", fontWeight: 900, color: "#617aa7", marginBottom: 8 },
  title: { fontSize: 78, margin: "14px 0", lineHeight: 1 },
  heroText: { fontSize: 28, lineHeight: 1.45, maxWidth: 900, fontWeight: 700 },
  statBox: { background: "rgba(255,255,255,.12)", borderRadius: 24, padding: 22, width: 520, maxWidth: "100%" },
  statLabel: { fontSize: 18 },
  statNumber: { fontSize: 72, fontWeight: 900 },
  statText: { fontSize: 18 },
  nav: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 },
  navBtn: { background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.25)", borderRadius: 999, padding: "14px 18px", fontWeight: 900, fontSize: 16 },
  promiseGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 24, fontSize: 18 },
  searchPanel: { background: "#eaf1fb", color: "#0b1c3d", borderRadius: 30, padding: 30 },
  searchTitle: { fontSize: 54, lineHeight: 1, margin: "0 0 12px" },
  searchText: { color: "#4e6489", fontSize: 18, lineHeight: 1.6 },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #d7e3f4", borderRadius: 18, padding: 17, fontSize: 17, marginBottom: 12 },
  guestRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px 0" },
  guestBtn: { padding: "10px 14px", borderRadius: 10, border: "1px solid #d7e3f4", background: "#fff" },
  guestActive: { padding: "10px 14px", borderRadius: 10, border: "none", background: "#f1c644", fontWeight: 900 },
  filters: { background: "#fff", borderRadius: 20, padding: 16, border: "1px solid #d7e3f4" },
  filterGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 },
  checkLabel: { color: "#0b1c3d", fontSize: 15 },
  actionGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 },
  yellowBtn: { width: "100%", background: "#f1c644", color: "#07152f", border: "none", borderRadius: 18, padding: 16, fontWeight: 900, fontSize: 18 },
  blueBtn: { width: "100%", background: "#163a87", color: "#fff", border: "none", borderRadius: 18, padding: 16, fontWeight: 900, fontSize: 18 },
  mainGrid: { display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 24 },
  resultsPanel: { background: "#eef3fb", color: "#0b1c3d", borderRadius: 30, padding: 30 },
  resultsTitle: { fontSize: 52, margin: "0 0 18px" },
  resultsScroll: { maxHeight: 760, overflowY: "auto", display: "grid", gap: 18 },
  hotelCard: { background: "#fff", borderRadius: 24, overflow: "hidden", display: "grid", gridTemplateColumns: "300px 1fr", cursor: "pointer" },
  hotelImg: { width: "100%", height: "100%", minHeight: 240, objectFit: "cover" },
  hotelBody: { padding: 22 },
  hotelName: { fontSize: 32, color: "#163a87", margin: 0 },
  hotelLoc: { color: "#617aa7", fontSize: 17 },
  hotelSummary: { color: "#314766", fontSize: 17, lineHeight: 1.6 },
  facilities: { color: "#4b6085" },
  priceRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
  price: { fontSize: 30, color: "#163a87" },
  reserveBtn: { background: "#f1c644", border: "none", borderRadius: 16, padding: "14px 18px", fontWeight: 900 },
  reservePanel: { background: "#fff", color: "#0b1c3d", borderRadius: 30, padding: 30, alignSelf: "start", position: "sticky", top: 18 },
  reserveTitle: { fontSize: 48, color: "#163a87", lineHeight: 1, margin: "0 0 12px" },
  selectedBox: { background: "#f8fbff", border: "1px solid #d7e3f4", borderRadius: 22, padding: 18, marginBottom: 14 },
  selectedName: { color: "#163a87", fontSize: 24, margin: "0 0 8px" },
  formInput: { width: "100%", boxSizing: "border-box", padding: 16, borderRadius: 16, border: "1px solid #d7e3f4", marginBottom: 12, fontSize: 16 },
  textarea: { width: "100%", boxSizing: "border-box", padding: 16, borderRadius: 16, border: "1px solid #d7e3f4", marginBottom: 12, minHeight: 120, fontSize: 16 },
  message: { marginTop: 14, background: "#edf4ff", color: "#163a87", borderRadius: 16, padding: 14, lineHeight: 1.6 },
  emptyBox: { background: "#fff", color: "#163a87", borderRadius: 22, padding: 24, fontSize: 18 },
  infoPage: { maxWidth: 1000, margin: "0 auto", background: "linear-gradient(135deg,#163a87,#2d5fcb)", borderRadius: 30, padding: 40 },
  infoTitle: { fontSize: 62, marginBottom: 16 },
  infoText: { fontSize: 22, lineHeight: 1.8 },
  yellowBtnSmall: { background: "#f1c644", color: "#07152f", border: "none", borderRadius: 14, padding: "12px 18px", fontWeight: 900 },
};