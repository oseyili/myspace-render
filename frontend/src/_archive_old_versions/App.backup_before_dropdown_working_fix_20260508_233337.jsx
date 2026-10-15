import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:5050";

const INFO = {
  guide: {
    title: "Premium Travel Guide",
    text: "Customers can explore destinations, compare areas, review verified property imagery, and choose hotels that match their trip purpose before requesting a secure reservation."
  },
  faq: {
    title: "Frequently Asked Questions",
    text: "Customers can search by country, city, area, hotel name, travel dates, guests, and rooms. Final room pricing and availability are confirmed before secure payment."
  },
  assistance: {
    title: "Reservation Assistance",
    text: "Our reservation flow helps customers choose a hotel, confirm stay details, request support, and continue only when a verified rate is available."
  },
  support: {
    title: "Customer Support",
    text: "Customer support helps with hotel selection, reservation questions, payment guidance, special requests, and booking follow-up."
  },
  terms: {
    title: "Booking Terms",
    text: "All reservations are subject to confirmed availability, verified room pricing, accurate customer details, and secure payment processing."
  }
};

function cleanText(v) {
  return String(v || "").trim();
}

function imageUrlFor(hotel) {
  const value = cleanText(hotel.image_url || hotel.image);
  if (!value.startsWith("http")) return "";
  return `${API_BASE}/image-proxy?url=${encodeURIComponent(value)}`;
}

function PropertyImage({ hotel }) {
  const [failed, setFailed] = useState(false);
  const url = imageUrlFor(hotel);

  if (!url || failed) {
    return <div style={styles.noImage}>Verified property image unavailable</div>;
  }

  return (
    <img
      src={url}
      alt={hotel.hotel_name || "Hotel"}
      style={styles.hotelImage}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export default function App() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [openInfo, setOpenInfo] = useState("guide");
  const [destinations, setDestinations] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [checkin, setCheckin] = useState(today);
  const [checkout, setCheckout] = useState(tomorrow);
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [hotels, setHotels] = useState([]);
  const [selectedHotelId, setSelectedHotelId] = useState("");
  const [liveRate, setLiveRate] = useState(null);
  const [targetCurrency, setTargetCurrency] = useState("USD");
  const [convertedTotal, setConvertedTotal] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const selectedHotel = useMemo(() => {
    return hotels.find((h) => String(h.hotel_id || h.id) === String(selectedHotelId)) || null;
  }, [hotels, selectedHotelId]);

  useEffect(() => {
    async function loadDestinations() {
      try {
        const response = await fetch(`${API_BASE}/api/real-catalog/destinations`);
        const data = await response.json();
        const list = Array.isArray(data.countries) ? data.countries : [];

        setDestinations(list);

        if (list.length > 0) {
          setCountry(list[0].country);
          setCity(list[0].cities?.[0]?.city || "");
        }
      } catch {
        setMessage("Hotel search is temporarily unavailable.");
      }
    }

    loadDestinations();
  }, []);

  const cityOptions = useMemo(() => {
    const found = destinations.find((x) => x.country === country);
    return found?.cities || [];
  }, [destinations, country]);

  async function searchHotels() {
    setLoading(true);
    setMessage("");
    setHotels([]);
    setSelectedHotelId("");
    setLiveRate(null);
    setConvertedTotal("");

    try {
      const params = new URLSearchParams();
      params.set("country", country);
      params.set("city", city);
      params.set("area", area);
      params.set("keyword", keyword);
      params.set("limit", "120");

      const response = await fetch(`${API_BASE}/api/real-catalog/search?${params.toString()}`);
      const data = await response.json();
      const list = Array.isArray(data.hotels) ? data.hotels : [];

      setHotels(list);
      setMessage(`${list.length} matching hotels found in ${city}, ${country}.`);
    } catch {
      setMessage("Hotel search is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function reloadLiveRate() {
    if (!selectedHotel) {
      return setMessage("Please choose a hotel first.");
    }

    setLiveRate(null);
    setConvertedTotal("");

    try {
      const params = new URLSearchParams();
      params.set("hotel_id", selectedHotel.hotel_id || selectedHotel.id);
      params.set("hotel_name", selectedHotel.hotel_name || selectedHotel.name);
      params.set("city", city);
      params.set("country", country);

      const response = await fetch(`${API_BASE}/api/hotels/selected-live-price-v2?${params.toString()}`);
      const data = await response.json();

      if (!data.ok || !data.live_payment_ready || !Number(data.amount)) {
        setMessage("Verified live rate is not available for this hotel yet. Please request reservation support.");
        return;
      }

      setLiveRate(data);
      setMessage("Verified rate loaded for customer review.");
    } catch {
      setMessage("Live rate check is temporarily unavailable.");
    }
  }

  async function convertTotal(nextCurrency = targetCurrency) {
    if (!liveRate || !Number(liveRate.amount)) {
      setConvertedTotal("Live rate required before conversion.");
      return;
    }

    try {
      const total = Number(liveRate.amount) * Number(rooms || 1);
      const params = new URLSearchParams();
      params.set("amount", String(total));
      params.set("from", liveRate.currency);
      params.set("to", nextCurrency);

      const response = await fetch(`${API_BASE}/api/currency/convert?${params.toString()}`);
      const data = await response.json();

      if (!data.ok) {
        setConvertedTotal("Conversion unavailable.");
        return;
      }

      setConvertedTotal(`${nextCurrency} ${Number(data.converted).toLocaleString()}`);
    } catch {
      setConvertedTotal("Conversion unavailable.");
    }
  }

  async function requestReservation() {
    if (!selectedHotel) return setMessage("Please choose a hotel.");
    if (!customerName.trim()) return setMessage("Please enter your full name.");
    if (!customerEmail.trim()) return setMessage("Please enter your email address.");

    try {
      const total = liveRate ? Number(liveRate.amount) * Number(rooms || 1) : 0;

      const payload = {
        hotel_id: selectedHotel.hotel_id || selectedHotel.id,
        hotel_name: selectedHotel.hotel_name || selectedHotel.name,
        destination: `${city}, ${country}`,
        checkin,
        checkout,
        guests,
        rooms,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        note,
        amount: total,
        currency: liveRate?.currency || ""
      };

      const response = await fetch(`${API_BASE}/reservation-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(data.message || "Reservation request received.");
    } catch {
      setMessage("Reservation request could not be completed.");
    }
  }

  return (
    <div style={styles.page}>
      <section style={styles.box1}>
        <div style={styles.brand}>MYSPACE HOTEL</div>

        <h1 style={styles.hero}>Trusted global hotel reservations</h1>

        <p style={styles.sub}>
          Search destinations, choose suitable hotels, and request secure reservation support with customer-first guidance.
        </p>

        <div style={styles.menuBox}>
          {Object.entries(INFO).map(([key, value]) => (
            <button
              key={key}
              style={openInfo === key ? styles.menuButtonActive : styles.menuButton}
              onClick={() => setOpenInfo(key)}
            >
              {value.title}
            </button>
          ))}
        </div>

        <div style={styles.customerInfoBox}>
          <h2 style={styles.infoTitle}>{INFO[openInfo].title}</h2>
          <p style={styles.infoText}>{INFO[openInfo].text}</p>
        </div>
      </section>

      <section style={styles.box2}>
        <div style={styles.searchBox}>
          <h2 style={styles.sectionTitle}>Search Hotels</h2>

          <label style={styles.label}>Country</label>
          <select
            style={styles.input}
            value={country}
            onChange={(e) => {
              const nextCountry = e.target.value;
              const found = destinations.find((x) => x.country === nextCountry);
              setCountry(nextCountry);
              setCity(found?.cities?.[0]?.city || "");
              setHotels([]);
              setSelectedHotelId("");
              setLiveRate(null);
              setConvertedTotal("");
            }}
          >
            {destinations.map((c) => (
              <option key={c.country} value={c.country}>{c.country}</option>
            ))}
          </select>

          <label style={styles.label}>City</label>
          <select
            style={styles.input}
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setHotels([]);
              setSelectedHotelId("");
              setLiveRate(null);
              setConvertedTotal("");
            }}
          >
            {cityOptions.map((c) => (
              <option key={c.city} value={c.city}>{c.city}</option>
            ))}
          </select>

          <label style={styles.label}>Preferred Area</label>
          <input style={styles.input} value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area or neighbourhood" />

          <label style={styles.label}>Hotel Name or Landmark</label>
          <input style={styles.input} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or landmark" />

          <div style={styles.twoCols}>
            <div>
              <label style={styles.label}>Check-In Date</label>
              <input style={styles.input} type="date" value={checkin} onChange={(e) => setCheckin(e.target.value)} />
            </div>

            <div>
              <label style={styles.label}>Check-Out Date</label>
              <input style={styles.input} type="date" value={checkout} onChange={(e) => setCheckout(e.target.value)} />
            </div>
          </div>

          <div style={styles.twoCols}>
            <div>
              <label style={styles.label}>Guests</label>
              <input style={styles.input} type="number" min="1" value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
            </div>

            <div>
              <label style={styles.label}>Rooms</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                value={rooms}
                onChange={(e) => {
                  setRooms(Number(e.target.value));
                  setConvertedTotal("");
                }}
              />
            </div>
          </div>

          <button style={styles.searchButton} onClick={searchHotels}>
            {loading ? "Searching..." : "Search Hotels"}
          </button>

          {message && <div style={styles.notice}>{message}</div>}
        </div>

        <div style={styles.hotelDropdownBox}>
          <label style={styles.label}>Choose Hotel</label>
          <select
            style={styles.input}
            value={selectedHotelId}
            onChange={(e) => {
              setSelectedHotelId(e.target.value);
              setLiveRate(null);
              setConvertedTotal("");
            }}
          >
            <option value="">Select a hotel from the search results</option>
            {hotels.map((hotel) => (
              <option key={hotel.hotel_id || hotel.id} value={hotel.hotel_id || hotel.id}>
                {hotel.hotel_name || hotel.name}
              </option>
            ))}
          </select>

          {selectedHotel && (
            <div style={styles.selectedPreview}>
              <PropertyImage hotel={selectedHotel} />
              <h3 style={styles.hotelTitle}>{selectedHotel.hotel_name || selectedHotel.name}</h3>
              <p style={styles.hotelText}>{selectedHotel.area || selectedHotel.address || selectedHotel.city}</p>
              <div style={styles.warningBox}>Live rate confirmation required before secure payment.</div>
            </div>
          )}
        </div>
      </section>

      <aside style={styles.box3}>
        <h2 style={styles.sectionTitle}>Live Rate & Reservation</h2>

        <div style={styles.selectedHotel}>
          {selectedHotel ? (selectedHotel.hotel_name || selectedHotel.name) : "Choose a hotel"}
        </div>

        <button style={styles.searchButton} onClick={reloadLiveRate}>
          Reload Verified Live Rate
        </button>

        <div style={styles.convertBox}>
          {liveRate
            ? `${liveRate.currency} ${(Number(liveRate.amount) * Number(rooms || 1)).toLocaleString()} total for ${rooms} room(s)`
            : "Live rate required before payment"}
        </div>

        <label style={styles.label}>Currency Converter</label>
        <select
          style={styles.input}
          value={targetCurrency}
          onChange={(e) => {
            setTargetCurrency(e.target.value);
            convertTotal(e.target.value);
          }}
        >
          {["USD", "GBP", "EUR", "NGN", "AED", "CAD", "AUD", "ZAR", "CHF", "JPY"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <button style={styles.convertButton} onClick={() => convertTotal()}>
          Convert Total
        </button>

        <div style={styles.convertBox}>{convertedTotal || "Select a live rate to convert total rooms."}</div>

        <label style={styles.label}>Full Name</label>
        <input style={styles.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Full name" />

        <label style={styles.label}>Email Address</label>
        <input style={styles.input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="Email address" />

        <label style={styles.label}>Mobile Number</label>
        <input style={styles.input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Mobile number" />

        <label style={styles.label}>Special Requests</label>
        <textarea style={styles.textarea} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special requests" />

        <button style={styles.bookButton} onClick={requestReservation}>
          Continue Secure Reservation
        </button>

        <div style={styles.secureBox}>
          Customer reservation support is available before secure payment.
        </div>
      </aside>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "0.85fr 1.2fr 0.75fr",
    background: "#edf2f7",
    fontFamily: "Arial, sans-serif"
  },
  box1: {
    background: "linear-gradient(135deg,#123a7a,#1f5fd0)",
    color: "white",
    padding: 36,
    overflow: "auto"
  },
  box2: {
    padding: 22,
    overflow: "auto"
  },
  box3: {
    background: "white",
    padding: 22,
    borderLeft: "1px solid #d9e2ee",
    overflow: "auto"
  },
  brand: {
    letterSpacing: 10,
    fontWeight: 900,
    marginBottom: 24,
    fontSize: 18
  },
  hero: {
    fontSize: 46,
    lineHeight: 1.08,
    marginBottom: 16
  },
  sub: {
    fontSize: 20,
    lineHeight: 1.55
  },
  menuBox: {
    display: "grid",
    gap: 12,
    marginTop: 30
  },
  menuButton: {
    background: "white",
    color: "#07111f",
    border: 0,
    borderRadius: 14,
    padding: 16,
    fontWeight: 900,
    cursor: "pointer",
    textAlign: "left",
    fontSize: 16
  },
  menuButtonActive: {
    background: "#ffd34d",
    color: "#07111f",
    border: 0,
    borderRadius: 14,
    padding: 16,
    fontWeight: 900,
    cursor: "pointer",
    textAlign: "left",
    fontSize: 16
  },
  customerInfoBox: {
    marginTop: 28,
    background: "rgba(255,255,255,.14)",
    borderRadius: 18,
    padding: 20
  },
  infoTitle: {
    marginTop: 0,
    color: "#ffd34d"
  },
  infoText: {
    fontSize: 18,
    lineHeight: 1.6,
    fontWeight: 700
  },
  searchBox: {
    background: "white",
    borderRadius: 20,
    padding: 22,
    marginBottom: 20
  },
  hotelDropdownBox: {
    background: "white",
    borderRadius: 20,
    padding: 22
  },
  sectionTitle: {
    fontSize: 28,
    marginBottom: 18
  },
  label: {
    display: "block",
    fontWeight: 900,
    marginBottom: 8,
    marginTop: 12
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: 14,
    borderRadius: 12,
    border: "1px solid #cfd9e5",
    fontSize: 16
  },
  textarea: {
    width: "100%",
    minHeight: 110,
    boxSizing: "border-box",
    padding: 14,
    borderRadius: 12,
    border: "1px solid #cfd9e5",
    fontSize: 16
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12
  },
  searchButton: {
    width: "100%",
    marginTop: 18,
    background: "#07111f",
    color: "white",
    border: 0,
    borderRadius: 14,
    padding: 16,
    fontWeight: 900,
    fontSize: 17,
    cursor: "pointer"
  },
  convertButton: {
    width: "100%",
    marginTop: 12,
    background: "#123a7a",
    color: "white",
    border: 0,
    borderRadius: 14,
    padding: 14,
    fontWeight: 900,
    fontSize: 16,
    cursor: "pointer"
  },
  notice: {
    marginTop: 16,
    background: "#eef5ff",
    borderRadius: 12,
    padding: 14,
    fontWeight: 800
  },
  selectedPreview: {
    marginTop: 18,
    background: "#f8fafc",
    borderRadius: 18,
    padding: 16
  },
  hotelImage: {
    width: "100%",
    height: 250,
    objectFit: "cover",
    borderRadius: 14
  },
  noImage: {
    width: "100%",
    height: 250,
    borderRadius: 14,
    background: "#dbe5f1",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800
  },
  hotelTitle: {
    marginTop: 16,
    fontSize: 24
  },
  hotelText: {
    color: "#475569",
    marginTop: 8
  },
  warningBox: {
    marginTop: 14,
    background: "#fff2be",
    color: "#7a4b00",
    padding: 14,
    borderRadius: 12,
    fontWeight: 900
  },
  selectedHotel: {
    background: "#eef4ff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    fontWeight: 900
  },
  convertBox: {
    marginTop: 14,
    marginBottom: 16,
    background: "#eef5ff",
    borderRadius: 12,
    padding: 14,
    fontWeight: 900
  },
  bookButton: {
    width: "100%",
    marginTop: 18,
    background: "#ffd34d",
    border: 0,
    borderRadius: 16,
    padding: 18,
    fontWeight: 900,
    fontSize: 19,
    cursor: "pointer"
  },
  secureBox: {
    marginTop: 16,
    background: "#dff7e6",
    borderRadius: 14,
    padding: 16,
    fontWeight: 900
  }
};
