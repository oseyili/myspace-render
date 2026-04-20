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
    text: "Best for classic city stays, theatre breaks, museums, and central transport links.",
  },
  {
    city: "Dubai",
    text: "Best for luxury towers, shopping weekends, resort pools, and modern waterfront stays.",
  },
  {
    city: "Paris",
    text: "Best for romantic breaks, walkable neighbourhoods, boutique hotels, and culture-led trips.",
  },
  {
    city: "Lagos",
    text: "Best for business travel, city energy, fast-moving schedules, and family visits.",
  },
];

const FAQS = [
  {
    q: "How do I search for hotels?",
    a: "Enter destination details, dates, and guest count, then press Search Hotels to load live stays from your connected hotel backend.",
  },
  {
    q: "Can I narrow results by facilities?",
    a: "Yes. Select the facilities you want first, then search. Only matching stays remain in the available hotel list.",
  },
  {
    q: "How do I reserve a stay?",
    a: "Choose a hotel from the available list, review its details, then use the reserve button to continue on the booking partner page.",
  },
  {
    q: "Will I still see a large hotel database?",
    a: "Yes. This design keeps a large live hotel list while presenting it in a cleaner, more customer-friendly layout.",
  },
];

const PAGE_CONTENT = {
  guides: {
    title: "Explore Travel Guides",
    intro:
      "Quick destination guidance helps customers decide faster before they continue to a booking partner.",
    sections: GUIDE_ITEMS.map((item) => ({
      title: item.city,
      body: item.text,
    })),
  },
  faq: {
    title: "Frequently Asked Questions",
    intro:
      "These answers help customers understand the booking flow, hotel filters, and reserve process clearly.",
    sections: FAQS.map((item) => ({
      title: item.q,
      body: item.a,
    })),
  },
  terms: {
    title: "Terms and Conditions",
    intro:
      "Please review important details before continuing to a booking partner.",
    sections: [
      {
        title: "Booking information",
        body:
          "Prices, room types, taxes, and availability can change quickly. Final booking details are confirmed on the partner booking page.",
      },
      {
        title: "Guest details",
        body:
          "Please use correct traveller names, dates, and guest counts before reserving a stay to avoid booking errors.",
      },
      {
        title: "Third-party completion",
        body:
          "My Space Hotel helps customers search, compare, and select stays. Reservation completion happens on the selected booking partner site.",
      },
    ],
  },
  cancellation: {
    title: "Cancellation Policy",
    intro:
      "Cancellation rules vary depending on hotel, room type, supplier, and travel dates.",
    sections: [
      {
        title: "Before you reserve",
        body:
          "Always review the cancellation wording shown for the chosen stay before confirming payment.",
      },
      {
        title: "Flexible and non-refundable stays",
        body:
          "Some stays allow changes or refunds while others do not. Read the room conditions carefully on the partner page.",
      },
      {
        title: "Date-sensitive pricing",
        body:
          "Special offers may have stricter cancellation terms, especially around peak dates or limited-rate inventory.",
      },
    ],
  },
  protection: {
    title: "Booking Protection",
    intro:
      "Use these checks to stay accurate and confident before continuing to reserve.",
    sections: [
      {
        title: "Check dates and guests",
        body:
          "Make sure arrival, departure, guest count, and number of rooms are correct before clicking reserve.",
      },
      {
        title: "Review the selected stay",
        body:
          "Confirm hotel name, area, price, and facilities match your expectations before continuing.",
      },
      {
        title: "Use trusted partner links",
        body:
          "Reserve only through the booking button shown inside My Space Hotel so customers follow the correct partner route.",
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

function shellStyle() {
  return {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, #f6f9ff 0%, #eef3fa 48%, #e8eef7 100%)",
    padding: "20px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#102863",
  };
}

function glassCard() {
  return {
    background: "rgba(255,255,255,0.84)",
    borderRadius: "28px",
    border: "1px solid #d8e2f2",
    boxShadow: "0 12px 30px rgba(16,40,99,0.08)",
    backdropFilter: "blur(10px)",
  };
}

function darkCard() {
  return {
    background: "linear-gradient(180deg, #163b97 0%, #102d75 100%)",
    borderRadius: "30px",
    color: "#ffffff",
    boxShadow: "0 18px 40px rgba(16,45,117,0.26)",
  };
}

function inputStyle(dark = false) {
  return {
    width: "100%",
    height: "56px",
    borderRadius: "16px",
    border: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #d8e2f2",
    background: dark ? "rgba(255,255,255,0.14)" : "#f7faff",
    color: dark ? "#ffffff" : "#102863",
    padding: "0 16px",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box",
  };
}

function pillButton(background, color, border = "none") {
  return {
    border,
    borderRadius: "999px",
    background,
    color,
    padding: "13px 18px",
    fontWeight: 900,
    fontSize: "14px",
    cursor: "pointer",
  };
}

function sectionLabel(text, color = "#6078a6") {
  return (
    <div
      style={{
        fontSize: "12px",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color,
        fontWeight: 800,
        marginBottom: "8px",
      }}
    >
      {text}
    </div>
  );
}

function FullPageOverlay({ pageKey, onClose }) {
  if (!pageKey || !PAGE_CONTENT[pageKey]) return null;
  const page = PAGE_CONTENT[pageKey];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,24,63,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "min(920px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#f8fbff",
          borderRadius: "30px",
          border: "1px solid #d8e2f2",
          boxShadow: "0 20px 48px rgba(16,40,99,0.22)",
          padding: "26px",
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
            {sectionLabel("Information page")}
            <h2
              style={{
                margin: 0,
                fontSize: "34px",
                lineHeight: 1.08,
                fontWeight: 900,
                color: "#102863",
              }}
            >
              {page.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={pillButton("#ffffff", "#16397e", "1px solid #cad7ef")}
          >
            Close
          </button>
        </div>

        <p
          style={{
            margin: "16px 0 0",
            color: "#5d7298",
            fontSize: "17px",
            lineHeight: 1.6,
          }}
        >
          {page.intro}
        </p>

        <div
          style={{
            display: "grid",
            gap: "14px",
            marginTop: "20px",
          }}
        >
          {page.sections.map((section) => (
            <div
              key={section.title}
              style={{
                background: "#ffffff",
                borderRadius: "22px",
                border: "1px solid #dbe5f6",
                padding: "18px",
              }}
            >
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 900,
                  color: "#102863",
                }}
              >
                {section.title}
              </div>
              <div
                style={{
                  marginTop: "10px",
                  fontSize: "16px",
                  lineHeight: 1.6,
                  color: "#5b7196",
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
    "More choice, clearer comparisons, and a faster path to booking with trusted partners."
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
  const activeLink = activeHotel ? buildAffiliateLink(activeHotel) : null;

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
        page_size: "60",
        facilities: selectedFacilities.join(","),
      });

      const response = await fetch(`${API_BASE}/api/hotels?${params.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
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
            ? `Showing ${items.length} hotel options for ${destination}.`
            : `No hotels matched this search for ${destination}.`)
      );
    } catch (error) {
      console.error("Hotel search failed:", error);
      setHotels([]);
      setErrorText("Failed to fetch live hotel results. Please try again.");
      setStatusText("Search could not connect to live hotel results on this attempt.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={shellStyle()}>
      <FullPageOverlay pageKey={openPage} onClose={() => setOpenPage(null)} />

      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <section
          style={{
            ...glassCard(),
            padding: "18px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.12fr 0.88fr",
              gap: "16px",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                ...darkCard(),
                padding: "24px",
              }}
            >
              {sectionLabel("Worldwide Hotel Bookings", "#c6d6ff")}

              <h1
                style={{
                  margin: 0,
                  fontSize: "58px",
                  lineHeight: 0.96,
                  letterSpacing: "-0.05em",
                  fontWeight: 900,
                }}
              >
                My Space Hotel
              </h1>

              <p
                style={{
                  margin: "16px 0 0",
                  fontSize: "18px",
                  lineHeight: 1.55,
                  color: "#e5edff",
                  maxWidth: "760px",
                }}
              >
                Search a wider hotel database, compare faster, and move to booking with less clutter and a cleaner customer journey.
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
                  style={pillButton("#f0c84b", "#1f1c15")}
                >
                  Travel Guides
                </button>

                <button
                  type="button"
                  onClick={() => setOpenPage("faq")}
                  style={pillButton("rgba(255,255,255,0.12)", "#ffffff", "1px solid rgba(255,255,255,0.18)")}
                >
                  FAQ
                </button>

                <button
                  type="button"
                  onClick={() => setOpenPage("terms")}
                  style={pillButton("rgba(255,255,255,0.12)", "#ffffff", "1px solid rgba(255,255,255,0.18)")}
                >
                  Terms
                </button>

                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  style={{
                    ...pillButton("rgba(255,255,255,0.12)", "#ffffff", "1px solid rgba(255,255,255,0.18)"),
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Customer Support
                </a>
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
                  <div style={{ fontSize: "13px", color: "#d8e4ff" }}>Visible Choices</div>
                  <div style={{ fontSize: "24px", fontWeight: 900, marginTop: "8px" }}>
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
                  <div style={{ fontSize: "13px", color: "#d8e4ff" }}>Partner</div>
                  <div style={{ fontSize: "20px", fontWeight: 900, marginTop: "8px" }}>
                    {activePartner}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    borderRadius: "18px",
                    padding: "14px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#d8e4ff" }}>Selected</div>
                  <div style={{ fontSize: "24px", fontWeight: 900, marginTop: "8px" }}>
                    {activeHotel ? 1 : 0}
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                ...glassCard(),
                padding: "20px",
              }}
            >
              {sectionLabel("Search")}
              <h2
                style={{
                  margin: 0,
                  fontSize: "30px",
                  lineHeight: 1.1,
                  fontWeight: 900,
                }}
              >
                Search hotels
              </h2>

              <form onSubmit={handleSearch} style={{ marginTop: "16px" }}>
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

                  <input
                    value={search.location}
                    onChange={(e) => updateSearch("location", e.target.value)}
                    placeholder="Area or location"
                    style={inputStyle()}
                  />

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
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
                    <input
                      type="number"
                      min="1"
                      value={search.guests}
                      onChange={(e) => updateSearch("guests", e.target.value)}
                      style={inputStyle()}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 160px",
                      gap: "10px",
                    }}
                  >
                    <input
                      type="number"
                      min="1"
                      value={search.rooms}
                      onChange={(e) => updateSearch("rooms", e.target.value)}
                      style={inputStyle()}
                    />

                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        height: "56px",
                        borderRadius: "16px",
                        border: 0,
                        background: "linear-gradient(90deg, #2d67e5, #2ab7d8)",
                        color: "#ffffff",
                        fontSize: "15px",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {loading ? "Searching..." : "Search Hotels"}
                    </button>
                  </div>

                  <div
                    style={{
                      background: "#f6f9ff",
                      borderRadius: "16px",
                      border: "1px solid #dbe5f6",
                      padding: "12px 14px",
                      color: "#5d7298",
                      fontSize: "14px",
                      lineHeight: 1.45,
                    }}
                  >
                    {statusText}
                  </div>

                  {errorText ? (
                    <div
                      style={{
                        background: "#fff2f2",
                        borderRadius: "16px",
                        border: "1px solid #f1cccc",
                        padding: "12px 14px",
                        color: "#b43d3d",
                        fontSize: "14px",
                        fontWeight: 700,
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
            ...glassCard(),
            padding: "18px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: "16px",
              alignItems: "center",
            }}
          >
            <div>
              {sectionLabel("Choose what matters most")}
              <h2
                style={{
                  margin: 0,
                  fontSize: "28px",
                  lineHeight: 1.15,
                  fontWeight: 900,
                }}
              >
                Start with the features that matter to you
              </h2>
            </div>

            <div
              style={{
                color: "#65799e",
                fontSize: "15px",
                lineHeight: 1.45,
                maxWidth: "460px",
                textAlign: "right",
              }}
            >
              Keep the large hotel database, but narrow it quickly with simple facility filters.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "16px",
            }}
          >
            {FACILITY_OPTIONS.map((facility) => {
              const active = selectedFacilities.includes(facility);

              return (
                <button
                  key={facility}
                  type="button"
                  onClick={() => toggleFacility(facility)}
                  style={{
                    minHeight: "44px",
                    borderRadius: "999px",
                    border: active ? "2px solid #2f67e8" : "1px solid #d2ddef",
                    background: active ? "#e8f0ff" : "#ffffff",
                    color: "#17356f",
                    fontSize: "14px",
                    fontWeight: 800,
                    cursor: "pointer",
                    padding: "0 14px",
                  }}
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
            gridTemplateColumns: "1.03fr 0.97fr",
            gap: "14px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              ...glassCard(),
              padding: "20px",
            }}
          >
            {sectionLabel("Selected hotel")}
            <h2
              style={{
                margin: 0,
                fontSize: "30px",
                lineHeight: 1.1,
                fontWeight: 900,
              }}
            >
              Main booking view
            </h2>

            <div
              style={{
                marginTop: "16px",
                background: "#ffffff",
                borderRadius: "24px",
                border: "1px solid #dbe5f6",
                overflow: "hidden",
              }}
            >
              {!activeHotel ? (
                <div
                  style={{
                    padding: "26px",
                    color: "#5b7196",
                    fontSize: "16px",
                    lineHeight: 1.6,
                  }}
                >
                  Search first, then choose a stay from the hotel list. Your selected hotel will appear here with one clear reserve action.
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
                        alignItems: "start",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "28px",
                            lineHeight: 1.1,
                            fontWeight: 900,
                          }}
                        >
                          {activeHotel.name}
                        </div>
                        <div
                          style={{
                            marginTop: "8px",
                            color: "#65789a",
                            fontSize: "15px",
                          }}
                        >
                          {activeHotel.address ||
                            `${activeHotel.location || ""} ${activeHotel.city || ""} ${activeHotel.country || ""}`}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#edf3ff",
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
                        color: "#5b7196",
                        fontSize: "15px",
                        lineHeight: 1.6,
                      }}
                    >
                      {activeHotel.summary ||
                        "Comfortable hotel option with practical facilities and a clean route to final reservation."}
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
                          background: "#eef4ff",
                          borderRadius: "16px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ color: "#65789a", fontSize: "12px", fontWeight: 800 }}>
                          Price
                        </div>
                        <div style={{ marginTop: "8px", fontSize: "24px", fontWeight: 900 }}>
                          {formatPrice(activeHotel.price)}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#eef4ff",
                          borderRadius: "16px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ color: "#65789a", fontSize: "12px", fontWeight: 800 }}>
                          Partner
                        </div>
                        <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 900 }}>
                          {activePartner}
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#eef4ff",
                          borderRadius: "16px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ color: "#65789a", fontSize: "12px", fontWeight: 800 }}>
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
                        flexWrap: "wrap",
                        gap: "8px",
                        marginTop: "16px",
                      }}
                    >
                      {hotelFacilities(activeHotel).slice(0, 6).map((facility) => (
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
                      <a
                        href={activeLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          textDecoration: "none",
                          borderRadius: "16px",
                          background: "linear-gradient(90deg, #2d67e5, #2ab7d8)",
                          color: "#ffffff",
                          padding: "14px 18px",
                          fontWeight: 900,
                          fontSize: "15px",
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        Reserve This Stay
                      </a>

                      <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        style={{
                          textDecoration: "none",
                          borderRadius: "16px",
                          background: "#eff4fd",
                          color: "#143882",
                          padding: "14px 18px",
                          fontWeight: 900,
                          fontSize: "15px",
                          display: "inline-flex",
                          alignItems: "center",
                          border: "1px solid #d6e0f2",
                        }}
                      >
                        Affiliate Support
                      </a>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div
            style={{
              ...glassCard(),
              padding: "20px",
            }}
          >
            {sectionLabel("Available hotels")}
            <h2
              style={{
                margin: 0,
                fontSize: "30px",
                lineHeight: 1.1,
                fontWeight: 900,
              }}
            >
              Large live hotel list
            </h2>

            <div
              style={{
                marginTop: "12px",
                color: "#5d7298",
                fontSize: "15px",
                lineHeight: 1.55,
              }}
            >
              The large hotel database stays in place here, but the layout is cleaner and easier for customers to use.
            </div>

            <div
              style={{
                marginTop: "16px",
                height: "760px",
                overflowY: "auto",
                paddingRight: "6px",
                display: "grid",
                gap: "10px",
              }}
            >
              {!filteredHotels.length ? (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "22px",
                    border: "1px dashed #cad9f2",
                    padding: "24px",
                    color: "#5a7196",
                    fontSize: "16px",
                    lineHeight: 1.6,
                  }}
                >
                  No hotel results loaded yet. Use Search Hotels to bring in live stays, then choose one from the list.
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
                        gridTemplateColumns: "102px 1fr auto",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "102px",
                          height: "82px",
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

                      <div>
                        <div
                          style={{
                            fontSize: "18px",
                            lineHeight: 1.2,
                            fontWeight: 900,
                            color: "#102863",
                          }}
                        >
                          {hotel.name || "Hotel Option"}
                        </div>

                        <div
                          style={{
                            marginTop: "6px",
                            color: "#65789a",
                            fontSize: "14px",
                            lineHeight: 1.45,
                          }}
                        >
                          {hotel.location ||
                            hotel.address ||
                            `${hotel.city || ""} ${hotel.country || ""}`}
                        </div>

                        <div
                          style={{
                            marginTop: "8px",
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
                            fontSize: "22px",
                            lineHeight: 1.1,
                            fontWeight: 900,
                            color: "#102863",
                          }}
                        >
                          {formatPrice(hotel.price)}
                        </div>
                        <div
                          style={{
                            marginTop: "6px",
                            color: "#5b7196",
                            fontSize: "14px",
                            fontWeight: 800,
                          }}
                        >
                          {hotel.rating || "4.0"}★
                        </div>
                        <div
                          style={{
                            marginTop: "8px",
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