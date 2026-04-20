import React, { useMemo, useState } from "react";

const SUPPORT_EMAIL = "reservations@myspace-hotel.com";
const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";

const FACILITIES = [
  "Free Wi-Fi",
  "Breakfast",
  "Parking",
  "Pool",
  "Gym",
  "Airport shuttle",
  "Family friendly",
  "Pet friendly",
];

const FAQS = [
  {
    q: "How do I book a hotel?",
    a: "Search by destination and dates, review the available stays, then continue with the hotel option that suits you best.",
  },
  {
    q: "Are prices shown in real time?",
    a: "Prices and availability can change quickly. Always review the latest details on the booking page before you complete a reservation.",
  },
  {
    q: "Can I filter hotels by facilities?",
    a: "Yes. Choose the facilities that matter most to you before searching to narrow down the most suitable hotel options.",
  },
];

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

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildAffiliateLink(hotel) {
  if (hotel?.affiliate_url) return hotel.affiliate_url;
  if (hotel?.booking_url) return hotel.booking_url;
  if (hotel?.url) return hotel.url;

  const city = encodeURIComponent(hotel?.city || "London");
  const name = encodeURIComponent(hotel?.name || "Hotel");
  return `https://www.booking.com/searchresults.html?ss=${city}&label=${name}`;
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
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState("Ready to search for live hotel results.");
  const [errorText, setErrorText] = useState("");
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const totalFound = hotels.length;
  const loadedResults = hotels.length;

  const visibleHotels = useMemo(() => {
    if (!selectedFacilities.length) return hotels;

    return hotels.filter((hotel) => {
      const facilityText = Array.isArray(hotel.facilities)
        ? hotel.facilities.join(" ").toLowerCase()
        : String(hotel.facilities || "").toLowerCase();

      return selectedFacilities.every((facility) =>
        facilityText.includes(facility.toLowerCase())
      );
    });
  }, [hotels, selectedFacilities]);

  function toggleFacility(facility) {
    setSelectedFacilities((current) =>
      current.includes(facility)
        ? current.filter((item) => item !== facility)
        : [...current, facility]
    );
  }

  function updateField(field, value) {
    setSearch((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSearch(event) {
    event.preventDefault();

    setLoading(true);
    setErrorText("");
    setStatusText("Searching live hotel availability...");
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams({
        city: search.destination || search.city || "London",
        country: search.country || "United Kingdom",
        location: search.location || "",
        checkIn: search.checkIn,
        checkOut: search.checkOut,
        guests: String(search.guests || "1"),
        rooms: String(search.rooms || "1"),
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
        items.length
          ? `Showing ${items.length} live hotel results for ${search.destination || search.city || "your destination"}.`
          : "No hotel results matched this search. Try a different destination or broader filters."
      );
    } catch (error) {
      console.error("Hotel search failed:", error);
      setHotels([]);
      setErrorText(
        "Live hotel search could not connect just now. Please try again in a moment."
      );
      setStatusText("Search unavailable for this attempt.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#eef2f7",
        color: "#0d2259",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: "20px",
      }}
    >
      <div style={{ maxWidth: "1540px", margin: "0 auto" }}>
        <section
          style={{
            background: "#f9fbff",
            borderRadius: "26px",
            padding: "26px 28px",
            boxShadow: "0 8px 22px rgba(13,34,89,0.08)",
            border: "1px solid #d9e2f2",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "20px",
            alignItems: "center",
            marginBottom: "14px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "14px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#5b709e",
                marginBottom: "10px",
              }}
            >
              Worldwide Hotel Bookings
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "56px",
                lineHeight: 1,
                fontWeight: 900,
                letterSpacing: "-0.03em",
              }}
            >
              My Space Hotel
            </h1>

            <p
              style={{
                margin: "18px 0 0 0",
                fontSize: "17px",
                color: "#55698f",
                maxWidth: "900px",
              }}
            >
              Discover outstanding places to stay, enjoy a smoother search, and book
              with confidence through trusted partners.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                marginTop: "18px",
              }}
            >
              <a
                href="#travel-guides"
                style={{
                  background: "#f0c84b",
                  color: "#1f1f1f",
                  textDecoration: "none",
                  padding: "14px 22px",
                  borderRadius: "16px",
                  fontWeight: 800,
                  boxShadow: "0 6px 16px rgba(240,200,75,0.25)",
                }}
              >
                Explore Travel Guides
              </a>

              <a
                href="#faq"
                style={{
                  background: "#dfe9f9",
                  color: "#15337a",
                  textDecoration: "none",
                  padding: "14px 22px",
                  borderRadius: "16px",
                  fontWeight: 800,
                  border: "1px solid #bdd0f4",
                }}
              >
                Frequently Asked Questions
              </a>

              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                style={{
                  background: "#2f67e8",
                  color: "#ffffff",
                  textDecoration: "none",
                  padding: "14px 22px",
                  borderRadius: "16px",
                  fontWeight: 800,
                }}
              >
                Customer Support
              </a>
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(180deg, #2149b8, #173a97)",
              color: "white",
              borderRadius: "24px",
              padding: "20px 22px",
              minWidth: "290px",
              boxShadow: "0 12px 24px rgba(23,58,151,0.28)",
            }}
          >
            <div style={{ fontSize: "56px", fontWeight: 900, lineHeight: 1 }}>
              {safeNumber(totalFound)}
            </div>
            <div style={{ marginTop: "8px", fontSize: "16px", lineHeight: 1.35 }}>
              total hotel choices found in your connected search database
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#f9fbff",
            borderRadius: "26px",
            padding: "20px 16px 18px",
            border: "1px solid #d9e2f2",
            boxShadow: "0 8px 22px rgba(13,34,89,0.08)",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 0.85fr",
              gap: "16px",
              alignItems: "start",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "14px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#5670a2",
                  marginBottom: "10px",
                }}
              >
                Choose what matters most
              </div>

              <h2
                style={{
                  margin: 0,
                  fontSize: "28px",
                  lineHeight: 1.1,
                  fontWeight: 900,
                  color: "#0d2259",
                }}
              >
                Start with the features that matter to you most
              </h2>
            </div>

            <div
              style={{
                color: "#6c7ea4",
                fontSize: "16px",
                lineHeight: 1.5,
                paddingTop: "6px",
              }}
            >
              Pick your preferred facilities first, then search for stays that match
              your trip.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "12px",
              marginTop: "18px",
            }}
          >
            {FACILITIES.map((facility) => {
              const active = selectedFacilities.includes(facility);

              return (
                <button
                  key={facility}
                  type="button"
                  onClick={() => toggleFacility(facility)}
                  style={{
                    borderRadius: "16px",
                    border: active ? "2px solid #2c66e4" : "1px solid #cfd9ee",
                    background: active ? "#e8f0ff" : "#f2f6fc",
                    color: active ? "#12357f" : "#17346d",
                    padding: "16px 14px",
                    fontWeight: 800,
                    fontSize: "15px",
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
              borderRadius: "28px",
              padding: "22px",
              color: "white",
              boxShadow: "0 14px 28px rgba(20,47,131,0.28)",
              border: "1px solid #26469f",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "12px",
                alignItems: "start",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "14px",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#bcd0ff",
                    marginBottom: "10px",
                  }}
                >
                  Find your stay
                </div>

                <h2
                  style={{
                    margin: 0,
                    fontSize: "54px",
                    lineHeight: 0.98,
                    fontWeight: 900,
                    letterSpacing: "-0.03em",
                    maxWidth: "690px",
                  }}
                >
                  Find a stay worth coming back to
                </h2>

                <p
                  style={{
                    margin: "18px 0 0",
                    color: "#e3ebff",
                    fontSize: "17px",
                    maxWidth: "660px",
                  }}
                >
                  Search more hotel options, compare with ease, and choose the stay
                  that feels right for your next trip.
                </p>
              </div>

              <div
                style={{
                  background: "rgba(92,121,214,0.35)",
                  borderRadius: "22px",
                  minWidth: "150px",
                  padding: "16px 18px",
                  textAlign: "center",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                <div style={{ fontSize: "54px", fontWeight: 900, lineHeight: 1 }}>
                  {selectedHotel ? 1 : 0}
                </div>
                <div style={{ color: "#dbe5ff", marginTop: "4px", fontSize: "15px" }}>
                  stay selected
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "12px",
                marginTop: "24px",
              }}
            >
              <div
                style={{
                  background: "rgba(92,121,214,0.28)",
                  borderRadius: "18px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: "15px", color: "#dbe5ff" }}>Loaded Results</div>
                <div style={{ fontSize: "44px", fontWeight: 900, lineHeight: 1.1 }}>
                  {safeNumber(loadedResults)}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(92,121,214,0.28)",
                  borderRadius: "18px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: "15px", color: "#dbe5ff" }}>Total Found</div>
                <div style={{ fontSize: "44px", fontWeight: 900, lineHeight: 1.1 }}>
                  {safeNumber(totalFound)}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(92,121,214,0.28)",
                  borderRadius: "18px",
                  padding: "14px 16px",
                }}
              >
                <div style={{ fontSize: "15px", color: "#dbe5ff" }}>Selected Hotel</div>
                <div
                  style={{
                    fontSize: "18px",
                    fontWeight: 800,
                    lineHeight: 1.25,
                    marginTop: "10px",
                    minHeight: "48px",
                  }}
                >
                  {selectedHotel?.name || "None"}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: "20px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "18px",
                padding: "14px 16px",
                color: "#e8efff",
                fontSize: "15px",
              }}
            >
              {statusText}
              {errorText ? (
                <div style={{ marginTop: "8px", color: "#ffd5d5", fontWeight: 700 }}>
                  {errorText}
                </div>
              ) : null}
            </div>
          </div>

          <div
            style={{
              background: "#142f83",
              borderRadius: "28px",
              padding: "22px",
              color: "white",
              boxShadow: "0 14px 28px rgba(20,47,131,0.28)",
              border: "1px solid #26469f",
            }}
          >
            <div
              style={{
                fontSize: "14px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#bcd0ff",
                marginBottom: "10px",
              }}
            >
              Search
            </div>

            <h2
              style={{
                margin: 0,
                fontSize: "28px",
                fontWeight: 900,
              }}
            >
              Search hotels
            </h2>

            <form onSubmit={handleSearch} style={{ marginTop: "18px" }}>
              <div style={{ display: "grid", gap: "12px" }}>
                <input
                  value={search.destination}
                  onChange={(e) => updateField("destination", e.target.value)}
                  placeholder="Destination"
                  style={inputStyle("large")}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "10px",
                  }}
                >
                  <input
                    value={search.country}
                    onChange={(e) => updateField("country", e.target.value)}
                    placeholder="Country"
                    style={inputStyle()}
                  />
                  <input
                    value={search.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    placeholder="City"
                    style={inputStyle()}
                  />
                  <input
                    value={search.location}
                    onChange={(e) => updateField("location", e.target.value)}
                    placeholder="Area or location"
                    style={inputStyle()}
                  />
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 0.7fr",
                    gap: "10px",
                  }}
                >
                  <input
                    type="date"
                    value={search.checkIn}
                    onChange={(e) => updateField("checkIn", e.target.value)}
                    style={inputStyle()}
                  />
                  <input
                    type="date"
                    value={search.checkOut}
                    onChange={(e) => updateField("checkOut", e.target.value)}
                    style={inputStyle()}
                  />
                  <input
                    type="number"
                    min="1"
                    value={search.guests}
                    onChange={(e) => updateField("guests", e.target.value)}
                    placeholder="Guests"
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
                    type="number"
                    min="1"
                    value={search.rooms}
                    onChange={(e) => updateField("rooms", e.target.value)}
                    placeholder="Rooms"
                    style={inputStyle()}
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      border: 0,
                      borderRadius: "18px",
                      background: loading
                        ? "linear-gradient(90deg, #5f7fe5, #63b8df)"
                        : "linear-gradient(90deg, #2d67e5, #2ab7d8)",
                      color: "white",
                      fontWeight: 900,
                      fontSize: "17px",
                      cursor: "pointer",
                      minHeight: "58px",
                      boxShadow: "0 10px 20px rgba(42,183,216,0.22)",
                    }}
                  >
                    {loading ? "Searching..." : "Search Hotels"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>

        <section
          style={{
            background: "#f9fbff",
            borderRadius: "26px",
            padding: "20px",
            border: "1px solid #d9e2f2",
            boxShadow: "0 8px 22px rgba(13,34,89,0.08)",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "14px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "#5670a2",
                  marginBottom: "8px",
                }}
              >
                Available stays
              </div>
              <h2
                style={{
                  margin: 0,
                  fontSize: "28px",
                  lineHeight: 1.1,
                  fontWeight: 900,
                  color: "#0d2259",
                }}
              >
                Live hotel results
              </h2>
            </div>

            <div
              style={{
                background: "#edf3fe",
                color: "#24488f",
                borderRadius: "14px",
                padding: "12px 16px",
                fontWeight: 800,
              }}
            >
              Showing {visibleHotels.length} of {hotels.length} results
            </div>
          </div>

          {!visibleHotels.length ? (
            <div
              style={{
                borderRadius: "20px",
                border: "1px dashed #bed0ee",
                padding: "32px",
                textAlign: "center",
                background: "#f4f8ff",
                color: "#53698e",
                fontSize: "17px",
                fontWeight: 700,
              }}
            >
              No hotels loaded yet. Press <strong>Search Hotels</strong> to pull live
              results from your connected backend.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "16px",
              }}
            >
              {visibleHotels.map((hotel) => {
                const isSelected = selectedHotel?.id === hotel.id;
                const facilityList = Array.isArray(hotel.facilities)
                  ? hotel.facilities
                  : String(hotel.facilities || "")
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean);

                return (
                  <article
                    key={hotel.id || hotel.name}
                    style={{
                      background: "#ffffff",
                      borderRadius: "22px",
                      overflow: "hidden",
                      border: isSelected ? "2px solid #2e69e6" : "1px solid #dbe5f6",
                      boxShadow: "0 10px 20px rgba(13,34,89,0.07)",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        height: "210px",
                        background: "#dfe7f7",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={hotel.image || "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80"}
                        alt={hotel.name || "Hotel"}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </div>

                    <div style={{ padding: "18px 18px 16px" }}>
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
                              fontSize: "22px",
                              lineHeight: 1.15,
                              fontWeight: 900,
                              color: "#0d2259",
                            }}
                          >
                            {hotel.name}
                          </h3>
                          <div
                            style={{
                              marginTop: "8px",
                              color: "#677c9f",
                              fontSize: "15px",
                            }}
                          >
                            {hotel.location || hotel.address || hotel.city || "Prime location"}
                          </div>
                        </div>

                        <div
                          style={{
                            background: "#edf3ff",
                            color: "#1e4db0",
                            borderRadius: "14px",
                            padding: "10px 12px",
                            fontWeight: 900,
                            minWidth: "78px",
                            textAlign: "center",
                          }}
                        >
                          {hotel.rating || "4.0"}★
                        </div>
                      </div>

                      <p
                        style={{
                          margin: "14px 0 0",
                          color: "#566b8f",
                          fontSize: "15px",
                          lineHeight: 1.55,
                          minHeight: "68px",
                        }}
                      >
                        {hotel.summary ||
                          "Comfortable stay options with easy access to the destination you searched for."}
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
                        {facilityList.slice(0, 4).map((facility) => (
                          <span
                            key={`${hotel.id}-${facility}`}
                            style={{
                              background: "#f3f7fd",
                              color: "#27457f",
                              borderRadius: "999px",
                              padding: "7px 10px",
                              fontSize: "13px",
                              fontWeight: 700,
                              border: "1px solid #d9e4f8",
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
                          <div style={{ color: "#6e81a3", fontSize: "13px", fontWeight: 700 }}>
                            from
                          </div>
                          <div
                            style={{
                              fontSize: "28px",
                              lineHeight: 1.1,
                              fontWeight: 900,
                              color: "#102862",
                            }}
                          >
                            £{hotel.price || "0"}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            flexWrap: "wrap",
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedHotel(hotel)}
                            style={{
                              border: isSelected ? "2px solid #2f67e8" : "1px solid #cad8f2",
                              borderRadius: "14px",
                              background: isSelected ? "#edf3ff" : "#ffffff",
                              color: "#1b448f",
                              fontWeight: 800,
                              padding: "12px 14px",
                              cursor: "pointer",
                            }}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </button>

                          <a
                            href={buildAffiliateLink(hotel)}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              borderRadius: "14px",
                              background: "linear-gradient(90deg, #2d67e5, #2ab7d8)",
                              color: "#ffffff",
                              fontWeight: 900,
                              textDecoration: "none",
                              padding: "12px 16px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            View Deal
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
          id="travel-guides"
          style={{
            background: "#f9fbff",
            borderRadius: "26px",
            padding: "20px",
            border: "1px solid #d9e2f2",
            boxShadow: "0 8px 22px rgba(13,34,89,0.08)",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#5670a2",
              marginBottom: "8px",
            }}
          >
            Explore travel guides
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: "28px",
              lineHeight: 1.1,
              fontWeight: 900,
              color: "#0d2259",
            }}
          >
            Helpful planning ideas before you book
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "14px",
              marginTop: "18px",
            }}
          >
            {[
              {
                title: "Best areas to stay in London",
                text: "Compare central, riverside, business district, and family-friendly areas before deciding.",
              },
              {
                title: "How to compare hotel facilities quickly",
                text: "Choose the facilities most important to you first, then review only the stays that match them.",
              },
              {
                title: "When to book for better value",
                text: "Flexible dates and early comparisons can help you find better rates and stronger hotel choices.",
              },
            ].map((guide) => (
              <div
                key={guide.title}
                style={{
                  background: "#ffffff",
                  borderRadius: "20px",
                  border: "1px solid #dbe5f6",
                  padding: "18px",
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: "20px",
                    lineHeight: 1.2,
                    fontWeight: 900,
                    color: "#102862",
                  }}
                >
                  {guide.title}
                </h3>
                <p
                  style={{
                    margin: "12px 0 0",
                    color: "#5c7196",
                    fontSize: "15px",
                    lineHeight: 1.55,
                  }}
                >
                  {guide.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="faq"
          style={{
            background: "#f9fbff",
            borderRadius: "26px",
            padding: "20px",
            border: "1px solid #d9e2f2",
            boxShadow: "0 8px 22px rgba(13,34,89,0.08)",
          }}
        >
          <div
            style={{
              fontSize: "14px",
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#5670a2",
              marginBottom: "8px",
            }}
          >
            Frequently asked questions
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: "28px",
              lineHeight: 1.1,
              fontWeight: 900,
              color: "#0d2259",
            }}
          >
            Booking information customers often ask about
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: "12px",
              marginTop: "18px",
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
                <h3
                  style={{
                    margin: 0,
                    fontSize: "19px",
                    lineHeight: 1.2,
                    fontWeight: 900,
                    color: "#102862",
                  }}
                >
                  {item.q}
                </h3>
                <p
                  style={{
                    margin: "10px 0 0",
                    color: "#5c7196",
                    fontSize: "15px",
                    lineHeight: 1.55,
                  }}
                >
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function inputStyle(size = "normal") {
  return {
    width: "100%",
    minHeight: size === "large" ? "58px" : "56px",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(95,121,214,0.32)",
    color: "#ffffff",
    padding: "0 16px",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  };
}