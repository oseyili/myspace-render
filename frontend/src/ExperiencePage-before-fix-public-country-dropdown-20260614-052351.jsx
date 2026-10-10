import React, { useMemo } from "react";

const IDS = {
  getYourGuide: "T35KLRD",
  tiqets: "myspace_hotel_ltd-187389",
  klook: "123338",
  viator: "P00304740",
  welcomePickups: "110382",
};

function safeText(value, fallback = "") {
  return String(value || fallback).trim();
}

function openPartner(url) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildLinks(destinationLabel) {
  const q = encodeURIComponent(destinationLabel);

  return {
    getYourGuide: `https://www.getyourguide.com/s/?q=${q}&partner_id=${IDS.getYourGuide}`,
    tiqets: `https://www.tiqets.com/en/?partner=${IDS.tiqets}&tq_campaign=${encodeURIComponent(destinationLabel)}`,
    klook: `https://www.klook.com/en-US/search/result/?query=${q}&aid=${IDS.klook}&_currency=USD&utm_medium=affiliate-alwayson&utm_source=non-network&utm_campaign=${IDS.klook}`,
    viator: `https://www.viator.com/searchResults/all?text=${q}&pid=${IDS.viator}`,
    welcomePickups: `https://www.welcomepickups.com/?partner_id=${IDS.welcomePickups}&utm_source=myspace_hotel&utm_medium=affiliate&utm_campaign=${encodeURIComponent(destinationLabel)}`,
  };
}

export default function ExperiencePage() {
  const savedHotel = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("msh_selected_hotel") || "null");
    } catch {
      return null;
    }
  }, []);

  const city = safeText(
    savedHotel?.city ||
      savedHotel?.destinationCity ||
      savedHotel?.hotelCity ||
      savedHotel?.location ||
      "London"
  );

  const country = safeText(
    savedHotel?.country ||
      savedHotel?.destinationCountry ||
      savedHotel?.hotelCountry ||
      "United Kingdom"
  );

  const destinationLabel = [city, country].filter(Boolean).join(", ");
  const links = buildLinks(destinationLabel);

  const sections = [
    {
      title: "Top tours and things to do",
      partner: "GetYourGuide",
      text: `Browse tours, attractions and experiences in ${destinationLabel}.`,
      button: "View tours",
      url: links.getYourGuide,
    },
    {
      title: "Museums, landmarks and tickets",
      partner: "Tiqets",
      text: `Find attraction tickets and cultural experiences in ${destinationLabel}.`,
      button: "View tickets",
      url: links.tiqets,
    },
    {
      title: "Activities, attractions and transport",
      partner: "Klook",
      text: `Explore activities and travel extras in ${destinationLabel}.`,
      button: "View activities",
      url: links.klook,
    },
    {
      title: "Tours and excursions",
      partner: "Viator",
      text: `Compare tours and excursions in ${destinationLabel}.`,
      button: "Browse excursions",
      url: links.viator,
    },
    {
      title: "Airport and hotel transfers",
      partner: "Welcome Pickups",
      text: `Arrange airport transfers and private rides for your trip to ${destinationLabel}.`,
      button: "Book transfers",
      url: links.welcomePickups,
    },
  ];

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "#ffffff",
        padding: "34px 38px 60px",
      }}
    >
      <section style={{ maxWidth: 1480, margin: "0 auto" }}>
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(15,23,42,1), rgba(30,64,175,0.72))",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 26,
            padding: "34px",
            marginBottom: 28,
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#38bdf8",
              fontWeight: 900,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            MySpace Hotel Experience Hub
          </p>

          <h1 style={{ fontSize: 48, lineHeight: 1.05, margin: "12px 0" }}>
            Experiences in {destinationLabel}
          </h1>

          <p style={{ maxWidth: 900, color: "#dbeafe", fontSize: 19, lineHeight: 1.6, margin: 0 }}>
            Discover tours, attraction tickets, transfers and destination activities selected for your trip.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 18,
            marginBottom: 28,
          }}
        >
          {sections.map((item) => (
            <article
              key={item.partner}
              style={{
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: 20,
                padding: 24,
                minHeight: 260,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <p style={{ margin: "0 0 8px", color: "#38bdf8", fontWeight: 800, fontSize: 13 }}>
                  {item.partner}
                </p>

                <h2 style={{ margin: "0 0 12px", fontSize: 25 }}>
                  {item.title}
                </h2>

                <p style={{ color: "#cbd5e1", lineHeight: 1.5, fontSize: 16 }}>
                  {item.text}
                </p>
              </div>

              <button
                onClick={() => openPartner(item.url)}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  border: "none",
                  borderRadius: 14,
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 16,
                  background: "#10b981",
                  color: "#ffffff",
                }}
              >
                {item.button}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}