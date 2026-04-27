import React from "react";

export default function TravelPages({ city = "London" }) {
  return (
    <div style={{ background: "#0b1f4b", color: "white", padding: "30px" }}>

      {/* HERO */}
      <h1 style={{ fontSize: "48px", fontWeight: "bold" }}>
        Discover {city} before you book
      </h1>

      <p style={{ fontSize: "18px", maxWidth: "800px" }}>
        Your hotel choice defines your entire experience.
        Explore the city, understand the areas, and choose the stay that fits your trip.
      </p>

      {/* IMAGE GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "15px",
        marginTop: "30px"
      }}>
        <img src="https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba" style={{ width: "100%", borderRadius: "12px" }} />
        <img src="https://images.unsplash.com/photo-1473959383413-3d6f0f69d8b9" style={{ width: "100%", borderRadius: "12px" }} />
        <img src="https://images.unsplash.com/photo-1505761671935-60b3a7427bad" style={{ width: "100%", borderRadius: "12px" }} />
      </div>

      {/* WHY VISIT */}
      <h2 style={{ marginTop: "40px", color: "#FFD700" }}>
        Why {city} is worth visiting
      </h2>

      <p>
        {city} combines culture, lifestyle, food, and unique experiences.
        Choosing the right location will determine how easy, enjoyable,
        and efficient your stay will be.
      </p>

      {/* AREAS */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "20px",
        marginTop: "30px"
      }}>
        <div style={card}>Central — close to everything</div>
        <div style={card}>Business areas — quiet and efficient</div>
        <div style={card}>Tourist zones — lively and vibrant</div>
      </div>

      {/* MAP */}
      <h2 style={{ marginTop: "40px", color: "#FFD700" }}>
        Explore the city
      </h2>

      <iframe
        src={`https://www.google.com/maps?q=${city}&output=embed`}
        width="100%"
        height="350"
        style={{ border: 0, borderRadius: "12px" }}
      />

      {/* CTA */}
      <div style={{
        marginTop: "40px",
        background: "#FFD700",
        padding: "20px",
        borderRadius: "12px",
        textAlign: "center"
      }}>
        <h2 style={{ color: "#000" }}>Continue your hotel search</h2>
      </div>

    </div>
  );
}

const card = {
  background: "#1e3a8a",
  padding: "20px",
  borderRadius: "12px"
};