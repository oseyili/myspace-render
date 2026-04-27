import React, { useState } from "react";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";
const PAGE_SIZE = 48;

export default function App() {
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [hotels, setHotels] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);

  async function search(p = 1) {
    setPage(p);

    const params = new URLSearchParams({
      page: p,
      page_size: PAGE_SIZE,
      country,
      city,
    });

    const res = await fetch(`${API_BASE}/api/hotels?${params}`);
    const data = await res.json();

    setHotels(data.hotels || []);
    setCount(data.count || 0);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Search Hotels</h1>

      <input placeholder="Country" value={country} onChange={e => setCountry(e.target.value)} />
      <input placeholder="City" value={city} onChange={e => setCity(e.target.value)} />

      <button onClick={() => search(1)}>Search</button>

      <h2>{hotels.length} shown from {count}</h2>

      <button onClick={() => search(page - 1)} disabled={page <= 1}>Prev</button>
      <button onClick={() => search(page + 1)}>Next</button>

      {hotels.map(h => (
        <div key={h.id} style={{ border: "1px solid #ccc", margin: 10, padding: 10 }}>
          <img
            src={h.high_res_image || h.image}
            style={{ width: "100%", height: 200, objectFit: "cover" }}
          />

          <h3>{h.name}</h3>
          <p>{h.city}, {h.country}</p>

          <p>{h.currency} {h.price}</p>

          <div>
            {Array.isArray(h.facilities) && h.facilities.length > 0
              ? h.facilities.slice(0, 6).map(f => <span key={f}>✓ {f} </span>)
              : "Facilities loading..."}
          </div>
        </div>
      ))}
    </div>
  );
}