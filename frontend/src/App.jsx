import React, { useEffect, useState } from "react";
import TravelGuide from "./TravelGuide";
import FAQ from "./FAQ";
import Terms from "./Terms";
import Support from "./Support";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";

const FACILITIES = ["wifi", "spa", "gym", "restaurant", "pool", "parking"];

export default function App() {
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [guests, setGuests] = useState(2);
  const [hotels, setHotels] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [page, setPage] = useState("home");
  const [message, setMessage] = useState("");

  const filteredHotels = hotels.filter((h) =>
    selectedFacilities.every((f) => (h.facilities || []).includes(f))
  );

  async function searchHotels() {
    const params = new URLSearchParams();
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (area) params.set("area", area);
    params.set("adults", guests);

    try {
      const res = await fetch(`${API_BASE}/api/hotels?${params.toString()}`);
      const data = await res.json();
      setHotels(data.hotels || []);
      setSelectedHotel((data.hotels || [])[0] || null);
      setMessage("");
    } catch {
      setMessage("Search unavailable. Please try again.");
    }
  }

  useEffect(() => {
    searchHotels();
  }, []);

  function toggleFacility(f) {
    setSelectedFacilities((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  if (page === "guides") return <TravelGuide city={city || "Global"} goBack={() => setPage("home")} />;
  if (page === "faq") return <FAQ goBack={() => setPage("home")} />;
  if (page === "terms") return <Terms goBack={() => setPage("home")} />;
  if (page === "support") return <Support goBack={() => setPage("home")} />;

  return (
    <div style={{ background: "#07152f", color: "white", minHeight: "100vh", padding: 24, fontFamily: "Arial" }}>
      <h1 style={{ fontSize: 48 }}>My Space Hotel</h1>
      <p style={{ fontSize: 20 }}>Search globally, compare clearly, and request your stay with confidence.</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0" }}>
        <button onClick={() => setPage("guides")} style={pill}>Travel Guides</button>
        <button onClick={() => setPage("faq")} style={pill}>FAQs</button>
        <button onClick={() => setPage("terms")} style={pill}>Booking Terms</button>
        <button onClick={() => setPage("support")} style={pill}>Customer Support</button>
      </div>

      <div style={{ background: "#142a5c", padding: 24, borderRadius: 18 }}>
        <h2>Search globally</h2>
        <input style={input} placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
        <input style={input} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <input style={input} placeholder="Area" value={area} onChange={(e) => setArea(e.target.value)} />

        <div style={{ margin: "12px 0" }}>
          <b>Guests: </b>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} onClick={() => setGuests(n)} style={guests === n ? activeGuest : guestBtn}>
              {n}
            </button>
          ))}
        </div>

        <h3>Facilities</h3>
        {FACILITIES.map((f) => (
          <label key={f} style={{ marginRight: 14 }}>
            <input type="checkbox" checked={selectedFacilities.includes(f)} onChange={() => toggleFacility(f)} /> {f}
          </label>
        ))}

        <br />
        <button onClick={searchHotels} style={yellow}>Search Hotels</button>
      </div>

      <h2 style={{ marginTop: 24 }}>{filteredHotels.length} hotels found</h2>

      <div style={{ maxHeight: 480, overflowY: "auto", display: "grid", gap: 12 }}>
        {filteredHotels.map((h) => (
          <div key={h.id} onClick={() => setSelectedHotel(h)} style={card}>
            <h3>{h.name}</h3>
            <p>{h.area}, {h.city}, {h.country}</p>
            <p><b>{h.currency} {h.price}</b></p>
            <p>{(h.facilities || []).join(", ")}</p>
          </div>
        ))}
      </div>

      {selectedHotel && (
        <div style={bookingBox}>
          <h2>Selected stay</h2>
          <h3>{selectedHotel.name}</h3>
          <p>{selectedHotel.area}, {selectedHotel.city}, {selectedHotel.country}</p>
          <p><b>{selectedHotel.currency} {selectedHotel.price}</b></p>
          <button style={yellow}>Send reservation request</button>
        </div>
      )}

      {message && <p>{message}</p>}
    </div>
  );
}

const input = { padding: 14, margin: 6, borderRadius: 10, border: "none", fontSize: 16 };
const pill = { background: "#ffffff22", color: "white", border: "1px solid #ffffff44", padding: 14, borderRadius: 999, fontWeight: 800 };
const yellow = { background: "#f1c644", color: "#07152f", border: "none", padding: 14, borderRadius: 12, fontWeight: 900, marginTop: 14 };
const guestBtn = { margin: 5, padding: 10, borderRadius: 8 };
const activeGuest = { margin: 5, padding: 10, borderRadius: 8, background: "#f1c644", fontWeight: 900 };
const card = { background: "white", color: "#07152f", padding: 18, borderRadius: 14, cursor: "pointer" };
const bookingBox = { background: "#142a5c", padding: 22, borderRadius: 18, marginTop: 24 };