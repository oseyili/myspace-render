import React, { useState, useEffect } from "react";

const API_BASE = (() => {
  const configured = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL || "";
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if ((host === "localhost" || host === "127.0.0.1") && !configured) return "http://localhost:5050";
  return configured || "https://myspace-hotel-backend.onrender.com";
})();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function getCurrencySymbol(curr) {
  const symbols = {
    GBP: "£",
    USD: "$",
    EUR: "€",
    AED: "د.إ",
    CAD: "C$",
    JPY: "¥",
    CHF: "Fr",
    THB: "฿",
    NGN: "₦",
    AUD: "A$"
  };
  return symbols[curr] || curr;
}

export default function HotelSearchPage() {
  const [countries, setCountries] = useState([]);
  const [cities, setCities] = useState([]);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(tomorrowISO());
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [currency, setCurrency] = useState("GBP");
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [searching, setSearching] = useState(false);
  const [visibleCount, setVisibleCount] = useState(25);

  useEffect(() => {
    loadCountries();
  }, []);

  useEffect(() => {
    if (country) {
      const found = countries.find(c => c.country === country);
      setCities(found?.cities || []);
      if (found?.cities?.length > 0) setCity(found.cities[0]);
    }
  }, [country, countries]);

  async function loadCountries() {
    try {
      const res = await fetch(`${API_BASE}/api/cache-stats`, { cache: "no-store" });
      const data = await res.json();
      
      if (data.ok && Array.isArray(data.table)) {
        // Group the flat table by country
        const grouped = {};
        for (const row of data.table) {
          if (!grouped[row.country]) grouped[row.country] = [];
          grouped[row.country].push(row.city);
        }
        
        // Convert to the format the component expects
        const countryList = Object.keys(grouped)
          .sort()
          .map((country) => ({
            country,
            cities: grouped[country].sort()
          }));
        
        setCountries(countryList);
        if (countryList.length > 0) {
          setCountry(countryList[0].country);
        }
      } else {
        // Fallback only if the API fails
        setCountries([
          { country: "United Kingdom", cities: ["London", "Manchester", "Birmingham"] }
        ]);
        setCountry("United Kingdom");
      }
    } catch (err) {
      setCountries([
        { country: "United Kingdom", cities: ["London", "Manchester", "Birmingham"] }
      ]);
      setCountry("United Kingdom");
    }
  }

  async function searchHotels() {
    if (!country || !city) {
      setNotice("Please select a country and city.");
      return;
    }
    if (new Date(checkOut) <= new Date(checkIn)) {
      setNotice("Check-out must be after check-in.");
      return;
    }

    setSearching(true);
    setLoading(true);
    setNotice("");
    setHotels([]);
    setSelectedHotel(null);

    const params = new URLSearchParams({
      country, city, checkIn, checkOut,
      guests: String(guests), rooms: String(rooms),
      currency, limit: "100"
    });

    try {
      const res = await fetch(`${API_BASE}/api/hotels/search?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (data.ok && Array.isArray(data.hotels)) {
        setHotels(data.hotels);
        if (data.hotels.length === 0) {
          setNotice("No hotels found. Try another city or date.");
        }
      } else {
        setNotice(data.message || "No hotels found.");
      }
    } catch (err) {
      setNotice("Search failed. Please try again.");
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }

  function selectHotel(hotel) {
    setSelectedHotel(hotel);
    setTimeout(() => {
      const el = document.getElementById("booking-summary");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }

  function loadMore() {
    setVisibleCount(prev => Math.min(prev + 25, hotels.length));
  }

  const nights = Math.max(1, Math.ceil((new Date(checkOut) - new Date(checkIn)) / 86400000));
  const selectedPrice = selectedHotel ? Number(selectedHotel.price || 0) : 0;
  const selectedCurrency = selectedHotel?.currency || currency;
  const totalPrice = selectedPrice * nights * Math.max(1, rooms);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🏨 Find Your Perfect Hotel</h1>

      <div style={styles.searchCard}>
        <div style={styles.searchGrid}>
          <div style={styles.field}>
            <label style={styles.label}>Country</label>
            <select style={styles.select} value={country} onChange={(e) => setCountry(e.target.value)}>
              {countries.map(c => <option key={c.country} value={c.country}>{c.country}</option>)}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>City</label>
            <select style={styles.select} value={city} onChange={(e) => setCity(e.target.value)} disabled={!country}>
              {cities.length === 0 ? <option>Select country first</option> : cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Check-in</label>
            <input style={styles.input} type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Check-out</label>
            <input style={styles.input} type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Guests</label>
            <input style={styles.input} type="number" min="1" value={guests} onChange={(e) => setGuests(Number(e.target.value))} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Rooms</label>
            <input style={styles.input} type="number" min="1" value={rooms} onChange={(e) => setRooms(Number(e.target.value))} />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Currency</label>
            <select style={styles.select} value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="GBP">GBP (£)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="AED">AED (د.إ)</option>
              <option value="CAD">CAD (C$)</option>
              <option value="AUD">AUD (A$)</option>
              <option value="JPY">JPY (¥)</option>
              <option value="NGN">NGN (₦)</option>
            </select>
          </div>

          <div style={styles.field}>
            <button style={styles.searchBtn} onClick={searchHotels} disabled={searching || !country || !city}>
              {searching ? "Searching..." : "🔍 Search Hotels"}
            </button>
          </div>
        </div>
      </div>

      {notice && <div style={styles.noticeBox}>{notice}</div>}

      {loading && (
        <div style={styles.loadingBox}>
          <div style={styles.spinner}></div>
          <p>Finding the best hotels...</p>
        </div>
      )}

      {!loading && hotels.length > 0 && (
        <div style={styles.resultsCount}>
          {hotels.length} hotel{hotels.length !== 1 ? 's' : ''} in {city}, {country}
        </div>
      )}

      {!loading && (
        <div style={styles.hotelGrid}>
          {hotels.slice(0, visibleCount).map((hotel, idx) => {
            const isSelected = selectedHotel && (hotel.hotelId === selectedHotel.hotelId || hotel.id === selectedHotel.id);
            const price = Number(hotel.price || 0);
            const curr = hotel.currency || currency;
            const image = hotel.image || hotel.image_url || "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=300&fit=crop";
            const name = hotel.name || hotel.hotel_name || "Hotel";
            const hotelCity = hotel.city || city;
            const hotelCountry = hotel.country || country;

            return (
              <div key={hotel.hotelId || hotel.id || idx} style={isSelected ? styles.hotelCardSelected : styles.hotelCard}>
                <div style={styles.imageContainer}>
                  <img src={image} alt={name} style={styles.hotelImage} onError={(e) => {
                    e.target.src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=300&fit=crop";
                  }} />
                  {hotel.stars && <div style={styles.ratingBadge}>⭐ {hotel.stars}</div>}
                </div>
                <div style={styles.hotelBody}>
                  <h3 style={styles.hotelName}>{name}</h3>
                  <p style={styles.hotelLocation}>📍 {hotelCity}, {hotelCountry}</p>
                  {hotel.facilities && hotel.facilities.length > 0 && (
                    <div style={styles.amenityRow}>
                      {hotel.facilities.slice(0, 3).map((f, i) => <span key={i} style={styles.amenityTag}>{f}</span>)}
                    </div>
                  )}
                  <div style={styles.priceBox}>
                    <span style={styles.priceAmount}>{getCurrencySymbol(curr)} {price > 0 ? price.toFixed(2) : "0.00"}</span>
                    <span style={styles.pricePerNight}>/ night</span>
                  </div>
                  {hotel.rooms && hotel.rooms.length > 0 && (
                    <div style={styles.roomInfo}>
                      <span>🛏️ {hotel.rooms[0].roomName || "Standard Room"}</span>
                      <span>• {hotel.rooms[0].board || "Room only"}</span>
                    </div>
                  )}
                  <button style={isSelected ? styles.selectedBtn : styles.selectBtn} onClick={() => selectHotel(hotel)}>
                    {isSelected ? "✓ Selected" : "Select Hotel"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && hotels.length > visibleCount && (
        <div style={styles.loadMoreContainer}>
          <button style={styles.loadMoreBtn} onClick={loadMore}>
            Load More Hotels ({visibleCount} of {hotels.length})
          </button>
        </div>
      )}

      {selectedHotel && (
        <div id="booking-summary" style={styles.summaryCard}>
          <h2 style={styles.summaryTitle}>📋 Booking Summary</h2>
          <div style={styles.summaryContent}>
            <div>
              <h3 style={styles.summaryHotelName}>{selectedHotel.name || selectedHotel.hotel_name}</h3>
              <p style={styles.summaryLocation}>📍 {selectedHotel.city || city}, {selectedHotel.country || country}</p>
              <div style={styles.summaryDetails}>
                <span>{nights} night{nights !== 1 ? 's' : ''}</span>
                <span>•</span>
                <span>{rooms} room{rooms !== 1 ? 's' : ''}</span>
                <span>•</span>
                <span>{guests} guest{guests !== 1 ? 's' : ''}</span>
              </div>
              {selectedHotel.rooms && selectedHotel.rooms.length > 0 && (
                <div style={styles.summaryRoom}>
                  Room: {selectedHotel.rooms[0].roomName || "Standard"} • {selectedHotel.rooms[0].board || "Room only"}
                </div>
              )}
            </div>
            <div style={styles.summaryRight}>
              <div style={styles.summaryTotal}>
                <span style={styles.totalLabel}>Total Price</span>
                <span style={styles.totalAmount}>{getCurrencySymbol(selectedCurrency)} {totalPrice.toFixed(2)}</span>
              </div>
              <button style={styles.bookBtn} onClick={() => alert("Checkout coming soon!")}>
                Continue to Checkout →
              </button>
              <p style={styles.summaryNote}>Price includes all taxes and fees</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: "20px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    background: "#f8fafc",
    minHeight: "100vh"
  },
  title: {
    textAlign: "center",
    color: "#0b1d51",
    fontSize: "32px",
    marginBottom: "30px",
    fontWeight: "900"
  },
  searchCard: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    marginBottom: "24px"
  },
  searchGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "16px",
    alignItems: "end"
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "6px"
  },
  label: {
    fontSize: "13px",
    fontWeight: "700",
    color: "#374151",
    textTransform: "uppercase",
    letterSpacing: "0.5px"
  },
  select: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "2px solid #e5e7eb",
    fontSize: "14px",
    background: "#ffffff",
    width: "100%"
  },
  input: {
    padding: "10px 14px",
    borderRadius: "8px",
    border: "2px solid #e5e7eb",
    fontSize: "14px",
    width: "100%",
    boxSizing: "border-box"
  },
  searchBtn: {
    padding: "12px 24px",
    background: "#0b1d51",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    width: "100%",
    marginTop: "6px"
  },
  noticeBox: {
    padding: "16px 20px",
    background: "#fef3c7",
    color: "#92400e",
    borderRadius: "8px",
    marginBottom: "20px",
    border: "1px solid #fcd34d",
    fontWeight: "600"
  },
  loadingBox: {
    textAlign: "center",
    padding: "40px",
    background: "#ffffff",
    borderRadius: "12px",
    marginBottom: "20px"
  },
  spinner: {
    border: "4px solid #f3f4f6",
    borderTop: "4px solid #0b1d51",
    borderRadius: "50%",
    width: "40px",
    height: "40px",
    animation: "spin 1s linear infinite",
    margin: "0 auto 16px"
  },
  resultsCount: {
    color: "#6b7280",
    fontSize: "14px",
    fontWeight: "600",
    marginBottom: "16px"
  },
  hotelGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "24px"
  },
  hotelCard: {
    background: "#ffffff",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    border: "2px solid transparent"
  },
  hotelCardSelected: {
    background: "#ffffff",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 4px 16px rgba(11, 29, 81, 0.15)",
    border: "2px solid #0b1d51"
  },
  imageContainer: {
    position: "relative",
    height: "180px",
    overflow: "hidden",
    background: "#f3f4f6"
  },
  hotelImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  ratingBadge: {
    position: "absolute",
    top: "10px",
    right: "10px",
    background: "rgba(0,0,0,0.75)",
    color: "#fbbf24",
    padding: "4px 12px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: "700"
  },
  hotelBody: {
    padding: "16px 18px"
  },
  hotelName: {
    margin: "0 0 4px 0",
    fontSize: "18px",
    fontWeight: "700",
    color: "#0b1d51"
  },
  hotelLocation: {
    margin: "0 0 10px 0",
    fontSize: "14px",
    color: "#6b7280"
  },
  amenityRow: {
    display: "flex",
    gap: "6px",
    flexWrap: "wrap",
    marginBottom: "12px"
  },
  amenityTag: {
    background: "#f3f4f6",
    padding: "3px 10px",
    borderRadius: "12px",
    fontSize: "11px",
    color: "#4b5563",
    fontWeight: "600"
  },
  priceBox: {
    marginBottom: "8px"
  },
  priceAmount: {
    fontSize: "22px",
    fontWeight: "700",
    color: "#059669"
  },
  pricePerNight: {
    fontSize: "13px",
    color: "#6b7280",
    marginLeft: "4px"
  },
  roomInfo: {
    fontSize: "13px",
    color: "#4b5563",
    marginBottom: "12px",
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  },
  selectBtn: {
    width: "100%",
    padding: "10px",
    background: "#0b1d51",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer"
  },
  selectedBtn: {
    width: "100%",
    padding: "10px",
    background: "#059669",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "default"
  },
  loadMoreContainer: {
    textAlign: "center",
    marginTop: "24px"
  },
  loadMoreBtn: {
    padding: "12px 32px",
    background: "#e5e7eb",
    color: "#0b1d51",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer"
  },
  summaryCard: {
    marginTop: "32px",
    background: "#ffffff",
    borderRadius: "16px",
    padding: "24px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
    border: "2px solid #0b1d51"
  },
  summaryTitle: {
    fontSize: "24px",
    fontWeight: "900",
    color: "#0b1d51",
    marginBottom: "16px"
  },
  summaryContent: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "24px"
  },
  summaryHotelName: {
    fontSize: "20px",
    fontWeight: "700",
    color: "#0b1d51",
    margin: "0"
  },
  summaryLocation: {
    fontSize: "14px",
    color: "#6b7280",
    margin: "4px 0"
  },
  summaryDetails: {
    display: "flex",
    gap: "8px",
    fontSize: "14px",
    color: "#374151"
  },
  summaryRoom: {
    fontSize: "13px",
    color: "#4b5563",
    marginTop: "4px"
  },
  summaryRight: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    justifyContent: "center",
    alignItems: "flex-end"
  },
  summaryTotal: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end"
  },
  totalLabel: {
    fontSize: "13px",
    color: "#6b7280",
    fontWeight: "600"
  },
  totalAmount: {
    fontSize: "28px",
    fontWeight: "900",
    color: "#059669"
  },
  bookBtn: {
    padding: "12px 32px",
    background: "#0b1d51",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer"
  },
  summaryNote: {
    fontSize: "12px",
    color: "#6b7280",
    margin: "0"
  }
};

const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);