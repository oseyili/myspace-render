import React, { useMemo, useState } from "react";

const SUPPORT_EMAIL = "reservations@myspace-hotel.com";
const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";

const FACILITY_OPTIONS = [
  "Free Wi-Fi",
  "Breakfast",
  "Parking",
  "Pool",
  "Gym",
  "Airport shuttle",
  "Family friendly",
  "Pet friendly",
];

const GUIDE_ITEMS = [
  {
    city: "London",
    text: "Best for theatre breaks, museums, shopping streets, and easy transport links.",
  },
  {
    city: "Dubai",
    text: "Best for luxury stays, sunshine breaks, resort pools, and modern waterfront areas.",
  },
  {
    city: "Paris",
    text: "Best for romantic weekends, boutique hotels, stylish neighbourhoods, and culture-led trips.",
  },
  {
    city: "Lagos",
    text: "Best for business travel, city energy, family visits, and fast-moving schedules.",
  },
];

const FAQS = [
  {
    q: "How do I search for hotels?",
    a: "Enter your destination, travel dates, guests, and rooms, then press Search Hotels.",
  },
  {
    q: "Can I filter by facilities?",
    a: "Yes. Pick the facilities you want first, then search to narrow your results.",
  },
  {
    q: "How do I reserve a stay?",
    a: "Choose a hotel from the list, review the selected stay card, then press Reserve Now.",
  },
  {
    q: "Why is the layout simpler now?",
    a: "The design is intentionally shorter and cleaner so customers reach booking faster.",
  },
];

const PAGE_CONTENT = {
  guides: {
    title: "Explore Travel Guides",
    intro: "Quick destination tips to help customers decide faster.",
    sections: GUIDE_ITEMS.map((item) => ({
      title: item.city,
      body: item.text,
    })),
  },
  faq: {
    title: "Frequently Asked Questions",
    intro: "Helpful answers before continuing to a booking partner.",
    sections: FAQS.map((item) => ({
      title: item.q,
      body: item.a,
    })),
  },
  terms: {
    title: "Terms and Conditions",
    intro: "Please review these points before reserving a stay.",
    sections: [
      {
        title: "Booking information",
        body:
          "Prices, room types, taxes, and availability can change quickly. Final details are confirmed on the partner booking page.",
      },
      {
        title: "Guest details",
        body:
          "Please use correct traveller names, dates, rooms, and guest counts to avoid booking errors.",
      },
      {
        title: "Third-party completion",
        body:
          "My Space Hotel helps customers search, compare, and select stays. Final booking completion happens on the selected partner site.",
      },
    ],
  },
};

function normaliseHotels(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.data)) return payload.data;
  if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
  return [];
}

function hotelFacilities(hotel) {
  if (Array.isArray(hotel?.facilities)) return hotel.facilities;
  if (!hotel?.facilities) return [];
  return String(hotel.facilities)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `£${n}`;
}

function detectAffiliatePartner(hotel) {
  const source = String(
    hotel?.affiliate_url || hotel?.booking_url || hotel?.url || ""
  ).toLowerCase();

  if (source.includes("expedia")) return "Expedia";
  if (source.includes("hotels.com")) return "Hotels.com";
  if (source.includes("trip.com")) return "Trip.com";
  return "Booking.com";
}

function buildAffiliateLink(hotel) {
  if (hotel?.affiliate_url) return hotel.affiliate_url;
  if (hotel?.booking_url) return hotel.booking_url;
  if (hotel?.url) return hotel.url;

  const hotelName = encodeURIComponent(hotel?.name || "Hotel");
  const city = encodeURIComponent(hotel?.city || "London");
  return `https://www.booking.com/searchresults.html?ss=${hotelName}%20${city}`;
}

function safeOpenExternal(url) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Invalid external URL:", error);
    alert("That booking link is not available right now. Please try another hotel.");
  }
}

function appShell() {
  return {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, #eef4ff 0%, #edf2f9 42%, #e7edf7 100%)",
    padding: "20px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#10224d",
  };
}

function panelStyle(dark = false) {
  return dark
    ? {
        background: "linear-gradient(180deg, #102a72 0%, #0d225b 100%)",
        borderRadius: "28px",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 18px 40px rgba(13,34,91,0.25)",
      }
    : {
        background: "rgba(255,255,255,0.88)",
        borderRadius: "28px",
        border: "1px solid #d9e3f3",
        boxShadow: "0 14px 34px rgba(16,34,77,0.08)",
        backdropFilter: "blur(10px)",
      };
}

function inputStyle(dark = false) {
  return {
    width: "100%",
    height: "54px",
    borderRadius: "16px",
    border: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #d7e1f1",
    background: dark ? "rgba(255,255,255,0.10)" : "#f6f9fe",
    color: dark ? "#ffffff" : "#10224d",
    padding: "0 14px",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box",
  };
}

function chipStyle(active) {
  return {
    minHeight: "42px",
    borderRadius: "999px",
    border: active ? "1px solid #2e67e6" : "1px solid #d6e0f0",
    background: active ? "#e8f0ff" : "#ffffff",
    color: active ? "#18429c" : "#31466f",
    padding: "0 14px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function primaryButton() {
  return {
    height: "54px",
    borderRadius: "16px",
    border: 0,
    background: "linear-gradient(90deg, #2d67e5, #2ab7d8)",
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 18px",
  };
}

function secondaryButton() {
  return {
    height: "46px",
    borderRadius: "14px",
    border: "1px solid #d6e0f2",
    background: "#ffffff",
    color: "#16397e",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
    padding: "0 16px",
  };
}

function tinyLabel(text, dark = false) {
  return (
    <div
      style={{
        fontSize: "12px",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: dark ? "#bdd0ff" : "#6a7ea8",
        fontWeight: 800,
        marginBottom: "8px",
      }}
    >
      {text}
    </div>
  );
}

function ModalPage({ pageKey, onClose }) {
  if (!pageKey || !PAGE_CONTENT[pageKey]) return null;
  const page = PAGE_CONTENT[pageKey];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(7,19,49,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "min(840px, 100%)",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "#ffffff",
          borderRadius: "28px",
          border: "1px solid #d9e3f3",
          boxShadow: "0 24px 60px rgba(16,34,77,0.22)",
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <div>
            {tinyLabel("Information")}
            <h2
              style={{
                margin: 0,
                fontSize: "32px",
                lineHeight: 1.05,
                fontWeight: 900,
                color: "#10224d",
              }}
            >
              {page.title}
            </h2>
          </div>

          <button type="button" onClick={onClose} style={secondaryButton()}>
            Close
          </button>
        </div>

        <p
          style={{
            margin: "14px 0 0",
            color: "#5f7398",
            fontSize: "16px",
            lineHeight: 1.6,
          }}
        >
          {page.intro}
        </p>

        <div style={{ display: "grid", gap: "12px", marginTop: "18px" }}>
          {page.sections.map((section) => (
            <div
              key={section.title}
              style={{
                background: "#f8fbff",
                borderRadius: "20px",
                border: "1px solid #dbe6f5",
                padding: "16px",
              }}
            >
              <div
                style={{
                  fontSize: "19px",
                  fontWeight: 900,
                  color: "#10224d",
                }}
              >
                {section.title}
              </div>
              <div
                style={{
                  marginTop: "8px",
                  color: "#5f7398",
                  fontSize: "15px",
                  lineHeight: 1.6,
                }}
              >
                {section.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [search, setSearch] = useState({
    destination: "London",
    country: "United Kingdom",
    city: "",
    location: "",
    checkIn: "2026-04-25",
    checkOut: "2026-04-26",
    guests: "1",
    rooms: "1",
  });

  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [statusText, setStatusText] = useState(
    "Search cleaner, choose faster, and reserve with a smoother partner handoff."
  );
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(false);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [openPage, setOpenPage] = useState(null);

  const filteredHotels = useMemo(() => {
    if (!selectedFacilities.length) return hotels;

    return hotels.filter((hotel) => {
      const facilities = hotelFacilities(hotel).map((item) => item.toLowerCase());
      return selectedFacilities.every((wanted) => {
        const target = wanted.toLowerCase();
        return facilities.some(
          (existing) => existing.includes(target) || target.includes(existing)
        );
      });
    });
  }, [hotels, selectedFacilities]);

  const activeHotel = selectedHotel || filteredHotels[0] || null;
  const activePartner = activeHotel ? detectAffiliatePartner(activeHotel) : "Booking partner";
  const activeLink = activeHotel ? buildAffiliateLink(activeHotel) : "";

  function updateSearch(field, value) {
    setSearch((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleFacility(facility) {
    setSelectedFacilities((current) =>
      current.includes(facility)
        ? current.filter((item) => item !== facility)
        : [...current, facility]
    );
  }

  async function handleSearch(event) {
    event.preventDefault();
    setLoading(true);
    setErrorText("");
    setSelectedHotel(null);

    const destination = search.destination || search.city || "London";

    try {
      const params = new URLSearchParams({
        destination,
        country: search.country || "United Kingdom",
        city: search.city || "",
        location: search.location || "",
        guests: search.guests || "1",
        rooms: search.rooms || "1",
        page: "1",
        page_size: "40",
        facilities: selectedFacilities.join(","),
      });

      const response = await fetch(`${API_BASE}/api/hotels?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }

      const payload = await response.json();
      const items = normaliseHotels(payload);

      setHotels(items);
      setStatusText(
        payload?.message ||
          (items.length
            ? `${items.length} hotel options found for ${destination}.`
            : `No hotels matched this search for ${destination}.`)
      );
    } catch (error) {
      console.error("Hotel search failed:", error);
      setHotels([]);
      setErrorText("Live hotel results could not load on this attempt.");
      setStatusText("Search did not connect properly. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={appShell()}>
      <ModalPage pageKey={openPage} onClose={() => setOpenPage(null)} />

      <div style={{ maxWidth: "1420px", margin: "0 auto" }}>
        <section
          style={{
            ...panelStyle(),
            padding: "18px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr",
              gap: "16px",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                ...panelStyle(true),
                padding: "22px",
                color: "#ffffff",
              }}
            >
              {tinyLabel("Worldwide hotel bookings", true)}

              <h1
                style={{
                  margin: 0,
                  fontSize: "56px",
                  lineHeight: 0.95,
                  letterSpacing: "-0.05em",
                  fontWeight: 900,
                }}
              >
                My Space Hotel
              </h1>

              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: "17px",
                  lineHeight: 1.55,
                  color: "#e4edff",
                  maxWidth: "720px",
                }}
              >
                Find a stay faster, compare more clearly, and move to booking without all the clutter.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  flexWrap: "wrap",
                  marginTop: "18px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenPage("guides")}
                  style={{
                    ...secondaryButton(),
                    background: "#f0c84b",
                    border: "none",
                    color: "#2a2310",
                  }}
                >
                  Travel Guides
                </button>

                <button
                  type="button"
                  onClick={() => setOpenPage("faq")}
                  style={secondaryButton()}
                >
                  FAQ
                </button>

                <button
                  type="button"
                  onClick={() => setOpenPage("terms")}
                  style={secondaryButton()}
                >
                  Terms
                </button>

                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `mailto:${SUPPORT_EMAIL}`;
                  }}
                  style={{
                    ...secondaryButton(),
                    background: "rgba(255,255,255,0.12)",
                    color: "#ffffff",
                    border: "1px solid rgba(255,255,255,0.18)",
                  }}
                >
                  Support
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: "10px",
                  marginTop: "18px",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    borderRadius: "18px",
                    padding: "14px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#cfe0ff" }}>Results</div>
                  <div style={{ marginTop: "8px", fontSize: "26px", fontWeight: 900 }}>
                    {filteredHotels.length}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    borderRadius: "18px",
                    padding: "14px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#cfe0ff" }}>Selected</div>
                  <div style={{ marginTop: "8px", fontSize: "26px", fontWeight: 900 }}>
                    {activeHotel ? "1" : "0"}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    borderRadius: "18px",
                    padding: "14px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#cfe0ff" }}>Partner</div>
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "20px",
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {activePartner}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                ...panelStyle(),
                padding: "20px",
              }}
            >
              {tinyLabel("Search")}
              <h2
                style={{
                  margin: 0,
                  fontSize: "28px",
                  lineHeight: 1.1,
                  fontWeight: 900,
                }}
              >
                Search hotels
              </h2>

              <form onSubmit={handleSearch} style={{ marginTop: "14px" }}>
                <div style={{ display: "grid", gap: "10px" }}>
                  <input
                    value={search.destination}
                    onChange={(e) => updateSearch("destination", e.target.value)}
                    placeholder="Destination"
                    style={inputStyle()}
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <input
                      value={search.country}
                      onChange={(e) => updateSearch("country", e.target.value)}
                      placeholder="Country"
                      style={inputStyle()}
                    />
                    <input
                      value={search.city}
                      onChange={(e) => updateSearch("city", e.target.value)}
                      placeholder="City"
                      style={inputStyle()}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <input
                      type="date"
                      value={search.checkIn}
                      onChange={(e) => updateSearch("checkIn", e.target.value)}
                      style={inputStyle()}
                    />
                    <input
                      type="date"
                      value={search.checkOut}
                      onChange={(e) => updateSearch("checkOut", e.target.value)}
                      style={inputStyle()}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "10px",
                    }}
                  >
                    <input
                      value={search.location}
                      onChange={(e) => updateSearch("location", e.target.value)}
                      placeholder="Area"
                      style={inputStyle()}
                    />
                    <input
                      type="number"
                      min="1"
                      value={search.guests}
                      onChange={(e) => updateSearch("guests", e.target.value)}
                      placeholder="Guests"
                      style={inputStyle()}
                    />
                    <input
                      type="number"
                      min="1"
                      value={search.rooms}
                      onChange={(e) => updateSearch("rooms", e.target.value)}
                      placeholder="Rooms"
                      style={inputStyle()}
                    />
                  </div>

                  <button type="submit" disabled={loading} style={primaryButton()}>
                    {loading ? "Searching..." : "Search Hotels"}
                  </button>

                  <div
                    style={{
                      background: "#f6f9fe",
                      borderRadius: "16px",
                      border: "1px solid #dbe5f5",
                      padding: "12px 14px",
                      color: "#5f7398",
                      fontSize: "14px",
                      lineHeight: 1.5,
                    }}
                  >
                    {statusText}
                  </div>

                  {errorText ? (
                    <div
                      style={{
                        background: "#fff2f2",
                        borderRadius: "16px",
                        border: "1px solid #f0c7c7",
                        padding: "12px 14px",
                        color: "#a33636",
                        fontSize: "14px",
                        fontWeight: 800,
                      }}
                    >
                      {errorText}
                    </div>
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        </section>

        <section
          style={{
            ...panelStyle(),
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div>
              {tinyLabel("Facilities")}
              <h2
                style={{
                  margin: 0,
                  fontSize: "24px",
                  lineHeight: 1.1,
                  fontWeight: 900,
                }}
              >
                Filter before you choose
              </h2>
            </div>

            <div
              style={{
                color: "#60749a",
                fontSize: "14px",
                lineHeight: 1.5,
                maxWidth: "560px",
              }}
            >
              Fewer clicks, cleaner selection, better hotel matches.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "14px",
            }}
          >
            {FACILITY_OPTIONS.map((facility) => {
              const active = selectedFacilities.includes(facility);
              return (
                <button
                  key={facility}
                  type="button"
                  onClick={() => toggleFacility(facility)}
                  style={chipStyle(active)}
                >
                  {facility}
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.02fr 0.98fr",
            gap: "16px",
          }}
        >
          <div
            style={{
              ...panelStyle(),
              padding: "18px",
            }}
          >
            {tinyLabel("Selected hotel")}
            <h2
              style={{
                margin: 0,
                fontSize: "28px",
                lineHeight: 1.1,
                fontWeight: 900,
              }}
            >
              Your main booking card
            </h2>

            <div
              style={{
                marginTop: "14px",
                background: "#ffffff",
                borderRadius: "24px",
                border: "1px solid #dbe5f6",
                overflow: "hidden",
              }}
            >
              {!activeHotel ? (
                <div
                  style={{
                    padding: "28px",
                    color: "#5f7398",
                    fontSize: "16px",
                    lineHeight: 1.6,
                  }}
                >
                  Search first, then pick a hotel from the list. Your chosen stay will appear here with one clear reserve action.
                </div>
              ) : (
                <>
                  <div style={{ height: "250px", background: "#dde7f7" }}>
                    <img
                      src={
                        activeHotel.image ||
                        "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"
                      }
                      alt={activeHotel.name || "Hotel"}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>

                  <div style={{ padding: "18px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: "28px",
                            lineHeight: 1.1,
                            fontWeight: 900,
                            color: "#10224d",
                          }}
                        >
                          {activeHotel.name || "Selected Hotel"}
                        </div>

                        <div
                          style={{
                            marginTop: "8px",
                            color: "#63779c",
                            fontSize: "15px",
                            lineHeight: 1.5,
                          }}
                        >
                          {activeHotel.address ||
                            `${activeHotel.location || ""} ${activeHotel.city || ""} ${activeHotel.country || ""}`}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#eef4ff",
                          color: "#204ba9",
                          borderRadius: "16px",
                          padding: "12px 14px",
                          fontSize: "18px",
                          fontWeight: 900,
                          minWidth: "88px",
                          textAlign: "center",
                        }}
                      >
                        {activeHotel.rating || "4.0"}★
                      </div>
                    </div>

                    <p
                      style={{
                        margin: "14px 0 0",
                        color: "#5f7398",
                        fontSize: "15px",
                        lineHeight: 1.6,
                      }}
                    >
                      {activeHotel.summary ||
                        "A cleaner hotel choice with a direct route to final reservation."}
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: "10px",
                        marginTop: "16px",
                      }}
                    >
                      <div
                        style={{
                          background: "#f6f9fe",
                          borderRadius: "16px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ color: "#6b7ea4", fontSize: "12px", fontWeight: 800 }}>
                          Price
                        </div>
                        <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 900 }}>
                          {formatPrice(activeHotel.price)}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#f6f9fe",
                          borderRadius: "16px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ color: "#6b7ea4", fontSize: "12px", fontWeight: 800 }}>
                          Partner
                        </div>
                        <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 900 }}>
                          {activePartner}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#f6f9fe",
                          borderRadius: "16px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ color: "#6b7ea4", fontSize: "12px", fontWeight: 800 }}>
                          Rooms
                        </div>
                        <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 900 }}>
                          {search.rooms}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginTop: "16px",
                      }}
                    >
                      {hotelFacilities(activeHotel)
                        .slice(0, 6)
                        .map((facility) => (
                          <span
                            key={`${activeHotel.id || activeHotel.name}-${facility}`}
                            style={{
                              background: "#f2f6fc",
                              border: "1px solid #dbe5f6",
                              color: "#24488f",
                              borderRadius: "999px",
                              padding: "7px 10px",
                              fontSize: "13px",
                              fontWeight: 700,
                            }}
                          >
                            {facility}
                          </span>
                        ))}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                        marginTop: "18px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => safeOpenExternal(activeLink)}
                        style={{
                          ...primaryButton(),
                          height: "52px",
                        }}
                      >
                        Reserve Now
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = `mailto:${SUPPORT_EMAIL}`;
                        }}
                        style={{
                          ...secondaryButton(),
                          height: "52px",
                          background: "#eff4fd",
                        }}
                      >
                        Contact Support
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div
            style={{
              ...panelStyle(),
              padding: "18px",
            }}
          >
            {tinyLabel("Available hotels")}
            <h2
              style={{
                margin: 0,
                fontSize: "28px",
                lineHeight: 1.1,
                fontWeight: 900,
              }}
            >
              Compact result list
            </h2>

            <div
              style={{
                marginTop: "10px",
                color: "#60749a",
                fontSize: "15px",
                lineHeight: 1.55,
              }}
            >
              Fewer visual blocks, tighter spacing, and a faster selection flow.
            </div>

            <div
              style={{
                marginTop: "14px",
                height: "640px",
                overflowY: "auto",
                paddingRight: "4px",
                display: "grid",
                gap: "10px",
              }}
            >
              {!filteredHotels.length ? (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "20px",
                    border: "1px dashed #cad9f2",
                    padding: "22px",
                    color: "#5f7398",
                    fontSize: "15px",
                    lineHeight: 1.6,
                  }}
                >
                  No hotel results loaded yet. Press Search Hotels to bring in live stays.
                </div>
              ) : (
                filteredHotels.map((hotel, index) => {
                  const selected =
                    activeHotel?.id === hotel?.id || activeHotel?.name === hotel?.name;

                  return (
                    <button
                      key={hotel.id || `${hotel.name}-${index}`}
                      type="button"
                      onClick={() => setSelectedHotel(hotel)}
                      style={{
                        textAlign: "left",
                        borderRadius: "20px",
                        border: selected ? "2px solid #2f67e8" : "1px solid #dbe5f6",
                        background: selected ? "#eef4ff" : "#ffffff",
                        padding: "12px",
                        cursor: "pointer",
                        display: "grid",
                        gridTemplateColumns: "92px 1fr auto",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "92px",
                          height: "76px",
                          borderRadius: "14px",
                          overflow: "hidden",
                          background: "#dfe7f8",
                        }}
                      >
                        <img
                          src={
                            hotel.image ||
                            "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"
                          }
                          alt={hotel.name || "Hotel"}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "17px",
                            lineHeight: 1.2,
                            fontWeight: 900,
                            color: "#10224d",
                          }}
                        >
                          {hotel.name || "Hotel Option"}
                        </div>

                        <div
                          style={{
                            marginTop: "5px",
                            color: "#66799d",
                            fontSize: "13px",
                            lineHeight: 1.45,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {hotel.location ||
                            hotel.address ||
                            `${hotel.city || ""} ${hotel.country || ""}`}
                        </div>

                        <div
                          style={{
                            marginTop: "7px",
                            color: "#2f67e8",
                            fontSize: "12px",
                            fontWeight: 800,
                          }}
                        >
                          {detectAffiliatePartner(hotel)}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: "21px",
                            lineHeight: 1.1,
                            fontWeight: 900,
                            color: "#10224d",
                          }}
                        >
                          {formatPrice(hotel.price)}
                        </div>
                        <div
                          style={{
                            marginTop: "5px",
                            color: "#5f7398",
                            fontSize: "13px",
                            fontWeight: 800,
                          }}
                        >
                          {hotel.rating || "4.0"}★
                        </div>
                        <div
                          style={{
                            marginTop: "7px",
                            color: selected ? "#2f67e8" : "#17356f",
                            fontSize: "12px",
                            fontWeight: 900,
                          }}
                        >
                          {selected ? "Selected" : "Select"}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}