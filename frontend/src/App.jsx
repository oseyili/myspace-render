import React, { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE;

export default function App() {
  const [hotels, setHotels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [status, setStatus] = useState("");

  // 🔥 LOAD HOTELS FROM BACKEND
  const fetchHotels = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/hotels`);
      const data = await res.json();
      setHotels(data.hotels || []);
    } catch (err) {
      console.error(err);
      setStatus("Failed to fetch hotels");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHotels();
  }, []);

  // 🔥 RESERVE FUNCTION
  const reserveHotel = async () => {
    if (!selectedHotel) return;

    setStatus("Sending request...");

    try {
      const res = await fetch(`${API_BASE}/reserve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotel: selectedHotel.name,
          email: "test@email.com",
        }),
      });

      const data = await res.json();

      if (data.success) {
        setStatus("Reservation sent successfully ✅");
      } else {
        setStatus("Reservation failed ❌");
      }
    } catch (err) {
      console.error(err);
      setStatus("Error sending request ❌");
    }
  };

  // 🔥 NAVIGATION PAGES
  const openPage = (page) => {
    window.location.href = `/${page}`;
  };

  return (
    <div style={{ padding: 30, fontFamily: "Arial" }}>
      <h1>My Space Hotel</h1>
      <p>Search global hotels and reserve directly.</p>

      {/* NAV BUTTONS */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => openPage("guides")}>Travel Guides</button>
        <button onClick={() => openPage("faqs")}>FAQs</button>
        <button onClick={() => openPage("terms")}>Booking Terms</button>
        <button onClick={() => openPage("support")}>Customer Support</button>
      </div>

      {/* HOTEL LIST */}
      {loading ? (
        <p>Loading hotels...</p>
      ) : (
        <div>
          {hotels.map((hotel, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #ccc",
                padding: 15,
                marginBottom: 10,
              }}
            >
              <h3>{hotel.name}</h3>
              <p>{hotel.city}</p>
              <p>{hotel.price}</p>

              <button onClick={() => setSelectedHotel(hotel)}>
                Select
              </button>
            </div>
          ))}
        </div>
      )}

      {/* RESERVE */}
      {selectedHotel && (
        <div style={{ marginTop: 20 }}>
          <h2>{selectedHotel.name}</h2>
          <button onClick={reserveHotel}>Reserve</button>
        </div>
      )}

      <p>{status}</p>
    </div>
  );
}