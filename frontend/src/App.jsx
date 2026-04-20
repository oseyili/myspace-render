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

const INFO_PAGES = {
  terms: {
    title: "Terms and Conditions",
    text: "Review important booking details before you continue.",
    bg: "#f0cc58",
    fg: "#2a2310",
  },
  cancellation: {
    title: "Cancellation Policy",
    text: "Check the cancellation rules for your chosen stay.",
    bg: "#a9c9ff",
    fg: "#17356f",
  },
  protection: {
    title: "Booking Protection",
    text: "Use correct guest details and book with confidence.",
    bg: "#9ad9a7",
    fg: "#163a1f",
  },
};

const FAQS = [
  {
    q: "How do I search for hotels?",
    a: "Enter your destination, dates, and guest details, then press Search Hotels to load available stays.",
  },
  {
    q: "Can I narrow results by facilities?",
    a: "Yes. Choose the facilities you care about first to focus on hotel options that match your trip.",
  },
  {
    q: "Do prices and availability change?",
    a: "Yes. Prices and hotel availability can change quickly, so always review details before booking.",
  },
];

function inputStyle() {
  return {
    width: "100%",
    height: "56px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(89,112,196,0.34)",
    color: "#ffffff",
    padding: "0 16px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  };
}

function normaliseHotels(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.hotels)) return payload.hotels;
  if (Array.isArray(payload.results)) return payload.results;
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

function buildAffiliateLink(hotel) {
  if (hotel?.affiliate_url) return hotel.affiliate_url;
  if (hotel?.booking_url) return hotel.booking_url;
  if (hotel?.url) return hotel.url;

  const city = encodeURIComponent(hotel?.city || "London");
  const hotelName = encodeURIComponent(hotel?.name || "Hotel");
  return `https://www.booking.com/searchresults.html?ss=${hotelName}%20${city}`;
}

function formatPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `£${n}`;
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
  const [activeInfoPage, setActiveInfoPage] = useState(null);

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
      <div style={{ maxWidth: "1540px", margin: "0 auto" }}>
        <section
          style={{
            background: "#f8fbff",
            borderRadius: "28px",
            border: "1px solid #d8e2f2",
            padding: "22px 22px 18px",
            boxShadow: "0 8px 22px rgba(16,40,99,0.08)",
            marginBottom: "14px",
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: "20px",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "13px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#6078a6",
                fontWeight: 800,
                marginBottom: "10px",
              }}
            >
              Worldwide Hotel Bookings
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "58px",
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
                lineHeight: 1.5,
                color: "#5d7298",
                maxWidth: "880px",
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
                onClick={() =>
                  setStatusText(
                    "Travel guides help customers compare destinations, areas, and hotel styles before they book."
                  )
                }
                style={{
                  border: 0,
                  borderRadius: "16px",
                  background: "#f0c84b",
                  color: "#1f1c15",
                  padding: "14px 18px",
                  fontWeight: 900,
                  fontSize: "15px",
                  cursor: "pointer",
                }}
              >
                Explore Travel Guides
              </button>

              <button
                type="button"
                onClick={() =>
                  setStatusText(
                    "Frequently asked questions explain booking, facilities, pricing, and stay details clearly."
                  )
                }
                style={{
                  border: "1px solid #1d2a44",
                  borderRadius: "16px",
                  background: "#dce8fb",
                  color: "#16397e",
                  padding: "14px 18px",
                  fontWeight: 900,
                  fontSize: "15px",
                  cursor: "pointer",
                }}
              >
                Frequently Asked Questions
              </button>

              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                style={{
                  textDecoration: "none",
                  borderRadius: "16px",
                  background: "#2f67e8",
                  color: "#ffffff",
                  padding: "14px 18px",
                  fontWeight: 900,
                  fontSize: "15px",
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
              padding: "20px 20px",
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
              {hotels.length}
            </div>
            <div style={{ marginTop: "10px", fontSize: "16px", lineHeight: 1.4 }}>
              total hotel choices found in your connected search database
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#f8fbff",
            borderRadius: "28px",
            border: "1px solid #d8e2f2",
            padding: "18px 16px",
            boxShadow: "0 8px 22px rgba(16,40,99,0.08)",
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
                Choose what matters most
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize: "29px",
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
            gridTemplateColumns: "1.08fr 0.92fr",
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
                  Search more hotel options, compare with ease, and choose the stay that
                  feels right for your next trip.
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
                  {selectedHotel ? 1 : 0}
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
                <div style={{ fontSize: "14px", color: "#d8e4ff" }}>Loaded Results</div>
                <div style={{ fontSize: "18px", fontWeight: 900, marginTop: "8px" }}>
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
                <div style={{ fontSize: "14px", color: "#d8e4ff" }}>Total Found</div>
                <div style={{ fontSize: "18px", fontWeight: 900, marginTop: "8px" }}>
                  {hotels.length}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(90,118,202,0.30)",
                  borderRadius: "18px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: "14px", color: "#d8e4ff" }}>Selected Hotel</div>
                <div style={{ fontSize: "18px", fontWeight: 900, marginTop: "8px" }}>
                  {selectedHotel ? selectedHotel.name : "None"}
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
                fontSize: "29px",
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
          {Object.entries(INFO_PAGES).map(([key, page]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveInfoPage(key)}
              style={{
                textAlign: "left",
                border: 0,
                borderRadius: "24px",
                padding: "18px 16px",
                background: page.bg,
                color: page.fg,
                cursor: "pointer",
                boxShadow: "0 8px 16px rgba(16,40,99,0.08)",
              }}
            >
              <div style={{ fontSize: "16px", fontWeight: 900 }}>{page.title}</div>
              <div style={{ marginTop: "10px", fontSize: "15px", lineHeight: 1.45 }}>
                {page.text}
              </div>
              <div style={{ marginTop: "12px", fontSize: "15px", fontWeight: 900 }}>
                Open page
              </div>
            </button>
          ))}
        </section>

        {activeInfoPage ? (
          <section
            style={{
              background: "#f8fbff",
              borderRadius: "28px",
              border: "1px solid #d8e2f2",
              padding: "20px",
              boxShadow: "0 8px 22px rgba(16,40,99,0.08)",
              marginBottom: "14px",
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
              <h2 style={{ margin: 0, fontSize: "28px", fontWeight: 900 }}>
                {INFO_PAGES[activeInfoPage].title}
              </h2>

              <button
                type="button"
                onClick={() => setActiveInfoPage(null)}
                style={{
                  border: "1px solid #c8d6f2",
                  background: "#ffffff",
                  borderRadius: "14px",
                  padding: "10px 14px",
                  fontWeight: 800,
                  color: "#16397e",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div
              style={{
                marginTop: "14px",
                color: "#5a7196",
                fontSize: "16px",
                lineHeight: 1.6,
              }}
            >
              {activeInfoPage === "terms" && (
                <>
                  Booking details, guest names, dates, and room choices should always be
                  reviewed carefully before you continue to a booking partner. Prices and
                  availability can change, and final booking terms are confirmed on the
                  partner booking page.
                </>
              )}
              {activeInfoPage === "cancellation" && (
                <>
                  Cancellation rules vary by hotel, date, and room type. Always review the
                  cancellation details shown for the hotel you choose before making payment.
                </>
              )}
              {activeInfoPage === "protection" && (
                <>
                  Use correct traveller details, confirm your dates carefully, and review the
                  selected stay before you continue. This helps avoid booking mistakes and
                  improves the booking experience.
                </>
              )}
            </div>
          </section>
        ) : null}

        <section
          style={{
            background: "#f8fbff",
            borderRadius: "28px",
            border: "1px solid #d8e2f2",
            padding: "20px",
            boxShadow: "0 8px 22px rgba(16,40,99,0.08)",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px",
              alignItems: "end",
              marginBottom: "16px",
            }}
          >
            <div>
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
                Property overview
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize: "29px",
                  lineHeight: 1.1,
                  fontWeight: 900,
                }}
              >
                Browse hotel options loaded from your live search
              </h2>
            </div>

            <div
              style={{
                textAlign: "right",
                color: "#64789d",
                fontSize: "15px",
                fontWeight: 800,
              }}
            >
              {filteredHotels.length} loaded / {hotels.length} found
            </div>
          </div>

          {!filteredHotels.length ? (
            <div
              style={{
                background: "#f1f6fd",
                border: "1px dashed #cad9f2",
                borderRadius: "22px",
                padding: "26px",
                color: "#5a7196",
                fontSize: "17px",
                fontWeight: 700,
                textAlign: "center",
              }}
            >
              No hotel results loaded yet. Use Search Hotels to bring in live stays from your connected backend.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "14px",
              }}
            >
              {filteredHotels.map((hotel, index) => {
                const facilities = hotelFacilities(hotel);
                const selected =
                  selectedHotel?.id === hotel?.id || selectedHotel?.name === hotel?.name;

                return (
                  <article
                    key={hotel.id || `${hotel.name}-${index}`}
                    style={{
                      background: "#ffffff",
                      borderRadius: "24px",
                      border: selected ? "2px solid #2f67e8" : "1px solid #dbe5f6",
                      overflow: "hidden",
                      boxShadow: "0 10px 18px rgba(16,40,99,0.06)",
                    }}
                  >
                    <div style={{ height: "230px", background: "#dfe7f8" }}>
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

                    <div style={{ padding: "18px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                          alignItems: "start",
                        }}
                      >
                        <div>
                          <h3
                            style={{
                              margin: 0,
                              fontSize: "24px",
                              lineHeight: 1.15,
                              fontWeight: 900,
                            }}
                          >
                            {hotel.name || "Hotel Option"}
                          </h3>

                          <div
                            style={{
                              marginTop: "8px",
                              color: "#677c9f",
                              fontSize: "15px",
                            }}
                          >
                            {hotel.location ||
                              hotel.address ||
                              `${hotel.city || ""} ${hotel.country || ""}`}
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#edf3ff",
                            color: "#204ba9",
                            borderRadius: "14px",
                            padding: "10px 12px",
                            fontSize: "16px",
                            fontWeight: 900,
                            minWidth: "76px",
                            textAlign: "center",
                          }}
                        >
                          {hotel.rating || "4.0"}★
                        </div>
                      </div>

                      <p
                        style={{
                          margin: "14px 0 0",
                          color: "#5b7196",
                          fontSize: "15px",
                          lineHeight: 1.55,
                          minHeight: "70px",
                        }}
                      >
                        {hotel.summary ||
                          "Comfortable hotel options with flexible stay details and convenient access to your destination."}
                      </p>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                          marginTop: "12px",
                          minHeight: "34px",
                        }}
                      >
                        {facilities.slice(0, 4).map((facility) => (
                          <span
                            key={`${hotel.id}-${facility}`}
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
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "center",
                          marginTop: "18px",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              color: "#64789d",
                              fontSize: "13px",
                              fontWeight: 800,
                            }}
                          >
                            from
                          </div>
                          <div
                            style={{
                              fontSize: "30px",
                              lineHeight: 1.1,
                              fontWeight: 900,
                            }}
                          >
                            {formatPrice(hotel.price)}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => setSelectedHotel(hotel)}
                            style={{
                              borderRadius: "14px",
                              border: selected ? "2px solid #2f67e8" : "1px solid #c9d7f2",
                              background: selected ? "#edf3ff" : "#ffffff",
                              color: "#1c448d",
                              fontWeight: 800,
                              padding: "12px 14px",
                              cursor: "pointer",
                            }}
                          >
                            {selected ? "Selected" : "Select"}
                          </button>

                          <a
                            href={buildAffiliateLink(hotel)}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              textDecoration: "none",
                              borderRadius: "14px",
                              background: "linear-gradient(90deg, #2d67e5, #2ab7d8)",
                              color: "#ffffff",
                              fontWeight: 900,
                              padding: "12px 16px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            Reserve
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section
          style={{
            background: "#f8fbff",
            borderRadius: "28px",
            border: "1px solid #d8e2f2",
            padding: "20px",
            boxShadow: "0 8px 22px rgba(16,40,99,0.08)",
          }}
        >
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
            Frequently asked questions
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: "29px",
              lineHeight: 1.1,
              fontWeight: 900,
            }}
          >
            Helpful answers for customers before they continue
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