import React, { useEffect, useMemo, useState } from "react";
import TravelPages from "./TravelPages";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://hotel-backend-1-ee5z.onrender.com";

const SUPPORT_EMAIL = "reservations@myspace-hotel.com";

const facilitiesList = [
  "wifi",
  "gym",
  "pool",
  "airport shuttle",
  "beach access",
  "spa",
  "restaurant",
  "parking",
  "family rooms",
  "business lounge",
];

function moneyLabel(hotel) {
  if (!hotel?.price) return `Request availability`;
  return `${hotel.currency || "LOCAL"} ${Number(hotel.price).toLocaleString()}`;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [guests, setGuests] = useState(2);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [count, setCount] = useState(0);
  const [hotelPage, setHotelPage] = useState(1);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [loading, setLoading] = useState(false);

  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paymentCode, setPaymentCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [bookingMessage, setBookingMessage] = useState("");

  const pageSize = 24;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const bookingId = params.get("booking_id");

    if (payment === "success" && bookingId) {
      setPage("success");
      confirmBooking(bookingId);
    }

    if (payment === "cancelled") {
      setPage("cancel");
    }
  }, []);

  async function confirmBooking(bookingId) {
    try {
      const res = await fetch(
        `${API_BASE}/api/booking/confirm?booking_id=${encodeURIComponent(
          bookingId
        )}`
      );
      const data = await res.json();
      setBookingMessage(
        data?.message || "Booking confirmation has been received."
      );
    } catch {
      setBookingMessage(
        "Payment succeeded. Booking confirmation is being processed."
      );
    }
  }

  async function searchHotels(nextPage = 1) {
    setLoading(true);
    setHotelPage(nextPage);
    setSelectedHotel(null);
    setCodeSent(false);
    setVerified(false);
    setPaymentCode("");
    setBookingMessage("");

    const params = new URLSearchParams({
      country,
      city,
      area,
      adults: String(guests),
      page: String(nextPage),
      page_size: String(pageSize),
      facilities: selectedFacilities.join(","),
    });

    try {
      const res = await fetch(`${API_BASE}/api/hotels?${params.toString()}`);
      const data = await res.json();

      setHotels(data.hotels || []);
      setCount(data.count || 0);
      setPage("home");
    } catch {
      alert("Search failed. Please check backend deployment and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function sendPaymentCode() {
    if (!selectedHotel) return alert("Please select a hotel first.");
    if (!customerEmail) return alert("Please enter your email.");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payment-code/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          email: customerEmail,
        }),
      });

      const data = await res.json();

      if (data.status === "sent" || data.status === "email_not_configured") {
        setCodeSent(true);
        alert(data.message || "Payment access code sent.");
      } else {
        alert(data.message || "Could not send code.");
      }
    } catch {
      alert("Could not send payment code.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyPaymentCode() {
    if (!paymentCode) return alert("Enter the code from your email.");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payment-code/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          email: customerEmail,
          code: paymentCode,
        }),
      });

      const data = await res.json();

      if (data.verified) {
        setVerified(true);
        alert("Email verified. You can now continue to payment.");
      } else {
        alert(data.message || "Code incorrect or expired.");
      }
    } catch {
      alert("Could not verify payment code.");
    } finally {
      setLoading(false);
    }
  }

  async function payNow() {
    if (!verified) return alert("Please verify your email code first.");
    if (!selectedHotel) return alert("Please select a hotel.");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payment/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          hotel_name: selectedHotel.name,
          email: customerEmail,
          amount: 15000,
        }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Payment could not be started.");
      }
    } catch {
      alert("Payment could not be started.");
    } finally {
      setLoading(false);
    }
  }

  async function reserveOnly() {
    if (!selectedHotel) return alert("Please select a hotel.");
    if (!customerEmail || !customerName)
      return alert("Please enter your name and email.");

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
     if (data.email_delivery?.customer_sent) {
  alert("Reservation received. Confirmation email sent to the customer.");
} else {
  alert(
    "Reservation received, but confirmation email was not sent. Please check backend SMTP settings on Render."
  );
}
    } catch {
      alert("Reservation request failed.");
    } finally {
      setLoading(false);
    }
  }

  const headlineCount = useMemo(() => {
    return count ? count.toLocaleString() : "2,100,000";
  }, [count]);

  if (page === "travel") return <TravelPages city={city || "London"} />;

  if (page === "success") {
    return (
      <main style={styles.shell}>
        <section style={styles.successBox}>
          <h1>Booking payment received</h1>
          <p>{bookingMessage || "Confirming your booking..."}</p>
          <button style={styles.primaryBtn} onClick={() => setPage("home")}>
            Return to hotel search
          </button>
        </section>
      </main>
    );
  }

  if (page === "cancel") {
    return (
      <main style={styles.shell}>
        <section style={styles.successBox}>
          <h1>Payment was not completed</h1>
          <p>Your booking has not been paid. You can return and try again.</p>
          <button style={styles.primaryBtn} onClick={() => setPage("home")}>
            Return to hotel search
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.shell}>
      <section style={styles.hero}>
        <div style={styles.leftPanel}>
          <div style={styles.kicker}>WORLDWIDE HOTEL SEARCH</div>
          <h1 style={styles.logoTitle}>My Space Hotel</h1>
          <p style={styles.heroText}>
            Find hotels around the world, compare stays clearly, and send your
            reservation request with confidence.
          </p>

          <div style={styles.counterBox}>
            <p>Matching stays found</p>
            <strong>{headlineCount}</strong>
            <span>hotel options available for your current search</span>
          </div>

          <div style={styles.navRow}>
            <button style={styles.navPill} onClick={() => setPage("travel")}>
              Travel Guides
            </button>
            <button style={styles.navPill}>FAQs</button>
            <button style={styles.navPill}>Booking Terms</button>
            <button style={styles.navPill}>Customer Support</button>
          </div>

          <div style={styles.featureGrid}>
            <b>Search by country, city, or area</b>
            <b>Filter by facilities that matter</b>
            <b>Compare stays before you decide</b>
            <b>Reserve or pay securely</b>
          </div>
        </div>

        <div style={styles.searchPanel}>
          <div style={styles.kickerDark}>SEARCH</div>
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
                style={guests === n ? styles.guestActive : styles.guestBtn}
                onClick={() => setGuests(n)}
              >
                {n}
              </button>
            ))}
          </div>

          <div style={styles.facilityBox}>
            <b>Choose preferred facilities</b>
            <div style={styles.facilityGrid}>
              {facilitiesList.map((f) => (
                <label key={f}>
                  <input
                    type="checkbox"
                    checked={selectedFacilities.includes(f)}
                    onChange={() =>
                      setSelectedFacilities((old) =>
                        old.includes(f)
                          ? old.filter((x) => x !== f)
                          : [...old, f]
                      )
                    }
                  />{" "}
                  {f}
                </label>
              ))}
            </div>
          </div>

          <button style={styles.searchBtn} onClick={() => searchHotels(1)}>
            {loading ? "Searching..." : "Search hotels"}
          </button>
        </div>
      </section>

      {hotels.length > 0 && (
        <section style={styles.resultsWrap}>
          <div style={styles.resultsHeader}>
            <div>
              <h2>Available stays</h2>
              <p>
                Showing {hotels.length} of {headlineCount} matching options.
              </p>
            </div>
            <div style={styles.pageControls}>
              <button
                style={styles.smallBtn}
                disabled={hotelPage <= 1}
                onClick={() => searchHotels(hotelPage - 1)}
              >
                Previous
              </button>
              <span>Page {hotelPage}</span>
              <button
                style={styles.smallBtn}
                onClick={() => searchHotels(hotelPage + 1)}
              >
                Next
              </button>
            </div>
          </div>

          <div style={styles.resultsGrid}>
            {hotels.map((hotel) => (
              <article
                key={hotel.id}
                style={{
                  ...styles.card,
                  border:
                    selectedHotel?.id === hotel.id
                      ? "4px solid #f7c948"
                      : "1px solid #d8e1f0",
                }}
              >
                <img src={hotel.image} alt={hotel.name} style={styles.hotelImg} />
                <div style={styles.cardBody}>
                  <h3>{hotel.name}</h3>
                  <p>
                    {hotel.area}, {hotel.city}, {hotel.country}
                  </p>
                  <p>{hotel.summary}</p>
                  <b>{moneyLabel(hotel)}</b>
                  <p>Rating: {hotel.rating}</p>

                  <div style={styles.tags}>
                    {(hotel.facilities || []).slice(0, 5).map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </div>

                  <iframe
                    title={`Map ${hotel.id}`}
                    src={`${hotel.map_url}&output=embed`}
                    width="100%"
                    height="180"
                    style={styles.map}
                    loading="lazy"
                  />

                  <button
                    style={styles.primaryBtn}
                    onClick={() => {
                      setSelectedHotel(hotel);
                      setCodeSent(false);
                      setVerified(false);
                      setPaymentCode("");
                      setTimeout(() => {
                        document
                          .getElementById("booking-panel")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }, 100);
                    }}
                  >
                    Select this stay
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {selectedHotel && (
        <section id="booking-panel" style={styles.bookingPanel}>
          <h2>Complete your booking</h2>
          <p>
            Selected: <b>{selectedHotel.name}</b> — {selectedHotel.area},{" "}
            {selectedHotel.city}, {selectedHotel.country}
          </p>

          <div style={styles.formGrid}>
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

          <div style={styles.paymentBox}>
            <h3>Secure payment access</h3>
            <p>
              To reduce fraud, payment is only unlocked after the email address
              receives and verifies a payment access code.
            </p>

            {!codeSent && (
              <button style={styles.primaryBtn} onClick={sendPaymentCode}>
                Send payment code
              </button>
            )}

            {codeSent && !verified && (
              <div style={styles.formGrid}>
                <input
                  style={styles.input}
                  placeholder="Enter 6-digit payment code"
                  value={paymentCode}
                  onChange={(e) => setPaymentCode(e.target.value)}
                />
                <button style={styles.primaryBtn} onClick={verifyPaymentCode}>
                  Verify code
                </button>
              </div>
            )}

            {verified && (
              <button style={styles.payBtn} onClick={payNow}>
                Pay securely now
              </button>
            )}

            <button style={styles.reserveBtn} onClick={reserveOnly}>
              Reserve only — email request
            </button>
          </div>
        </section>
      )}

      <footer style={styles.footer}>
        <b>Need help?</b> Contact {SUPPORT_EMAIL}
      </footer>
    </main>
  );
}

const styles = {
  shell: {
    minHeight: "100vh",
    background: "#07152f",
    color: "#07152f",
    fontFamily: "Arial, Helvetica, sans-serif",
    padding: 24,
  },
  hero: {
    display: "grid",
    gridTemplateColumns: "1.25fr 1fr",
    gap: 24,
    alignItems: "stretch",
  },
  leftPanel: {
    background: "linear-gradient(160deg,#1e4598,#2e62cf)",
    color: "white",
    borderRadius: 30,
    padding: 42,
  },
  kicker: {
    letterSpacing: 8,
    fontWeight: 900,
    fontSize: 18,
  },
  kickerDark: {
    letterSpacing: 8,
    fontWeight: 900,
    color: "#5f78a7",
  },
  logoTitle: {
    fontSize: 72,
    margin: "26px 0",
    lineHeight: 0.95,
  },
  heroText: {
    fontSize: 27,
    lineHeight: 1.35,
    fontWeight: 800,
  },
  counterBox: {
    marginTop: 34,
    background: "rgba(255,255,255,0.13)",
    borderRadius: 22,
    padding: 24,
    maxWidth: 560,
  },
  counterBoxStrong: {},
  navRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 24,
  },
  navPill: {
    background: "rgba(255,255,255,0.13)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.28)",
    borderRadius: 999,
    padding: "14px 20px",
    fontWeight: 900,
    cursor: "pointer",
  },
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
    marginTop: 28,
    fontSize: 20,
  },
  searchPanel: {
    background: "#eaf2fd",
    borderRadius: 30,
    padding: 32,
  },
  searchTitle: {
    fontSize: 48,
    lineHeight: 1.05,
    margin: "12px 0",
    color: "#0b1b3d",
  },
  searchText: {
    color: "#48648d",
    fontSize: 19,
  },
  input: {
    width: "100%",
    padding: "17px 18px",
    borderRadius: 18,
    border: "1px solid #d5dfed",
    fontSize: 16,
    marginTop: 12,
    boxSizing: "border-box",
  },
  guestRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
  },
  guestBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    border: "1px solid #d5dfed",
    background: "white",
    cursor: "pointer",
  },
  guestActive: {
    width: 42,
    height: 42,
    borderRadius: 12,
    border: "1px solid #f7c948",
    background: "#f7c948",
    fontWeight: 900,
    cursor: "pointer",
  },
  facilityBox: {
    background: "white",
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
  },
  facilityGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 14,
  },
  searchBtn: {
    width: "100%",
    marginTop: 16,
    background: "#f7c948",
    color: "#07152f",
    border: "2px solid #07152f",
    borderRadius: 18,
    padding: 18,
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer",
  },
  resultsWrap: {
    background: "#f4f8ff",
    borderRadius: 26,
    marginTop: 24,
    padding: 24,
  },
  resultsHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
  },
  pageControls: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  smallBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #b6c5db",
    background: "white",
    cursor: "pointer",
  },
  resultsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))",
    gap: 20,
  },
  card: {
    background: "white",
    borderRadius: 22,
    overflow: "hidden",
  },
  hotelImg: {
    width: "100%",
    height: 190,
    objectFit: "cover",
  },
  cardBody: {
    padding: 18,
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    margin: "12px 0",
  },
  map: {
    border: 0,
    borderRadius: 14,
    marginTop: 10,
  },
  primaryBtn: {
    background: "#153b8a",
    color: "white",
    border: "none",
    borderRadius: 14,
    padding: "14px 18px",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 12,
  },
  reserveBtn: {
    background: "white",
    color: "#153b8a",
    border: "2px solid #153b8a",
    borderRadius: 14,
    padding: "14px 18px",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 12,
    marginLeft: 12,
  },
  payBtn: {
    background: "#f7c948",
    color: "#07152f",
    border: "2px solid #07152f",
    borderRadius: 14,
    padding: "15px 22px",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: 12,
  },
  bookingPanel: {
    background: "#ffffff",
    borderRadius: 26,
    marginTop: 24,
    padding: 28,
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    alignItems: "end",
  },
  paymentBox: {
    marginTop: 22,
    background: "#eef5ff",
    borderRadius: 20,
    padding: 20,
  },
  successBox: {
    maxWidth: 760,
    margin: "80px auto",
    background: "white",
    borderRadius: 28,
    padding: 40,
    textAlign: "center",
  },
  footer: {
    color: "white",
    textAlign: "center",
    padding: 28,
  },
};