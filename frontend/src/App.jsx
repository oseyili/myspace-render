import React, { useState } from "react";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";

export default function App() {
  const [city, setCity] = useState("London");
  const [country, setCountry] = useState("United Kingdom");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const searchHotels = async () => {
    setLoading(true);
    setError("");

    try {
      const url = `${API_BASE}/api/hotels?city=${encodeURIComponent(
        city
      )}&country=${encodeURIComponent(country)}`;

      const res = await fetch(url);

      if (!res.ok) throw new Error("API error");

      const data = await res.json();

      setResults(data.items || []);
    } catch (err) {
      console.error(err);
      setError("Search failed. Please try again.");
    }

    setLoading(false);
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>My Space Hotel</h1>

      <div style={{ marginBottom: 20 }}>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City"
        />
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country"
        />
        <button onClick={searchHotels}>Search Hotels</button>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p>{error}</p>}

      {results.map((hotel) => (
        <div key={hotel.id} style={{ marginBottom: 10 }}>
          <h3>{hotel.name}</h3>
          <p>{hotel.location}</p>
          <p>£{hotel.price}</p>
        </div>
      ))}
    </div>
  );
}