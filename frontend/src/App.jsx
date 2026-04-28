import React, { useMemo, useState } from "react";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";
const SUPPORT_EMAIL = "reservations@myspace-hotel.com";
const PAGE_SIZE = 48;

const FACILITY_OPTIONS = [
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

function cleanFacilities(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value.split(",").map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

function hotelImage(hotel) {
  return hotel.high_res_image || hotel.image || "";
}

function priceLabel(hotel) {
  const price = Number(hotel.price || 0);
  if (!price) return "Latest price confirmed before payment";
  return `${hotel.currency || "LOCAL"} ${price.toLocaleString()}`;
}

function infoPageContent(page) {
  const pages = {
    guides: {
      title: "Travel Guides",
      text: "Explore destination highlights, city maps, local areas, and practical travel notes before choosing your stay.",
      bullets: [
        "Understand the best areas before booking.",
        "Use maps to check location and transport links.",
        "Compare hotels by comfort, facilities, and convenience.",
      ],
    },
    faq: {
      title: "FAQs",
      text: "Answers to common booking questions before customers send a reservation request.",
      bullets: [
        "Search by country, city, area, or hotel name.",
        "Select a hotel and send an availability request.",
        "Payment is completed only after availability and price are confirmed.",
      ],
    },
    terms: {
      title: "Booking Terms",
      text: "Reservation requests are subject to hotel availability, final supplier price confirmation, and successful payment.",
      bullets: [
        "Prices can change until confirmed by the hotel/supplier.",
        "Your booking is not final until payment is completed.",
        "My Space Hotel helps coordinate the reservation request and confirmation path.",
      ],
    },
    support: {
      title: "Customer Support",
      text: `Need help with a search or reservation request? Contact ${SUPPORT_EMAIL}.`,
      bullets: [
        "Use the same email address submitted in your request.",
        "Include the hotel name and destination.",
        "Support will continue with you by email.",
      ],
    },
  };
  return pages[page] || pages.guides;
}

export default function App() {
  const [activePage, setActivePage] = useState("home");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [guests, setGuests] = useState(2);

  const [hotels, setHotels] = useState([]);
  const [count, setCount] = useState(0);
  const [hotelPage, setHotelPage] = useState(1);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)),
    [count]
  );

  const filteredHotels = useMemo(() => {
    if (!selectedFacilities.length) return hotels;
    return hotels.filter((hotel) => {
      const facilities = cleanFacilities(hotel.facilities).map((x) =>
        x.toLowerCase()
      );
      return selectedFacilities.every((f) =>
        facilities.some((item) => item.includes(f.toLowerCase()))
      );
    });
  }, [hotels, selectedFacilities]);

  function toggleFacility(name) {
    setSelectedFacilities((current) =>
      current.includes(name)
        ? current.filter((x) => x !== name)
        : [...current, name]
    );
  }

  async function searchHotels(nextPage = 1) {
    setLoading(true);
    setNotice("");
    setHotelPage(nextPage);
    setSelectedHotel(null);

    const params = new URLSearchParams({
      page: String(nextPage),
      page_size: String(PAGE_SIZE),
      adults: String(guests),
    });

    if (country.trim()) params.set("country", country.trim());
    if (city.trim()) params.set("city", city.trim());
    if (area.trim()) params.set("area", area.trim());
    if (keyword.trim()) params.set("q", keyword.trim());

    try {
      const res = await fetch(`${API_BASE}/api/hotels-safe?${params.toString()}`);
      const data = await res.json();

      setHotels(data.hotels || []);
      setCount(data.count || 0);

      if (!data.hotels || data.hotels.length === 0) {
        setNotice(
          data.message ||
            "No matching hotels found yet. Try country + city, for example UK and London."
        );
      }
    } catch {
      setNotice("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitReservation() {
    if (!selectedHotel) {
      setNotice("Please select a hotel first.");
      return;
    }
    if (!customerName.trim() || !customerEmail.trim()) {
      setNotice("Please enter your name and email.");
      return;
    }

    setLoading(true);
    setNotice("");

    try {
      const res = await fetch(`${API_BASE}/api/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          name: customerName,
          email: customerEmail,
          message:
            customerMessage ||
            `Reservation request for ${selectedHotel.name}. Guests: ${guests}.`,
        }),
      });

      const data = await res.json();

      if (data.status === "received" || data.status === "reservation_received") {
        setNotice(
          "Reservation request received. Please check your email for confirmation."
        );
      } else {
        setNotice(data.message || "Reservation request could not be completed.");
      }
    } catch {
      setNotice("Reservation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (activePage !== "home") {
    const page = infoPageContent(activePage);
    return (
      <main style={styles.shell}>
        <section style={styles.infoPage}>
          <button style={styles.backBtn} onClick={() => setActivePage("home")}>
            Back to hotel search
          </button>
          <h1>{page.title}</h1>
          <p>{page.text}</p>
          <div style={styles.infoGrid}>
            {page.bullets.map((item) => (
              <div key={item} style={styles.infoCard}>
                {item}
              </div>
            ))}
          </div>
          <iframe
            title="Destination map"
            src={`https://www.google.com/maps?q=${encodeURIComponent(
              city || "London"
            )}&output=embed`}
            width="100%"
            height="420"
            style={styles.mapLarge}
            loading="lazy"
          />
        </section>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      <section style={styles.hero}>
        <div style={styles.heroLeft}>
          <div style={styles.kicker}>MY SPACE HOTEL</div>
          <h1>Find hotels around the world, compare stays clearly, and request availability with confidence.</h1>
          <p>
            Search real hotel records, compare location, facilities, images,
            ratings, and continue only when the stay fits your trip.
          </p>

          <div style={styles.statBox}>
            <span>{count ? count.toLocaleString() : "50,015+"}</span>
            <small>real hotel records available</small>
          </div>

          <div style={styles.navBoxes}>
            <button onClick={() => setActivePage("guides")}>Travel Guides</button>
            <button onClick={() => setActivePage("faq")}>FAQs</button>
            <button onClick={() => setActivePage("terms")}>Booking Terms</button>
            <button onClick={() => setActivePage("support")}>Customer Support</button>
          </div>

          <div style={styles.promiseGrid}>
            <strong>Search by country, city, or area</strong>
            <strong>Filter by facilities that matter</strong>
            <strong>Compare stays before you decide</strong>
            <strong>Request availability directly</strong>
          </div>
        </div>

        <div style={styles.searchPanel}>
          <h2>Search real hotels</h2>
          <p>Search broadly or narrow your stay by destination, neighbourhood, and facilities.</p>

          <input style={styles.input} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country, e.g. UK, USA, Nigeria" />
          <input style={styles.input} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City, e.g. London, Benin City, Paris" />
          <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area, e.g. Mayfair, Lekki, City Centre" />
          <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or keyword" />

          <div style={styles.guestRow}>
            <strong>Guests</strong>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                style={guests === n ? styles.guestActive : styles.guestBtn}
                onClick={() => setGuests(n)}
              >
                {n}
              </button>
            ))}
          </div>

          <div style={styles.facilityPanel}>
            <strong>Choose preferred facilities</strong>
            <div style={styles.facilityChecks}>
              {FACILITY_OPTIONS.map((f) => (
                <label key={f}>
                  <input
                    type="checkbox"
                    checked={selectedFacilities.includes(f)}
                    onChange={() => toggleFacility(f)}
                  />{" "}
                  {f}
                </label>
              ))}
            </div>
          </div>

          <button style={styles.searchBtn} onClick={() => searchHotels(1)}>
            {loading ? "Searching..." : "Search hotels"}
          </button>

          {notice && <div style={styles.notice}>{notice}</div>}
        </div>
      </section>

      <section style={styles.contentGrid}>
        <div style={styles.resultsPanel}>
          <div style={styles.panelKicker}>Available Stays</div>
          <h2>
            {filteredHotels.length} stays shown from {count.toLocaleString()} matches
          </h2>

          <div style={styles.pager}>
            <button disabled={hotelPage <= 1 || loading} onClick={() => searchHotels(hotelPage - 1)}>
              Previous
            </button>
            <strong>Page {hotelPage} of {totalPages}</strong>
            <button disabled={loading || hotelPage >= totalPages} onClick={() => searchHotels(hotelPage + 1)}>
              Next
            </button>
          </div>

          <div style={styles.hotelList}>
            {filteredHotels.map((hotel) => {
              const facilities = cleanFacilities(hotel.facilities);
              const image = hotelImage(hotel);

              return (
                <article
                  key={hotel.id}
                  style={{
                    ...styles.hotelCard,
                    borderColor:
                      selectedHotel?.id === hotel.id ? "#f4c430" : "#dbe6f7",
                  }}
                >
                  {image ? (
                    <img src={image} alt={hotel.name} style={styles.hotelImg} loading="lazy" referrerPolicy="no-referrer" />
                  ) : (
                    <div style={styles.noImage}>Image being verified</div>
                  )}

                  <div style={styles.hotelBody}>
                    <h3>{hotel.name}</h3>
                    <p style={styles.location}>
                      {[hotel.area, hotel.city, hotel.country].filter(Boolean).join(", ")}
                    </p>
                    <p style={styles.summary}>
                      {hotel.summary || hotel.description || "Real hotel option from the live supplier database."}
                    </p>

                    <div style={styles.price}>{priceLabel(hotel)}</div>

                    <div style={styles.facilityTags}>
                      {facilities.length ? (
                        facilities.slice(0, 8).map((f) => (
                          <span key={f}>âœ“ {f}</span>
                        ))
                      ) : (
                        <span>Facilities being verified</span>
                      )}
                    </div>

                    {hotel.map_url && (
                      <a href={hotel.map_url} target="_blank" rel="noreferrer" style={styles.mapLink}>
                        Open hotel location map
                      </a>
                    )}

                    <button
                      style={styles.selectBtn}
                      onClick={() => setSelectedHotel(hotel)}
                    >
                      Select this stay
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div style={styles.reservePanel}>
          <div style={styles.panelKicker}>Request Availability</div>
          <h2>Send your reservation request</h2>
          <p>Choose your preferred stay, add your details, and we will continue with your request.</p>

          <div style={styles.selectedBox}>
            {selectedHotel ? (
              <>
                <h3>{selectedHotel.name}</h3>
                <p>{[selectedHotel.area, selectedHotel.city, selectedHotel.country].filter(Boolean).join(", ")}</p>
                <strong>{priceLabel(selectedHotel)}</strong>
              </>
            ) : (
              <p>Select a hotel from the list to continue.</p>
            )}
          </div>

          <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your name" />
          <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Your email" />
          <textarea style={styles.textarea} value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} placeholder="Special requests, dates, room needs, or questions" />

          <button style={styles.reserveBtn} onClick={submitReservation}>
            {loading ? "Sending..." : "Request availability"}
          </button>

          <button style={styles.paymentBtn} onClick={submitReservation}>
            Reserve first, then receive secure payment link
          </button>
        </div>
      </section>

      <footer style={styles.footer}>
        Support: {SUPPORT_EMAIL}
      </footer>
    </main>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    background: "#06142b",
    color: "#071a3a",
    padding: 24,
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.95fr",
    gap: 24,
  },
  heroLeft: {
    background: "linear-gradient(140deg,#173f93,#2f63d5)",
    borderRadius: 28,
    color: "white",
    padding: 38,
  },
  kicker: {
    letterSpacing: 8,
    fontWeight: 900,
    marginBottom: 24,
  },
  statBox: {
    background: "rgba(255,255,255,0.16)",
    borderRadius: 18,
    padding: 22,
    width: 320,
    marginTop: 24,
  },
  navBoxes: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 24,
  },
  promiseGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    marginTop: 26,
    fontSize: 20,
  },
  searchPanel: {
    background: "#edf5ff",
    borderRadius: 28,
    padding: 28,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: 16,
    borderRadius: 16,
    border: "1px solid #cbd8ea",
    marginTop: 12,
    fontSize: 16,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    padding: 16,
    borderRadius: 16,
    border: "1px solid #cbd8ea",
    marginTop: 12,
    minHeight: 120,
    fontSize: 16,
  },
  guestRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 16,
  },
  guestBtn: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #d5e1f0",
    background: "white",
    cursor: "pointer",
  },
  guestActive: {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid #f4c430",
    background: "#f4c430",
    fontWeight: 900,
    cursor: "pointer",
  },
  facilityPanel: {
    marginTop: 16,
    background: "white",
    padding: 18,
    borderRadius: 18,
  },
  facilityChecks: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  },
  searchBtn: {
    width: "100%",
    marginTop: 16,
    padding: 18,
    borderRadius: 16,
    border: "2px solid #06142b",
    background: "#f4c430",
    fontWeight: 900,
    fontSize: 18,
    cursor: "pointer",
  },
  notice: {
    marginTop: 14,
    background: "#fff3cd",
    padding: 12,
    borderRadius: 12,
    fontWeight: 700,
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.85fr",
    gap: 24,
    marginTop: 24,
  },
  resultsPanel: {
    background: "#eef4ff",
    borderRadius: 28,
    padding: 24,
  },
  reservePanel: {
    background: "white",
    borderRadius: 28,
    padding: 28,
    alignSelf: "start",
    position: "sticky",
    top: 18,
  },
  panelKicker: {
    letterSpacing: 6,
    color: "#59739e",
    fontWeight: 900,
    textTransform: "uppercase",
  },
  pager: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  hotelList: {
    display: "grid",
    gap: 18,
    maxHeight: 720,
    overflowY: "auto",
    paddingRight: 8,
  },
  hotelCard: {
    display: "grid",
    gridTemplateColumns: "280px 1fr",
    background: "white",
    border: "3px solid #dbe6f7",
    borderRadius: 22,
    overflow: "hidden",
  },
  hotelImg: {
    width: "100%",
    height: "100%",
    minHeight: 260,
    objectFit: "cover",
  },
  noImage: {
    minHeight: 260,
    display: "grid",
    placeItems: "center",
    background: "#dbe6f7",
    fontWeight: 900,
  },
  hotelBody: {
    padding: 22,
  },
  location: {
    color: "#4d6793",
    fontWeight: 700,
  },
  summary: {
    lineHeight: 1.45,
    color: "#223a5f",
  },
  price: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: 900,
    color: "#0d3a85",
  },
  facilityTags: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  mapLink: {
    display: "inline-block",
    marginTop: 14,
    fontWeight: 900,
    color: "#0d3a85",
  },
  selectBtn: {
    marginTop: 14,
    padding: "14px 18px",
    border: "none",
    borderRadius: 14,
    background: "#f4c430",
    fontWeight: 900,
    cursor: "pointer",
  },
  selectedBox: {
    background: "#f3f7fd",
    border: "1px solid #d7e2f2",
    borderRadius: 18,
    padding: 18,
    marginTop: 16,
  },
  reserveBtn: {
    width: "100%",
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    border: "none",
    background: "#f4c430",
    fontWeight: 900,
    fontSize: 18,
    cursor: "pointer",
  },
  paymentBtn: {
    width: "100%",
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    border: "2px solid #0d3a85",
    background: "white",
    color: "#0d3a85",
    fontWeight: 900,
    cursor: "pointer",
  },
  footer: {
    color: "white",
    textAlign: "center",
    padding: 24,
  },
  infoPage: {
    background: "#0d2759",
    color: "white",
    borderRadius: 26,
    padding: 32,
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 16,
    marginTop: 24,
  },
  infoCard: {
    background: "#24469b",
    borderRadius: 16,
    padding: 18,
  },
  backBtn: {
    background: "#f4c430",
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    fontWeight: 900,
    cursor: "pointer",
  },
  mapLarge: {
    border: 0,
    borderRadius: 18,
    marginTop: 28,
  },
};

