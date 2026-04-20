import React, { useState } from "react";

const API_BASE =
typeof window !== "undefined" && window.location.hostname === "localhost"
? "http://127.0.0.1:3010"
: "https://hotel-backend-1-ee5z.onrender.com";

export default function App() {
const [city, setCity] = useState("London");
const [country, setCountry] = useState("United Kingdom");
const [results, setResults] = useState([]);
const [loading, setLoading] = useState(false);
const [error, setError] = useState("");

const searchHotels = async () => {
try {
setLoading(true);
setError("");

```
  const url = `${API_BASE}/api/hotels?city=${encodeURIComponent(
    city
  )}&country=${encodeURIComponent(country)}`;

  console.log("Calling API:", url);

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Network response failed");
  }

  const data = await res.json();

  setResults(data.items || []);
} catch (err) {
  console.error(err);
  setError("Unable to load hotels. Please try again.");
} finally {
  setLoading(false);
}
```

};

return (
<div style={{ padding: 20, fontFamily: "Arial" }}> <h1>My Space Hotel</h1>

```
  <div style={{ marginBottom: 20 }}>
    <input
      value={city}
      onChange={(e) => setCity(e.target.value)}
      placeholder="City"
      style={{ marginRight: 10 }}
    />
    <input
      value={country}
      onChange={(e) => setCountry(e.target.value)}
      placeholder="Country"
      style={{ marginRight: 10 }}
    />
    <button onClick={searchHotels}>Search Hotels</button>
  </div>

  {loading && <p>Loading hotels...</p>}

  {error && <p style={{ color: "red" }}>{error}</p>}

  <div>
    {results.length === 0 && !loading && <p>No hotels found yet.</p>}

    {results.map((hotel) => (
      <div
        key={hotel.id}
        style={{
          border: "1px solid #ccc",
          padding: 10,
          marginBottom: 10,
          borderRadius: 6,
        }}
      >
        <h3>{hotel.name}</h3>
        <p>
          {hotel.city}, {hotel.country}
        </p>
        <p>£{hotel.price} per night</p>
        <p>Rating: {hotel.rating}</p>
      </div>
    ))}
  </div>
</div>
```

);
}
