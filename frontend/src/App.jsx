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

function normaliseCountry(value) {
  const v = value.trim().toLowerCase();

  if (["uk", "u.k", "gb", "great britain", "britain", "england"].includes(v)) {
    return "United Kingdom";
  }

  if (["usa", "us", "u.s", "u.s.a", "america", "united states of america"].includes(v)) {
    return "United States";
  }

  if (["uae", "u.a.e", "emirates"].includes(v)) {
    return "United Arab Emirates";
  }

  if (["ng", "nigeria"].includes(v)) {
    return "Nigeria";
  }

  if (["sa", "south africa"].includes(v)) {
    return "South Africa";
  }

  return value.trim();
}

export default function App() {
  const [pageView, setPageView] = useState("home");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [guests, setGuests] = useState(2);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalHotels, setTotalHotels] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", email: "", requests: "" });

  const facilityQuery = useMemo(() => selectedFacilities.join(","), [selectedFacilities]);

  async function searchHotels(nextPage = 1) {
    setLoading(true);
    setMessage("");

    const params = new URLSearchParams();
    const cleanCountry = normaliseCountry(country);

    if (cleanCountry) params.set("country", cleanCountry);
    if (city.trim()) params.set("city", city.trim());
    if (area.trim()) params.set("area", area.trim());
    if (facilityQuery) params.set("facilities", facilityQuery);

    params.set("adults", String(guests));
    params.set("page", String(nextPage));
    params.set("page_size", "12");

    try {
      const res = await fetch(`${API_BASE}/api/hotels?${params.toString()}`);
      const data = await res.json();
      const nextHotels = data.hotels || [];

      setHotels(nextHotels);
      setSelectedHotel(nextHotels[0] || null);
      setPage(data.page || nextPage);
      setTotalPages(data.total_pages || 1);
      setTotalHotels(data.count || 0);

      if (nextHotels.length === 0) {
        setMessage("No hotel matched this search. Try removing one filter or searching by city only.");
      }
    } catch {
      setMessage("Hotel search is temporarily unavailable. Please try again.");
      setHotels([]);
      setSelectedHotel(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    searchHotels(1);
  }, []);

  function toggleFacility(facility) {
    setSelectedFacilities((prev) =>
      prev.includes(facility)
        ? prev.filter((item) => item !== facility)
        : [...prev, facility]
    );
  }

  async function submitRequest() {
    if (!selectedHotel) {
      setMessage("Please select a hotel first.");
      return;
    }

    if (!form.name.trim() || !form.email.trim()) {
      setMessage("Please enter your name and email before sending your request.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          name: form.name.trim(),
          email: form.email.trim(),
          message: form.requests.trim(),
        }),
      });

      const data = await res.json();
      setMessage(data.message || "Your reservation request has been received.");
    } catch {
      setMessage("Your request could not be sent right now. Please try again.");
    }
  }

  if (pageView !== "home") {
    return (
      <InfoPage
        pageView={pageView}
        setPageView={setPageView}
        city={city || area || country || "your destination"}
      />
    );
  }

  return (
    <div style={styles.app}>
      <div style={styles.wrap}>
        <section style={styles.heroGrid}>
          <div style={styles.hero}>
            <div style={styles.kicker}>Worldwide hotel search</div>

            <h1 style={styles.title}>My Space Hotel</h1>

            <p style={styles.heroText}>
              Find hotels around the world, compare stays clearly, and send your
              reservation request with confidence.
            </p>

            <div style={styles.statBox}>
              <div style={styles.statLabel}>Matching stays found</div>
              <div style={styles.statNumber}>{totalHotels}</div>
              <div style={styles.statText}>
                hotel options available for your current search
              </div>
            </div>

            <div style={styles.nav}>
              <button style={styles.navBtn} onClick={() => setPageView("guide")}>
                Travel Guides
              </button>
              <button style={styles.navBtn} onClick={() => setPageView("faq")}>
                FAQs
              </button>
              <button style={styles.navBtn} onClick={() => setPageView("terms")}>
                Booking Terms
              </button>
              <button style={styles.navBtn} onClick={() => setPageView("support")}>
                Customer Support
              </button>
            </div>

            <div style={styles.promiseGrid}>
              <div>Search by country, city, or area</div>
              <div>Filter by facilities that matter</div>
              <div>Compare stays before you decide</div>
              <div>Request availability directly</div>
            </div>
          </div>

          <div style={styles.searchPanel}>
            <div style={styles.kickerDark}>Search</div>

            <h2 style={styles.searchTitle}>Choose the stay that fits your trip</h2>

            <p style={styles.searchText}>
              Search broadly or narrow your stay by destination, neighbourhood,
              and facilities.
            </p>

            <input
              style={styles.input}
              placeholder="Country, e.g. UK, USA, Nigeria, France"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="City, e.g. London, New York, Lagos, Dubai"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Area, e.g. Mayfair, Times Square, Lekki, Marina"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />

            <div style={styles.guestRow}>
              <b>Guests</b>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setGuests(n)}
                  style={guests === n ? styles.guestActive : styles.guestBtn}
                >
                  {n}
                </button>
              ))}
            </div>

            <div style={styles.filters}>
              <b>Choose preferred facilities</b>

              <div style={styles.filterGrid}>
                {FACILITIES.map((facility) => (
                  <label key={facility} style={styles.checkLabel}>
                    <input
                      type="checkbox"
                      checked={selectedFacilities.includes(facility)}
                      onChange={() => toggleFacility(facility)}
                    />
                    {facility}
                  </label>
                ))}
              </div>
            </div>

            <button style={styles.yellowBtn} onClick={() => searchHotels(1)}>
              {loading ? "Finding hotels..." : "Search hotels"}
            </button>
          </div>
        </section>

        <section style={styles.mainGrid}>
          <div style={styles.resultsPanel}>
            <div style={styles.kickerDark}>Available stays</div>

            <h2 style={styles.resultsTitle}>
              {loading
                ? "Finding hotel options..."
                : `${hotels.length} stays shown from ${totalHotels} matches`}
            </h2>

            <div style={styles.pageBar}>
              <button
                style={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => searchHotels(page - 1)}
              >
                Previous
              </button>

              <b>Page {page} of {totalPages}</b>

              <button
                style={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => searchHotels(page + 1)}
              >
                Next
              </button>
            </div>

            <div style={styles.resultsScroll}>
              {hotels.map((hotel) => (
                <div
                  key={hotel.id}
                  style={{
                    ...styles.hotelCard,
                    border:
                      selectedHotel?.id === hotel.id
                        ? "3px solid #f1c644"
                        : "1px solid #d7e3f4",
                  }}
                  onClick={() => setSelectedHotel(hotel)}
                >
                  {hotel.image && (
                    <img src={hotel.image} alt={hotel.name} style={styles.hotelImg} />
                  )}

                  <div style={styles.hotelBody}>
                    <h3 style={styles.hotelName}>{hotel.name}</h3>

                    <p style={styles.hotelLoc}>
                      {hotel.area}, {hotel.city}, {hotel.country}
                    </p>

                    <p style={styles.hotelSummary}>
                      {hotel.summary ||
                        "A stay option selected to help you compare location, facilities, and comfort before you request availability."}
                    </p>

                    <p style={styles.facilities}>
                      Facilities: {(hotel.facilities || []).join(", ")}
                    </p>

                    <div style={styles.priceRow}>
                      <b style={styles.price}>
                        {hotel.currency} {hotel.price}
                      </b>

                      <button
                        style={styles.reserveBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHotel(hotel);
                        }}
                      >
                        Select this stay
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {!loading && hotels.length === 0 && (
                <div style={styles.emptyBox}>{message}</div>
              )}
            </div>
          </div>

          <aside style={styles.reservePanel}>
            <div style={styles.kickerDark}>Request availability</div>

            <h2 style={styles.reserveTitle}>Send your reservation request</h2>

            <p style={styles.searchText}>
              Choose your preferred stay, add your details, and we will continue
              with your request.
            </p>

            <div style={styles.selectedBox}>
              {selectedHotel ? (
                <>
                  <h3 style={styles.selectedName}>{selectedHotel.name}</h3>

                  <p>
                    {selectedHotel.area}, {selectedHotel.city},{" "}
                    {selectedHotel.country}
                  </p>

                  <b style={styles.price}>
                    {selectedHotel.currency} {selectedHotel.price}
                  </b>
                </>
              ) : (
                <p>Select a hotel to continue.</p>
              )}
            </div>

            <input
              style={styles.formInput}
              placeholder="Your name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <input
              style={styles.formInput}
              placeholder="Your email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />

            <textarea
              style={styles.textarea}
              placeholder="Special requests, dates, room needs, or questions"
              value={form.requests}
              onChange={(e) => setForm({ ...form, requests: e.target.value })}
            />

            <button style={styles.yellowBtn} onClick={submitRequest}>
              Request availability
            </button>

            {message && <div style={styles.message}>{message}</div>}
          </aside>
        </section>
      </div>
    </div>
  );
}

function InfoPage({ pageView, setPageView, city }) {
  const pages = {
    guide: {
      title: `${city} smart travel guide`,
      eyebrow: "Plan with confidence",
      text:
        "A better hotel choice starts with a better understanding of the destination. Use the guide to think about location, access, facilities, comfort, trip purpose, and the kind of stay that will make your journey easier.",
      sections: [
        {
          title: "Choose the right area",
          body:
            "The best hotel is not always the cheapest or the most central. Choose an area that fits your trip: business, family, sightseeing, nightlife, relaxation, or a quick stopover.",
        },
        {
          title: "Compare what matters",
          body:
            "Look beyond the name of the hotel. Compare location, guest comfort, facilities, transport access, nearby restaurants, and how easy the stay will make your day.",
        },
        {
          title: "Return ready to search",
          body:
            "Once your destination choice is clearer, return to search and use country, city, area, and facility filters to find stronger hotel options.",
        },
      ],
    },

    faq: {
      title: "Frequently asked questions",
      eyebrow: "Clear answers before you request",
      text:
        "My Space Hotel helps you search globally, compare available stays, and send a reservation request directly from the platform.",
      sections: [
        {
          title: "Can I search with UK, USA, or UAE?",
          body:
            "Yes. You can use common country names and abbreviations. The search is designed to make destination entry easier for travellers.",
        },
        {
          title: "Do I pay immediately?",
          body:
            "No. You send a reservation request first. This helps you confirm interest, details, and next steps before any final booking arrangement.",
        },
        {
          title: "Can I narrow the search?",
          body:
            "Yes. You can search by country, city, area, guests, and facilities to find a stay that better fits your trip.",
        },
        {
          title: "Why use this platform?",
          body:
            "The aim is to reduce confusion. You can compare stays, focus on useful filters, and request availability from one clear place.",
        },
      ],
    },

    terms: {
      title: "Booking terms",
      eyebrow: "Important information before you request",
      text:
        "Please review these points so your reservation request is clear and confident.",
      sections: [
        {
          title: "Reservation request",
          body:
            "Submitting a request is not a final confirmed booking. Availability, pricing, and next steps must be confirmed before any final arrangement.",
        },
        {
          title: "Prices and availability",
          body:
            "Displayed rates help customers compare options. Prices and availability can change depending on dates, provider rules, demand, and property conditions.",
        },
        {
          title: "Customer details",
          body:
            "Please enter accurate contact details and useful request information so the reservation process can continue smoothly.",
        },
        {
          title: "Final booking conditions",
          body:
            "Final booking terms may depend on the hotel, partner, or provider handling the confirmed reservation.",
        },
      ],
    },

    support: {
      title: "Customer support",
      eyebrow: "Help when you need it",
      text:
        "Support is here to help you continue your search and reservation request with more confidence.",
      sections: [
        {
          title: "Reservation help",
          body:
            "For faster support, include your name, destination, selected hotel, travel dates, guest count, and any special requirements.",
        },
        {
          title: "Contact",
          body:
            "You can contact reservations@myspace-hotel.com for reservation support and customer enquiries.",
        },
        {
          title: "Before contacting support",
          body:
            "Search first, select your preferred stay, and submit your request where possible. This gives support the information needed to help you faster.",
        },
      ],
    },
  };

  const content = pages[pageView];

  return (
    <div style={styles.app}>
      <div style={styles.infoPage}>
        <button style={styles.yellowBtnSmall} onClick={() => setPageView("home")}>
          Return to search
        </button>

        <div style={styles.infoEyebrow}>{content.eyebrow}</div>

        <h1 style={styles.infoTitle}>{content.title}</h1>

        <p style={styles.infoText}>{content.text}</p>

        <div style={styles.infoGrid}>
          {content.sections.map((section) => (
            <div key={section.title} style={styles.infoCard}>
              <h2 style={styles.infoCardTitle}>{section.title}</h2>
              <p style={styles.infoCardText}>{section.body}</p>
            </div>
          ))}
        </div>

        <button style={styles.yellowBtn} onClick={() => setPageView("home")}>
          Continue hotel search
        </button>
      </div>
    </div>
  );
}

const styles = {
  app: {
    background: "#07152f",
    color: "#fff",
    minHeight: "100vh",
    padding: 20,
    fontFamily: "Arial, sans-serif",
  },
  wrap: { maxWidth: 1600, margin: "0 auto" },
  heroGrid: {
    display: "grid",
    gridTemplateColumns: "1.25fr 1fr",
    gap: 24,
    marginBottom: 24,
  },
  hero: {
    background: "linear-gradient(135deg,#163a87,#2d5fcb)",
    borderRadius: 30,
    padding: 34,
  },
  kicker: {
    letterSpacing: 3,
    textTransform: "uppercase",
    fontWeight: 800,
    opacity: 0.9,
  },
  kickerDark: {
    letterSpacing: 3,
    textTransform: "uppercase",
    fontWeight: 900,
    color: "#617aa7",
    marginBottom: 8,
  },
  title: { fontSize: 78, margin: "14px 0", lineHeight: 1 },
  heroText: {
    fontSize: 28,
    lineHeight: 1.45,
    maxWidth: 900,
    fontWeight: 700,
  },
  statBox: {
    background: "rgba(255,255,255,.12)",
    borderRadius: 24,
    padding: 22,
    width: 520,
    maxWidth: "100%",
  },
  statLabel: { fontSize: 18 },
  statNumber: { fontSize: 72, fontWeight: 900 },
  statText: { fontSize: 18 },
  nav: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 },
  navBtn: {
    background: "rgba(255,255,255,.12)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,.25)",
    borderRadius: 999,
    padding: "14px 18px",
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer",
  },
  promiseGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginTop: 24,
    fontSize: 18,
    fontWeight: 800,
  },
  searchPanel: {
    background: "#eaf1fb",
    color: "#0b1c3d",
    borderRadius: 30,
    padding: 30,
  },
  searchTitle: { fontSize: 54, lineHeight: 1, margin: "0 0 12px" },
  searchText: { color: "#4e6489", fontSize: 18, lineHeight: 1.6 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d7e3f4",
    borderRadius: 18,
    padding: 17,
    fontSize: 17,
    marginBottom: 12,
  },
  guestRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    margin: "12px 0",
  },
  guestBtn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #d7e3f4",
    background: "#fff",
    cursor: "pointer",
  },
  guestActive: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "none",
    background: "#f1c644",
    fontWeight: 900,
    cursor: "pointer",
  },
  filters: {
    background: "#fff",
    borderRadius: 20,
    padding: 16,
    border: "1px solid #d7e3f4",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 10,
  },
  checkLabel: { color: "#0b1c3d", fontSize: 15 },
  yellowBtn: {
    width: "100%",
    background: "#f1c644",
    color: "#07152f",
    border: "none",
    borderRadius: 18,
    padding: 16,
    fontWeight: 900,
    fontSize: 18,
    marginTop: 14,
    cursor: "pointer",
  },
  mainGrid: {
    display: "grid",
    gridTemplateColumns: "1.45fr 1fr",
    gap: 24,
  },
  resultsPanel: {
    background: "#eef3fb",
    color: "#0b1c3d",
    borderRadius: 30,
    padding: 30,
  },
  resultsTitle: { fontSize: 42, margin: "0 0 18px" },
  pageBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  pageBtn: {
    background: "#163a87",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "12px 18px",
    fontWeight: 900,
    cursor: "pointer",
  },
  resultsScroll: { maxHeight: 760, overflowY: "auto", display: "grid", gap: 18 },
  hotelCard: {
    background: "#fff",
    borderRadius: 24,
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns: "300px 1fr",
    cursor: "pointer",
  },
  hotelImg: { width: "100%", height: "100%", minHeight: 240, objectFit: "cover" },
  hotelBody: { padding: 22 },
  hotelName: { fontSize: 32, color: "#163a87", margin: 0 },
  hotelLoc: { color: "#617aa7", fontSize: 17 },
  hotelSummary: { color: "#314766", fontSize: 17, lineHeight: 1.6 },
  facilities: { color: "#4b6085" },
  priceRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  price: { fontSize: 30, color: "#163a87" },
  reserveBtn: {
    background: "#f1c644",
    border: "none",
    borderRadius: 16,
    padding: "14px 18px",
    fontWeight: 900,
    cursor: "pointer",
  },
  reservePanel: {
    background: "#fff",
    color: "#0b1c3d",
    borderRadius: 30,
    padding: 30,
    alignSelf: "start",
    position: "sticky",
    top: 18,
  },
  reserveTitle: {
    fontSize: 48,
    color: "#163a87",
    lineHeight: 1,
    margin: "0 0 12px",
  },
  selectedBox: {
    background: "#f8fbff",
    border: "1px solid #d7e3f4",
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
  },
  selectedName: { color: "#163a87", fontSize: 24, margin: "0 0 8px" },
  formInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: 16,
    borderRadius: 16,
    border: "1px solid #d7e3f4",
    marginBottom: 12,
    fontSize: 16,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: 16,
    borderRadius: 16,
    border: "1px solid #d7e3f4",
    marginBottom: 12,
    minHeight: 120,
    fontSize: 16,
  },
  message: {
    marginTop: 14,
    background: "#edf4ff",
    color: "#163a87",
    borderRadius: 16,
    padding: 14,
    lineHeight: 1.6,
  },
  emptyBox: {
    background: "#fff",
    color: "#163a87",
    borderRadius: 22,
    padding: 24,
    fontSize: 18,
  },
  infoPage: {
    maxWidth: 1200,
    margin: "0 auto",
    background: "linear-gradient(135deg,#163a87,#2d5fcb)",
    borderRadius: 30,
    padding: 40,
  },
  infoEyebrow: {
    marginTop: 28,
    letterSpacing: 3,
    textTransform: "uppercase",
    fontWeight: 900,
    opacity: 0.85,
  },
  infoTitle: { fontSize: 64, marginBottom: 16, lineHeight: 1 },
  infoText: { fontSize: 22, lineHeight: 1.8 },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    marginTop: 24,
  },
  infoCard: {
    background: "rgba(255,255,255,.12)",
    borderRadius: 22,
    padding: 22,
    border: "1px solid rgba(255,255,255,.18)",
  },
  infoCardTitle: { marginTop: 0, color: "#f1c644" },
  infoCardText: { fontSize: 18, lineHeight: 1.7 },
  yellowBtnSmall: {
    background: "#f1c644",
    color: "#07152f",
    border: "none",
    borderRadius: 14,
    padding: "12px 18px",
    fontWeight: 900,
    cursor: "pointer",
  },
};