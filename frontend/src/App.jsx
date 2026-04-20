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
    q: "Will I see too many hotel cards?",
    a: "No. This design keeps things cleaner by showing one selected hotel panel and one scrollable available-stays panel.",
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

function pageButtonStyle(background, color, bordered = false) {
  return {
    border: bordered ? "2px solid #1d2a44" : 0,
    borderRadius: "18px",
    background,
    color,
    padding: "15px 18px",
    fontWeight: 900,
    fontSize: "15px",
    cursor: "pointer",
    boxShadow: bordered ? "none" : "0 8px 16px rgba(16,40,99,0.10)",
  };
}

function cardSurface() {
  return {
    background: "#f8fbff",
    borderRadius: "28px",
    border: "1px solid #d8e2f2",
    boxShadow: "0 10px 22px rgba(16,40,99,0.08)",
  };
}

function inputStyle() {
  return {
    width: "100%",
    height: "58px",
    borderRadius: "18px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(89,112,196,0.34)",
    color: "#ffffff",
    padding: "0 16px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  };
}

function sectionLabel(text) {
  return (
    <div
      style={{
        fontSize: "13px",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "#6078a6",
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
          width: "min(980px, 100%)",
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
            style={{
              border: "1px solid #cad7ef",
              background: "#ffffff",
              color: "#16397e",
              borderRadius: "16px",
              padding: "12px 16px",
              fontWeight: 900,
              cursor: "pointer",
            }}
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
    <div
      style={{
        minHeight: "100vh",
        background: "#eef3fa",
        padding: "18px",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: "#102863",
      }}
    >
      <FullPageOverlay pageKey={openPage} onClose={() => setOpenPage(null)} />

      <div style={{ maxWidth: "1540px", margin: "0 auto" }}>
        <section
          style={{
            ...cardSurface(),
            padding: "22px 22px 18px",
            marginBottom: "14px",
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: "20px",
            alignItems: "center",
          }}
        >
          <div>
            {sectionLabel("Worldwide Hotel Bookings")}

            <h1
              style={{
                margin: 0,
                fontSize: "62px",
                lineHeight: 1,
                letterSpacing: "-0.04em",
                fontWeight: 900,
              }}
            >
              My Space Hotel
            </h1>

            <p
              style={{
                margin: "18px 0 0",
                fontSize: "18px",
                lineHeight: 1.55,
                color: "#5d7298",
                maxWidth: "900px",
              }}
            >
              Discover outstanding places to stay, enjoy a smoother search, and book
              with confidence through trusted partners.
            </p>

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
                onClick={() => setOpenPage("guides")}
                style={pageButtonStyle("#f0c84b", "#1f1c15")}
              >
                Explore Travel Guides
              </button>

              <button
                type="button"
                onClick={() => setOpenPage("faq")}
                style={pageButtonStyle("#dce8fb", "#16397e", true)}
              >
                Frequently Asked Questions
              </button>

              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                style={{
                  ...pageButtonStyle("#2f67e8", "#ffffff"),
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Customer Support
              </a>
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(180deg, #2149b8, #183a97)",
              color: "#ffffff",
              borderRadius: "24px",
              padding: "20px",
              boxShadow: "0 12px 24px rgba(24,58,151,0.28)",
            }}
          >
            <div
              style={{
                fontSize: "62px",
                lineHeight: 1,
                fontWeight: 900,
                letterSpacing: "-0.03em",
              }}
            >
              {filteredHotels.length}
            </div>
            <div style={{ marginTop: "10px", fontSize: "16px", lineHeight: 1.4 }}>
              total hotel choices shown in your current search results
            </div>
          </div>
        </section>

        <section
          style={{
            ...cardSurface(),
            padding: "18px 16px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr",
              gap: "18px",
              alignItems: "center",
            }}
          >
            <div>
              {sectionLabel("Choose what matters most")}
              <h2
                style={{
                  margin: 0,
                  fontSize: "30px",
                  lineHeight: 1.15,
                  fontWeight: 900,
                }}
              >
                Start with the features that matter to you most
              </h2>
            </div>

            <div
              style={{
                color: "#65799e",
                fontSize: "16px",
                lineHeight: 1.45,
              }}
            >
              Pick your preferred facilities first, then search for stays that match your trip.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "10px",
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
                    minHeight: "46px",
                    borderRadius: "16px",
                    border: active ? "2px solid #2f67e8" : "1px solid #d2ddef",
                    background: active ? "#e8f0ff" : "#f1f6fd",
                    color: "#17356f",
                    fontSize: "15px",
                    fontWeight: 800,
                    cursor: "pointer",
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
            gridTemplateColumns: "1.04fr 0.96fr",
            gap: "14px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              background: "#142f83",
              borderRadius: "30px",
              padding: "20px",
              color: "#ffffff",
              boxShadow: "0 14px 28px rgba(20,47,131,0.28)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 160px",
                gap: "14px",
                alignItems: "start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "13px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#b7cbff",
                    fontWeight: 800,
                    marginBottom: "10px",
                  }}
                >
                  Find your stay
                </div>

                <h2
                  style={{
                    margin: 0,
                    fontSize: "62px",
                    lineHeight: 0.94,
                    letterSpacing: "-0.05em",
                    fontWeight: 900,
                    maxWidth: "690px",
                  }}
                >
                  Find a stay worth coming back to
                </h2>

                <p
                  style={{
                    margin: "18px 0 0",
                    color: "#e5edff",
                    fontSize: "17px",
                    lineHeight: 1.5,
                    maxWidth: "660px",
                  }}
                >
                  Cleaner selection, less clutter, and a simpler path to reservation.
                </p>
              </div>

              <div
                style={{
                  background: "rgba(90,118,202,0.34)",
                  borderRadius: "22px",
                  padding: "16px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ fontSize: "52px", fontWeight: 900, lineHeight: 1 }}>
                  {activeHotel ? 1 : 0}
                </div>
                <div style={{ marginTop: "4px", color: "#dce6ff", fontSize: "15px" }}>
                  stay selected
                </div>
              </div>
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
                  background: "rgba(90,118,202,0.30)",
                  borderRadius: "18px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: "14px", color: "#d8e4ff" }}>Visible Choices</div>
                <div style={{ fontSize: "20px", fontWeight: 900, marginTop: "8px" }}>
                  {filteredHotels.length}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(90,118,202,0.30)",
                  borderRadius: "18px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: "14px", color: "#d8e4ff" }}>Partner</div>
                <div style={{ fontSize: "20px", fontWeight: 900, marginTop: "8px" }}>
                  {activePartner}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(90,118,202,0.30)",
                  borderRadius: "18px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: "14px", color: "#d8e4ff" }}>Reserve Status</div>
                <div style={{ fontSize: "20px", fontWeight: 900, marginTop: "8px" }}>
                  {activeHotel ? "Ready" : "Waiting"}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#142f83",
              borderRadius: "30px",
              padding: "20px",
              color: "#ffffff",
              boxShadow: "0 14px 28px rgba(20,47,131,0.28)",
            }}
          >
            <div
              style={{
                fontSize: "13px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#b7cbff",
                fontWeight: 800,
                marginBottom: "10px",
              }}
            >
              Search
            </div>

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
                    gridTemplateColumns: "1fr 170px",
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
                      height: "58px",
                      borderRadius: "18px",
                      border: 0,
                      background: "linear-gradient(90deg, #2d67e5, #2ab7d8)",
                      color: "#ffffff",
                      fontSize: "16px",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    {loading ? "Searching..." : "Search Hotels"}
                  </button>
                </div>

                <div
                  style={{
                    background: "rgba(90,118,202,0.30)",
                    borderRadius: "16px",
                    padding: "12px 14px",
                    color: "#edf3ff",
                    fontSize: "14px",
                    lineHeight: 1.45,
                  }}
                >
                  {statusText}
                </div>

                {errorText ? (
                  <div
                    style={{
                      background: "rgba(255,255,255,0.12)",
                      borderRadius: "16px",
                      padding: "12px 14px",
                      color: "#ffd2d2",
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
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "12px",
            marginBottom: "14px",
          }}
        >
          <button
            type="button"
            onClick={() => setOpenPage("terms")}
            style={{
              textAlign: "left",
              border: 0,
              borderRadius: "24px",
              padding: "18px 16px",
              background: "#f0cc58",
              color: "#2a2310",
              cursor: "pointer",
              boxShadow: "0 8px 16px rgba(16,40,99,0.08)",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 900 }}>Terms and Conditions</div>
            <div style={{ marginTop: "10px", fontSize: "15px", lineHeight: 1.45 }}>
              Review important booking details before you continue.
            </div>
            <div style={{ marginTop: "12px", fontSize: "15px", fontWeight: 900 }}>
              Open page
            </div>
          </button>

          <button
            type="button"
            onClick={() => setOpenPage("cancellation")}
            style={{
              textAlign: "left",
              border: 0,
              borderRadius: "24px",
              padding: "18px 16px",
              background: "#a9c9ff",
              color: "#17356f",
              cursor: "pointer",
              boxShadow: "0 8px 16px rgba(16,40,99,0.08)",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 900 }}>Cancellation Policy</div>
            <div style={{ marginTop: "10px", fontSize: "15px", lineHeight: 1.45 }}>
              Check the cancellation rules for your chosen stay.
            </div>
            <div style={{ marginTop: "12px", fontSize: "15px", fontWeight: 900 }}>
              Open page
            </div>
          </button>

          <button
            type="button"
            onClick={() => setOpenPage("protection")}
            style={{
              textAlign: "left",
              border: 0,
              borderRadius: "24px",
              padding: "18px 16px",
              background: "#9ad9a7",
              color: "#163a1f",
              cursor: "pointer",
              boxShadow: "0 8px 16px rgba(16,40,99,0.08)",
            }}
          >
            <div style={{ fontSize: "16px", fontWeight: 900 }}>Booking Protection</div>
            <div style={{ marginTop: "10px", fontSize: "15px", lineHeight: 1.45 }}>
              Use correct guest details and book with confidence.
            </div>
            <div style={{ marginTop: "12px", fontSize: "15px", fontWeight: 900 }}>
              Open page
            </div>
          </button>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.05fr 0.95fr",
            gap: "14px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              ...cardSurface(),
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
              One clean booking box
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
                  Search first, then choose a stay from the available hotel list. The selected hotel appears here with one clear reserve flow.
                </div>
              ) : (
                <>
                  <div style={{ height: "260px", background: "#dde7f7" }}>
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
                          key={`${activeHotel.id}-${facility}`}
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
              ...cardSurface(),
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
              One scrollable stay list
            </h2>

            <div
              style={{
                marginTop: "12px",
                color: "#5d7298",
                fontSize: "15px",
                lineHeight: 1.55,
              }}
            >
              This keeps the design cleaner for customers: one main booking box and one compact scrollable list for hotel selection.
            </div>

            <div
              style={{
                marginTop: "16px",
                height: "760px",
                overflowY: "auto",
                paddingRight: "6px",
                display: "grid",
                gap: "12px",
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
                        borderRadius: "22px",
                        border: selected ? "2px solid #2f67e8" : "1px solid #dbe5f6",
                        background: selected ? "#eef4ff" : "#ffffff",
                        padding: "14px",
                        cursor: "pointer",
                        display: "grid",
                        gridTemplateColumns: "116px 1fr auto",
                        gap: "14px",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          width: "116px",
                          height: "92px",
                          borderRadius: "16px",
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
                            fontSize: "19px",
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
                            fontSize: "13px",
                            fontWeight: 800,
                          }}
                        >
                          {detectAffiliatePartner(hotel)}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: "24px",
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
                            fontSize: "13px",
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

        <section
          style={{
            ...cardSurface(),
            padding: "20px",
          }}
        >
          {sectionLabel("Frequently asked questions")}
          <h2
            style={{
              margin: 0,
              fontSize: "30px",
              lineHeight: 1.1,
              fontWeight: 900,
            }}
          >
            Helpful answers before customers continue
          </h2>

          <div
            style={{
              display: "grid",
              gap: "12px",
              marginTop: "16px",
            }}
          >
            {FAQS.map((item) => (
              <div
                key={item.q}
                style={{
                  background: "#ffffff",
                  borderRadius: "18px",
                  border: "1px solid #dbe5f6",
                  padding: "18px",
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 900 }}>{item.q}</div>
                <div
                  style={{
                    marginTop: "10px",
                    color: "#5b7196",
                    fontSize: "15px",
                    lineHeight: 1.55,
                  }}
                >
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}