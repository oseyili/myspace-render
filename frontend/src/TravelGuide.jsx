import React from "react";

const GUIDE_DATA = {
  London: {
    heroTitle: "London travel guide",
    heroText:
      "Choose the part of London that fits your trip, compare hotel options with more confidence, and return to search when you are ready to reserve.",
    introTitle: "Why this guide helps",
    introText:
      "London has very different neighbourhoods, hotel styles, and travel moods. The right stay is not only about price. It is also about access, atmosphere, convenience, and how well the location supports the reason for your trip.",
    areas: [
      {
        title: "Mayfair",
        text: "A refined choice for travellers who want prestige, luxury shopping, elegant dining, and a polished central base.",
      },
      {
        title: "Westminster",
        text: "A strong choice for first-time visitors who want major landmarks, classic London views, and convenient access to famous sights.",
      },
      {
        title: "Soho",
        text: "Best for travellers who want energy, restaurants, nightlife, culture, and a more lively urban atmosphere.",
      },
    ],
    perfectFor: [
      "First-time visitors",
      "Business travellers",
      "Families comparing comfort and access",
      "Customers who want to reserve with more confidence",
    ],
    smartTips: [
      "Choose location before chasing the lowest headline price",
      "Filter by facilities that matter to the trip",
      "Compare a few strong options before sending your request",
    ],
  },
};

const fallbackGuide = (city) => ({
  heroTitle: `${city} travel guide`,
  heroText: `Discover how to choose the right part of ${city} and return to search with greater confidence.`,
  introTitle: "Why this guide helps",
  introText: `A stronger hotel decision starts with a stronger location decision in ${city}.`,
  areas: [
    { title: "Central area", text: `Often a strong choice for convenience in ${city}.` },
    { title: "Premium district", text: `A better fit for a more polished stay experience.` },
    { title: "Lively district", text: `Good for energy, dining, and a stronger social atmosphere.` },
  ],
  perfectFor: ["Shortlist building", "Location-first travellers", "Confident decisions"],
  smartTips: ["Start with area fit", "Use facility filters", "Return to search after narrowing location"],
});

export default function TravelGuide({ city, goBack }) {
  const guide = GUIDE_DATA[city] || fallbackGuide(city);

  return (
    <div style={{ minHeight: "100vh", background: "#07152f", color: "#ffffff", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "28px 20px 40px 20px" }}>
        <button
          onClick={goBack}
          style={{
            background: "#f1c644",
            color: "#0b1c3d",
            border: "none",
            borderRadius: "14px",
            padding: "14px 20px",
            fontWeight: "700",
            fontSize: "16px",
            cursor: "pointer",
            marginBottom: "20px",
          }}
        >
          Return to search
        </button>

        <div
          style={{
            background: "linear-gradient(135deg, #163a87 0%, #2d5fcb 100%)",
            borderRadius: "28px",
            padding: "34px",
            boxShadow: "0 18px 45px rgba(0,0,0,0.28)",
            marginBottom: "24px",
          }}
        >
          <div style={{ letterSpacing: "2px", textTransform: "uppercase", fontSize: "14px", opacity: 0.9, marginBottom: "14px", fontWeight: "700" }}>
            Smart travel guides
          </div>

          <h1 style={{ fontSize: "56px", lineHeight: 1.05, margin: "0 0 18px 0", fontWeight: "800" }}>
            {guide.heroTitle}
          </h1>

          <p style={{ fontSize: "22px", lineHeight: 1.7, maxWidth: "1050px", margin: 0, color: "#edf4ff" }}>
            {guide.heroText}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 0.95fr", gap: "22px", alignItems: "start" }}>
          <div>
            <div style={{ background: "#102244", borderRadius: "24px", padding: "28px", marginBottom: "22px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 style={{ fontSize: "34px", margin: "0 0 14px 0", color: "#ffffff" }}>{guide.introTitle}</h2>
              <p style={{ fontSize: "19px", lineHeight: 1.8, margin: 0, color: "#d9e5ff" }}>{guide.introText}</p>
            </div>

            <div style={{ background: "#102244", borderRadius: "24px", padding: "28px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 style={{ fontSize: "34px", margin: "0 0 18px 0", color: "#ffffff" }}>Best areas to consider</h2>
              <div style={{ display: "grid", gap: "16px" }}>
                {guide.areas.map((area, index) => (
                  <div key={`${area.title}-${index}`} style={{ background: "#0b1c3d", borderRadius: "20px", padding: "20px", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <h3 style={{ margin: "0 0 10px 0", fontSize: "25px", color: "#f1c644" }}>{area.title}</h3>
                    <p style={{ margin: 0, fontSize: "18px", lineHeight: 1.75, color: "#d9e5ff" }}>{area.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div style={{ background: "#102244", borderRadius: "24px", padding: "26px", marginBottom: "22px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 style={{ fontSize: "28px", margin: "0 0 16px 0", color: "#ffffff" }}>Perfect for</h2>
              <div style={{ display: "grid", gap: "12px" }}>
                {guide.perfectFor.map((item, index) => (
                  <div key={`${item}-${index}`} style={{ background: "#0b1c3d", borderRadius: "16px", padding: "14px 16px", color: "#d9e5ff", fontSize: "17px", lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.08)" }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "#102244", borderRadius: "24px", padding: "26px", marginBottom: "22px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 style={{ fontSize: "28px", margin: "0 0 16px 0", color: "#ffffff" }}>Smart travel tips</h2>
              <div style={{ display: "grid", gap: "12px" }}>
                {guide.smartTips.map((item, index) => (
                  <div key={`${item}-${index}`} style={{ background: "#0b1c3d", borderRadius: "16px", padding: "14px 16px", color: "#d9e5ff", fontSize: "17px", lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.08)" }}>
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "linear-gradient(135deg, #183c88 0%, #2b5ecb 100%)", borderRadius: "24px", padding: "28px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <h2 style={{ fontSize: "34px", lineHeight: 1.2, margin: "0 0 14px 0", color: "#ffffff" }}>
                Continue your search with more confidence
              </h2>
              <p style={{ fontSize: "18px", lineHeight: 1.75, color: "#edf4ff", margin: "0 0 18px 0" }}>
                Use what you have learned from this guide, return to search, compare stronger options, and send your reservation request when the stay feels right.
              </p>
              <button
                onClick={goBack}
                style={{
                  background: "#f1c644",
                  color: "#0b1c3d",
                  border: "none",
                  borderRadius: "14px",
                  padding: "15px 20px",
                  fontWeight: "700",
                  fontSize: "16px",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Search hotels in {city}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}