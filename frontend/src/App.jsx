import React, { useState } from "react";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";

export default function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const searchHotels = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/hotels?destination=London`);
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const getBookingLink = (hotel) => {
    // AUTO affiliate switching (safe fallback)
    if (hotel.booking_url) return hotel.booking_url;

    return `https://www.booking.com/searchresults.html?ss=${hotel.name}`;
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>My Space Hotel</h1>

      <button onClick={searchHotels}>
        {loading ? "Searching..." : "Search Hotels"}
      </button>

      <div style={{ marginTop: 20 }}>
        {results.map((hotel, i) => (
          <div key={i} style={{ border: "1px solid #ccc", padding: 15, marginBottom: 10 }}>
            <h3>{hotel.name}</h3>
            <p>{hotel.address}</p>

            <a href={getBookingLink(hotel)} target="_blank" rel="noreferrer">
              <button style={{ background: "#0a84ff", color: "#fff", padding: "10px 15px" }}>
                Reserve / Book Now
              </button>
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}