import React, { useMemo, useState } from "react";

const API_BASE = "https://www.myspace-hotel.com";

const DESTINATIONS = {
  NG: {
    label: "Nigeria",
    cities: ["LOS","ABV","PHC","KAN","IBA","ENU"],
  },
  UK: {
    label: "United Kingdom",
    cities: ["LON","MAN","LIV","EDI"],
  },
  FR: {
    label: "France",
    cities: ["PAR","NCE","LYS"],
  },
  ES: {
    label: "Spain",
    cities: ["BCN","MAD","PMI","AGP"],
  },
  AE: {
    label: "United Arab Emirates",
    cities: ["DXB","AUH"],
  },
  NL: {
    label: "Netherlands",
    cities: ["AMS"],
  },
  DE: {
    label: "Germany",
    cities: ["BER"],
  },
  IT: {
    label: "Italy",
    cities: ["ROM","MIL","VCE"],
  },
  US: {
    label: "United States",
    cities: ["NYC","MIA","LAS"],
  },
  TR: {
    label: "Turkey",
    cities: ["IST"],
  },
  PT: {
    label: "Portugal",
    cities: ["LIS","FAO"],
  },
  AT: {
    label: "Austria",
    cities: ["VIE"],
  },
  CZ: {
    label: "Czech Republic",
    cities: ["PRG"],
  },
  IE: {
    label: "Ireland",
    cities: ["DUB"],
  },
  GR: {
    label: "Greece",
    cities: ["ATH"],
  },
};

const CITY_LABELS = {
  LOS: "Lagos",
  ABV: "Abuja",
  PHC: "Port Harcourt",
  KAN: "Kano",
  IBA: "Ibadan",
  ENU: "Enugu",

  LON: "London",
  MAN: "Manchester",
  LIV: "Liverpool",
  EDI: "Edinburgh",

  PAR: "Paris",
  BCN: "Barcelona",
  MAD: "Madrid",
  PMI: "Mallorca",
  AGP: "Malaga",
  DXB: "Dubai",
  AMS: "Amsterdam",
  BER: "Berlin",
  ROM: "Rome",
  NYC: "New York",
  IST: "Istanbul",
  LIS: "Lisbon",
  FAO: "Faro",
  VIE: "Vienna",
  PRG: "Prague",
  DUB: "Dublin",
  ATH: "Athens",
  NCE: "Nice",
  MIL: "Milan",
  VCE: "Venice",
  AUH: "Abu Dhabi",
  MIA: "Miami",
  LAS: "Las Vegas",
};

function getCityName(code) {
  return CITY_LABELS[code] || code;
}

function PropertyImage({ hotel }) {
  const img =
    hotel?.image_url ||
    hotel?.image ||
    "";

  if (!img) {
    return (
      <div style={styles.noImage}>
        Real property image unavailable
      </div>
    );
  }

  return (
    <img
      src={img}
      alt={hotel?.hotel_name || hotel?.name || "Hotel"}
      loading="lazy"
      style={styles.hotelImage}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

export default function App() {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [country, setCountry] = useState("NG");
  const [city, setCity] = useState("LOS");

  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");

  const [checkin, setCheckin] = useState(today);
  const [checkout, setCheckout] = useState(tomorrow);

  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);

  const [loading, setLoading] = useState(false);

  const [hotels, setHotels] = useState([]);

  const [selectedHotel, setSelectedHotel] = useState(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");

  const [message, setMessage] = useState("");

  const cityOptions = useMemo(() => {
    return DESTINATIONS[country]?.cities || [];
  }, [country]);

  async function searchHotels() {
    setLoading(true);
    setMessage("");
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams();

      params.set("country", country);
      params.set("city", city);
      params.set("destination_code", city);
      params.set("checkin", checkin);
      params.set("checkout", checkout);
      params.set("guests", guests);
      params.set("rooms", rooms);

      if (area.trim()) {
        params.set("area", area.trim());
      }

      if (keyword.trim()) {
        params.set("keyword", keyword.trim());
      }

      const res = await fetch(
        `${API_BASE}/api/hotels/search?${params.toString()}`
      );

      const data = await res.json();

      const list = Array.isArray(data.hotels)
        ? data.hotels
        : [];

      setHotels(list);

      setMessage(
        `${list.length} real hotels found in ${getCityName(city)}`
      );
    } catch (e) {
      setMessage("Hotel search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function continueBooking() {
    if (!selectedHotel) {
      setMessage("Please select a hotel.");
      return;
    }

    if (!customerName.trim()) {
      setMessage("Enter your full name.");
      return;
    }

    if (!customerEmail.trim()) {
      setMessage("Enter your email.");
      return;
    }

    try {
      const payload = {
        hotel_id: selectedHotel.hotel_id || selectedHotel.id,
        hotel_name: selectedHotel.hotel_name || selectedHotel.name,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        note,
        destination: city,
        checkin,
        checkout,
        guests,
        rooms,
      };

      const res = await fetch(
        `${API_BASE}/reservation-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();

      if (data.payment_url) {
        window.location.href = data.payment_url;
        return;
      }

      setMessage(data.message || "Reservation request sent.");
    } catch {
      setMessage("Booking request failed.");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.left}>
        <div style={styles.brand}>
          MYSPACE HOTEL
        </div>

        <h1 style={styles.hero}>
          Global hotel booking with real hotels and real images.
        </h1>

        <p style={styles.sub}>
          Live hotel inventory, secure booking, and worldwide destinations.
        </p>

        <div style={styles.leftButtons}>
          <a href="/travel" style={styles.linkButton}>
            Travel Guides
          </a>

          <a href="/faq" style={styles.linkButton}>
            FAQs
          </a>

          <a href="/terms" style={styles.linkButton}>
            Booking Terms
          </a>

          <a href="/support" style={styles.linkButton}>
            Customer Support
          </a>
        </div>
      </div>

      <div style={styles.right}>
        <div style={styles.searchBox}>
          <h2>Search hotels globally</h2>

          <select
            style={styles.input}
            value={country}
            onChange={(e) => {
              const c = e.target.value;
              setCountry(c);
              setCity(DESTINATIONS[c].cities[0]);
            }}
          >
            {Object.entries(DESTINATIONS).map(([code, info]) => (
              <option key={code} value={code}>
                {info.label}
              </option>
            ))}
          </select>

          <select
            style={styles.input}
            value={city}
            onChange={(e) => setCity(e.target.value)}
          >
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {getCityName(c)}
              </option>
            ))}
          </select>

          <input
            style={styles.input}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Preferred area"
          />

          <input
            style={styles.input}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Hotel name or keyword"
          />

          <div style={styles.dateGrid}>
            <input
              style={styles.input}
              type="date"
              value={checkin}
              onChange={(e) => setCheckin(e.target.value)}
            />

            <input
              style={styles.input}
              type="date"
              value={checkout}
              onChange={(e) => setCheckout(e.target.value)}
            />
          </div>

          <button
            style={styles.searchButton}
            onClick={searchHotels}
          >
            {loading
              ? "Searching..."
              : "Search available hotels"}
          </button>

          {message && (
            <div style={styles.notice}>
              {message}
            </div>
          )}
        </div>

        <div style={styles.hotelGrid}>
          {hotels.map((hotel) => (
            <div
              key={hotel.hotel_id || hotel.id}
              style={
                selectedHotel?.hotel_id === hotel.hotel_id
                  ? styles.hotelCardSelected
                  : styles.hotelCard
              }
              onClick={() => setSelectedHotel(hotel)}
            >
              <PropertyImage hotel={hotel} />

              <div style={styles.hotelContent}>
                <h3 style={styles.hotelName}>
                  {hotel.hotel_name || hotel.name}
                </h3>

                <div style={styles.hotelArea}>
                  {hotel.area || hotel.address || hotel.city}
                </div>

                <div style={styles.hotelPrice}>
                  {hotel.currency || ""}
                  {" "}
                  {hotel.price || hotel.selling_rate || "Live price"}
                </div>

                <div style={styles.liveTag}>
                  Real hotel • Live inventory
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.bookingBox}>
          <h2>Secure booking</h2>

          <input
            style={styles.input}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Full name"
          />

          <input
            style={styles.input}
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="Email"
          />

          <input
            style={styles.input}
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            placeholder="Phone"
          />

          <textarea
            style={styles.textarea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Special requests"
          />

          <button
            style={styles.searchButton}
            onClick={continueBooking}
          >
            Continue securely
          </button>

          <div style={styles.emailInfo}>
            Reservation emails are sent to:
            <br />
            reservations@myspace-hotel.com
            <br />
            and the customer email address.
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    background: "#07111f",
    color: "white",
    fontFamily: "Arial, sans-serif",
  },

  left: {
    padding: 40,
    background: "linear-gradient(135deg,#123a7a,#1d4da8)",
  },

  right: {
    padding: 30,
    background: "#e8eef7",
    color: "#07111f",
    overflow: "auto",
  },

  brand: {
    letterSpacing: 16,
    fontWeight: 900,
    marginBottom: 40,
  },

  hero: {
    fontSize: 62,
    lineHeight: 1.05,
    maxWidth: 650,
  },

  sub: {
    fontSize: 22,
    lineHeight: 1.5,
    maxWidth: 600,
  },

  leftButtons: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 40,
  },

  linkButton: {
    background: "white",
    color: "#07111f",
    padding: "16px 22px",
    borderRadius: 14,
    textDecoration: "none",
    fontWeight: 900,
  },

  searchBox: {
    background: "white",
    padding: 24,
    borderRadius: 20,
    marginBottom: 24,
  },

  bookingBox: {
    background: "white",
    padding: 24,
    borderRadius: 20,
    marginTop: 24,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "15px",
    marginTop: 12,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    fontSize: 16,
  },

  textarea: {
    width: "100%",
    minHeight: 120,
    boxSizing: "border-box",
    padding: "15px",
    marginTop: 12,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    fontSize: 16,
  },

  dateGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },

  searchButton: {
    width: "100%",
    background: "#ffd34d",
    color: "#07111f",
    border: 0,
    borderRadius: 16,
    padding: "18px",
    marginTop: 20,
    fontWeight: 900,
    fontSize: 20,
    cursor: "pointer",
  },

  notice: {
    marginTop: 20,
    background: "#fff2be",
    padding: 14,
    borderRadius: 12,
    fontWeight: 900,
  },

  hotelGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
  },

  hotelCard: {
    background: "white",
    borderRadius: 18,
    overflow: "hidden",
    cursor: "pointer",
  },

  hotelCardSelected: {
    background: "white",
    borderRadius: 18,
    overflow: "hidden",
    border: "4px solid #ffd34d",
    cursor: "pointer",
  },

  hotelImage: {
    width: "100%",
    height: 240,
    objectFit: "cover",
    display: "block",
  },

  noImage: {
    height: 240,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#dbe4f0",
    fontWeight: 900,
  },

  hotelContent: {
    padding: 18,
  },

  hotelName: {
    fontSize: 24,
    margin: 0,
  },

  hotelArea: {
    marginTop: 10,
    color: "#475569",
  },

  hotelPrice: {
    marginTop: 14,
    fontWeight: 900,
    fontSize: 20,
  },

  liveTag: {
    marginTop: 14,
    background: "#dff7e6",
    color: "#075b24",
    borderRadius: 10,
    padding: 10,
    fontWeight: 900,
  },

  emailInfo: {
    marginTop: 18,
    background: "#dff7e6",
    padding: 16,
    borderRadius: 12,
    fontWeight: 700,
  },
};
