import React, { useMemo, useState } from "react";
import TravelPages from "./TravelPages";

const API_BASE =
  import.meta.env.VITE_API_BASE || "https://hotel-backend-1-ee5z.onrender.com";

const SUPPORT_EMAIL = "reservations@myspace-hotel.com";
const PAGE_SIZE = 48;

function cleanFacilities(facilities) {
  if (!facilities) return [];
  if (Array.isArray(facilities)) return facilities.filter(Boolean);
  if (typeof facilities === "string") {
    return facilities.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function hotelImage(hotel) {
  return hotel.high_res_image || hotel.image || "";
}

function priceLabel(hotel) {
  if (!hotel.price || Number(hotel.price) <= 0) {
    return "Latest price confirmed before booking";
  }
  return `${hotel.currency || "LOCAL"} ${Number(hotel.price).toLocaleString()}`;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [q, setQ] = useState("");
  const [hotelPage, setHotelPage] = useState(1);
  const [hotels, setHotels] = useState([]);
  const [count, setCount] = useState(0);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [loading, setLoading] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil((count || 0) / PAGE_SIZE));
  }, [count]);

  async function searchHotels(nextPage = 1) {
    setLoading(true);
    setHotelPage(nextPage);
    setSelectedHotel(null);

    const params = new URLSearchParams({
      page: String(nextPage),
      page_size: String(PAGE_SIZE),
    });

    if (country.trim()) params.set("country", country.trim());
    if (city.trim()) params.set("city", city.trim());
    if (area.trim()) params.set("area", area.trim());
    if (q.trim()) params.set("q", q.trim());

    try {
      const res = await fetch(`${API_BASE}/api/hotels?${params.toString()}`);
      const data = await res.json();

      setHotels(data.hotels || []);
      setCount(data.count || 0);

      if (!data.hotels || data.hotels.length === 0) {
        alert(data.message || "No hotels found for this search yet.");
      }
    } catch {
      alert("Search failed. Please check the backend connection.");
    } finally {
      setLoading(false);
    }
  }

  async function reserveHotel() {
    if (!selectedHotel) return alert("Please select a hotel first.");
    if (!customerName.trim() || !customerEmail.trim()) {
      return alert("Please enter your name and email.");
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          name: customerName,
          email: customerEmail,
          message: `Reservation request for ${selectedHotel.name}`,
        }),
      });

      const data = await res.json();

      if (data.status === "received") {
        alert("Reservation received. Please check your email.");
      } else {
        alert(data.message || "Reservation could not be completed.");
      }
    } catch {
      alert("Reservation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (page === "travel") {
    return <TravelPages city={city || "London"} />;
  }

  return (
    <main style={styles.shell}>
      <section style={styles.hero}>
        <div style={styles.heroLeft}>
          <div style={styles.kicker}>MY SPACE HOTEL</div>
          <h1 style={styles.title}>Find the right stay with real hotel data.</h1>
          <p style={styles.subtitle}>
            Search 50,000+ real hotel records, compare location, facilities,
            images, ratings, and reserve with confidence.
          </p>

          <div style={styles.stats}>
            <strong>{count ? count.toLocaleString() : "50,015+"}</strong>
            <span>real hotel records available</span>
          </div>

          <button style={styles.travelBtn} onClick={() => setPage("travel")}>
            Explore Travel Guides
          </button>
        </div>

        <div style={styles.searchBox}>
          <h2>Search hotels</h2>

          <input
            style={styles.input}
            placeholder="Country, e.g. UK, USA, Nigeria, France"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />

          <input
            style={styles.input}
            placeholder="City, e.g. Benin City, London, Paris, Dubai"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />

          <input
            style={styles.input}
            placeholder="Area or district, e.g. City Centre, Lekki, Mayfair"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />

          <input
            style={styles.input}
            placeholder="Hotel name or keyword"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <button style={styles.searchBtn} onClick={() => searchHotels(1)}>
            {loading ? "Searching..." : "Search real hotels"}
          </button>
        </div>
      </section>

      {hotels.length > 0 && (
        <section style={styles.results}>
          <div style={styles.resultsTop}>
            <div>
              <h2>Available hotel matches</h2>
              <p>
                Showing {hotels.length} of {count.toLocaleString()} results â€”
                page {hotelPage} of {totalPages}.
              </p>
            </div>

            <div style={styles.pageButtons}>
              <button
                style={styles.smallBtn}
                disabled={hotelPage <= 1 || loading}
                onClick={() => searchHotels(hotelPage - 1)}
              >
                Previous
              </button>
              <button
                style={styles.smallBtn}
                disabled={loading}
                onClick={() => searchHotels(hotelPage + 1)}
              >
                Next
              </button>
            </div>
          </div>

          <div style={styles.grid}>
            {hotels.map((hotel) => {
              const facilities = cleanFacilities(hotel.facilities);
              const image = hotelImage(hotel);

              return (
                <article
                  key={hotel.id}
                  style={{
                    ...styles.card,
                    border:
                      selectedHotel?.id === hotel.id
                        ? "4px solid #f5c542"
                        : "1px solid #d8e3f3",
                  }}
                >
                  {image ? (
                    <img
                      src={image}
                      alt={hotel.name}
                      style={styles.image}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div style={styles.noImage}>Image pending</div>
                  )}

                  <div style={styles.cardBody}>
                    <h3>{hotel.name}</h3>

                    <p style={styles.location}>
                      {[hotel.area, hotel.city, hotel.country]
                        .filter(Boolean)
                        .join(", ")}
                    </p>

                    <p style={styles.summary}>
                      {hotel.summary ||
                        hotel.description ||
                        "Real hotel option from the supplier database."}
                    </p>

                    <div style={styles.price}>{priceLabel(hotel)}</div>

                    <div style={styles.rating}>
                      Rating: {hotel.rating || "Customer rating pending"}
                    </div>

                    {facilities.length > 0 ? (
                      <div style={styles.facilities}>
                        {facilities.slice(0, 8).map((f) => (
                          <span key={f} style={styles.facility}>
                            âœ“ {f}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p style={styles.pendingFacilities}>
                        Facilities are being verified.
                      </p>
                    )}

                    {hotel.map_url && (
                      <iframe
                        title={`Map ${hotel.id}`}
                        src={`${hotel.map_url}&output=embed`}
                        width="100%"
                        height="180"
                        style={styles.map}
                        loading="lazy"
                      />
                    )}

                    <button
                      style={styles.selectBtn}
                      onClick={() => {
                        setSelectedHotel(hotel);
                        setTimeout(() => {
                          document
                            .getElementById("reserve-panel")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }, 100);
                      }}
                    >
                      Select this hotel
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {selectedHotel && (
        <section id="reserve-panel" style={styles.reservePanel}>
          <h2>Reserve selected hotel</h2>
          <p>
            <strong>{selectedHotel.name}</strong> â€”{" "}
            {[selectedHotel.area, selectedHotel.city, selectedHotel.country]
              .filter(Boolean)
              .join(", ")}
          </p>

          <div style={styles.reserveGrid}>
            <input
              style={styles.input}
              placeholder="Your full name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />

            <input
              style={styles.input}
              placeholder="Your email address"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </div>

          <button style={styles.reserveBtn} onClick={reserveHotel}>
            {loading ? "Sending..." : "Send reservation request"}
          </button>
        </section>
      )}

      <footer style={styles.footer}>
        Customer support: {SUPPORT_EMAIL}
      </footer>
    </main>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    background: "#07152f",
    color: "#10213f",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 22,
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.15fr 0.85fr",
    gap: 22,
  },
  heroLeft: {
    borderRadius: 28,
    padding: 38,
    background: "linear-gradient(140deg,#153b8a,#295ed6)",
    color: "white",
  },
  kicker: {
    letterSpacing: 6,
    fontWeight: 900,
    opacity: 0.9,
  },
  title: {
    fontSize: 58,
    lineHeight: 1,
    margin: "26px 0",
  },
  subtitle: {
    fontSize: 22,
    lineHeight: 1.45,
    maxWidth: 760,
    fontWeight: 700,
  },
  stats: {
    marginTop: 28,
    padding: 22,
    borderRadius: 20,
    background: "rgba(255,255,255,0.14)",
    display: "flex",
    flexDirection: "column",
    maxWidth: 360,
  },
  travelBtn: {
    marginTop: 22,
    background: "#f5c542",
    color: "#07152f",
    border: "none",
    borderRadius: 16,
    padding: "16px 22px",
    fontWeight: 900,
    cursor: "pointer",
  },
  searchBox: {
    borderRadius: 28,
    padding: 28,
    background: "#edf5ff",
  },
  input: {
    width: "100%",
    padding: "16px 18px",
    borderRadius: 16,
    border: "1px solid #c9d7eb",
    marginTop: 12,
    fontSize: 16,
    boxSizing: "border-box",
  },
  searchBtn: {
    width: "100%",
    marginTop: 14,
    background: "#f5c542",
    color: "#07152f",
    border: "2px solid #07152f",
    borderRadius: 16,
    padding: 18,
    fontSize: 18,
    fontWeight: 900,
    cursor: "pointer",
  },
  results: {
    marginTop: 22,
    background: "#f6f9ff",
    borderRadius: 26,
    padding: 24,
  },
  resultsTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 18,
    alignItems: "center",
  },
  pageButtons: {
    display: "flex",
    gap: 10,
  },
  smallBtn: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #b6c5db",
    background: "white",
    cursor: "pointer",
    fontWeight: 800,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))",
    gap: 20,
    marginTop: 20,
  },
  card: {
    background: "white",
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: "0 12px 28px rgba(10,25,50,0.08)",
  },
  image: {
    width: "100%",
    height: 240,
    objectFit: "cover",
    imageRendering: "auto",
    background: "#dfe8f7",
  },
  noImage: {
    height: 240,
    display: "grid",
    placeItems: "center",
    background: "#dfe8f7",
    fontWeight: 900,
    color: "#52657e",
  },
  cardBody: {
    padding: 18,
  },
  location: {
    color: "#4f668a",
    fontWeight: 800,
  },
  summary: {
    color: "#405473",
    lineHeight: 1.45,
  },
  price: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: 900,
    color: "#0b3277",
  },
  rating: {
    marginTop: 8,
    fontWeight: 800,
  },
  facilities: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  facility: {
    background: "#e8f1ff",
    color: "#123b7a",
    borderRadius: 999,
    padding: "8px 10px",
    fontSize: 13,
    fontWeight: 800,
  },
  pendingFacilities: {
    marginTop: 12,
    color: "#7a8798",
    fontWeight: 700,
  },
  map: {
    marginTop: 14,
    border: 0,
    borderRadius: 14,
  },
  selectBtn: {
    width: "100%",
    marginTop: 14,
    background: "#153b8a",
    color: "white",
    border: "none",
    borderRadius: 14,
    padding: 14,
    fontWeight: 900,
    cursor: "pointer",
  },
  reservePanel: {
    marginTop: 22,
    background: "white",
    borderRadius: 26,
    padding: 26,
  },
  reserveGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  reserveBtn: {
    marginTop: 16,
    background: "#153b8a",
    color: "white",
    border: "none",
    borderRadius: 14,
    padding: "15px 20px",
    fontWeight: 900,
    cursor: "pointer",
  },
  footer: {
    color: "white",
    textAlign: "center",
    padding: 26,
  },
};
