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
    text: "Stay close to iconic landmarks, fast transport links, premium shopping, and world-class entertainment.",
  },
  {
    city: "Dubai",
    text: "Choose from standout luxury hotels, resort pools, waterfront towers, and high-end city stays.",
  },
  {
    city: "Paris",
    text: "Find elegant boutique hotels, romantic neighbourhood stays, and stylish city breaks worth remembering.",
  },
  {
    city: "Lagos",
    text: "Secure strong business hotels, family-friendly stays, and well-placed city accommodation with speed.",
  },
];

const FAQS = [
  {
    q: "How does hotel search work?",
    a: "Enter your destination and travel details to unlock live hotel availability from a wider global inventory in seconds.",
  },
  {
    q: "Can I narrow results quickly?",
    a: "Yes. Use the facility filters to remove weak matches fast and bring the most relevant stays to the top.",
  },
  {
    q: "How do I complete my reservation?",
    a: "Select your preferred hotel, review the details, and continue securely through the booking partner to complete your stay.",
  },
  {
    q: "Why use My Space Hotel?",
    a: "My Space Hotel helps you compare faster, filter smarter, and move from search to booking with less friction.",
  },
];

const PAGE_CONTENT = {
  guides: {
    title: "Travel Guides",
    intro:
      "Explore destination highlights that help you choose the right stay faster and book with more confidence.",
    sections: GUIDE_ITEMS.map((item) => ({
      title: item.city,
      body: item.text,
    })),
  },
  faq: {
    title: "Frequently Asked Questions",
    intro:
      "Everything your customers need to know before they continue to booking.",
    sections: FAQS.map((item) => ({
      title: item.q,
      body: item.a,
    })),
  },
  terms: {
    title: "Booking Terms",
    intro:
      "Please review these important points before continuing to a booking partner.",
    sections: [
      {
        title: "Prices and availability",
        body:
          "Hotel prices, room types, taxes, and availability can change quickly. Final details are confirmed on the booking partner page.",
      },
      {
        title: "Guest details",
        body:
          "Please ensure names, dates, rooms, and guest counts are correct before reserving to avoid booking issues.",
      },
      {
        title: "Partner reservation completion",
        body:
          "My Space Hotel helps customers search, compare, and select hotels. Final reservation completion happens with the selected booking partner.",
      },
    ],
  },
  cancellation: {
    title: "Cancellation Policy",
    intro:
      "Cancellation terms vary by hotel, room type, supplier, and travel dates.",
    sections: [
      {
        title: "Review before you reserve",
        body:
          "Always review the cancellation wording shown for your selected stay before you complete payment.",
      },
      {
        title: "Flexible and non-refundable options",
        body:
          "Some stays allow changes or refunds, while others do not. Always check the room conditions carefully.",
      },
      {
        title: "Peak-date restrictions",
        body:
          "Special rates and high-demand periods may carry stricter cancellation terms and reduced flexibility.",
      },
    ],
  },
  protection: {
    title: "Booking Protection",
    intro:
      "Use these checks to keep every reservation accurate, secure, and ready to complete.",
    sections: [
      {
        title: "Check dates and guests",
        body:
          "Confirm arrival, departure, guest count, and rooms before moving to reservation.",
      },
      {
        title: "Review the selected hotel",
        body:
          "Make sure the hotel, area, facilities, and pricing match what you want before continuing.",
      },
      {
        title: "Use the booking button shown here",
        body:
          "Reserve through the button inside My Space Hotel so customers follow the correct partner route.",
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

function pageShell() {
  return {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #f4f7fc 0%, #eef3fa 48%, #e9eff8 100%)",
    padding: "18px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#122c56",
  };
}

function glassCard(radius = 28) {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: `${radius}px`,
    border: "1px solid #dbe4f3",
    boxShadow: "0 16px 34px rgba(15,41,88,0.08)",
    backdropFilter: "blur(12px)",
  };
}

function darkHeroCard() {
  return {
    background:
      "linear-gradient(135deg, rgba(16,46,115,0.96) 0%, rgba(28,84,189,0.88) 55%, rgba(57,129,214,0.74) 100%)",
    borderRadius: "30px",
    color: "#ffffff",
    boxShadow: "0 22px 46px rgba(17,53,129,0.24)",
    position: "relative",
    overflow: "hidden",
  };
}

function inputStyle(dark = false) {
  return {
    width: "100%",
    height: "58px",
    borderRadius: "16px",
    border: dark ? "1px solid rgba(255,255,255,0.18)" : "1px solid #dbe4f2",
    background: dark ? "rgba(255,255,255,0.12)" : "#f8fbff",
    color: dark ? "#ffffff" : "#153463",
    padding: "0 16px",
    fontSize: "15px",
    outline: "none",
    boxSizing: "border-box",
  };
}

function sectionLabel(text, color = "#6a7ea8") {
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
        background: "rgba(8,24,61,0.58)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: "min(960px, 100%)",
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
    "Access live hotel availability, narrow choices faster, and move to booking through trusted partners with confidence."
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
            ? `${items.length} live hotel options are ready for ${destination}. Refine your search and secure the stay that fits best.`
            : `No stays matched this search for ${destination}. Adjust your destination or filters to reveal more options.`)
      );
    } catch (error) {
      console.error("Hotel search failed:", error);
      setHotels([]);
      setErrorText(
        "Live hotel results could not load on this attempt. Please search again to continue."
      );
      setStatusText(
        "Search is designed to help customers compare faster and book smarter once live results are available."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={pageShell()}>
      <FullPageOverlay pageKey={openPage} onClose={() => setOpenPage(null)} />

      <div style={{ maxWidth: "1540px", margin: "0 auto" }}>
        <section
          style={{
            ...darkHeroCard(),
            padding: "22px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at top right, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.02) 42%, rgba(255,255,255,0) 70%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: "1.08fr 0.92fr",
              gap: "18px",
              alignItems: "stretch",
            }}
          >
            <div style={{ padding: "4px 4px 0 4px" }}>
              {sectionLabel("Worldwide Hotel Bookings", "#c7d7ff")}

              <h1
                style={{
                  margin: 0,
                  fontSize: "64px",
                  lineHeight: 0.95,
                  letterSpacing: "-0.05em",
                  fontWeight: 900,
                  maxWidth: "760px",
                }}
              >
                My Space Hotel
              </h1>

              <p
                style={{
                  margin: "18px 0 0",
                  fontSize: "22px",
                  lineHeight: 1.45,
                  color: "#edf3ff",
                  maxWidth: "860px",
                  fontWeight: 500,
                }}
              >
                Give yourself a better chance of finding the right hotel fast,
                comparing with clarity, and booking through trusted partners
                without the usual clutter.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginTop: "20px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenPage("guides")}
                  style={{
                    border: 0,
                    borderRadius: "999px",
                    background: "#f0c84b",
                    color: "#1f1c15",
                    padding: "13px 18px",
                    fontWeight: 900,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Travel Guides
                </button>

                <button
                  type="button"
                  onClick={() => setOpenPage("faq")}
                  style={{
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.10)",
                    color: "#ffffff",
                    padding: "13px 18px",
                    fontWeight: 900,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  FAQs
                </button>

                <button
                  type="button"
                  onClick={() => setOpenPage("terms")}
                  style={{
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.10)",
                    color: "#ffffff",
                    padding: "13px 18px",
                    fontWeight: 900,
                    fontSize: "14px",
                    cursor: "pointer",
                  }}
                >
                  Booking Terms
                </button>

                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  style={{
                    textDecoration: "none",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.10)",
                    color: "#ffffff",
                    padding: "13px 18px",
                    fontWeight: 900,
                    fontSize: "14px",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Customer Support
                </a>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "22px",
                  flexWrap: "wrap",
                  marginTop: "20px",
                  color: "#e6efff",
                  fontSize: "15px",
                  fontWeight: 700,
                }}
              >
                <div>Access live global hotel inventory</div>
                <div>Refine results instantly</div>
                <div>Compare with confidence</div>
                <div>Book through trusted partners</div>
              </div>
            </div>

            <div
              style={{
                ...glassCard(26),
                padding: "18px",
                alignSelf: "stretch",
              }}
            >
              {sectionLabel("Search")}
              <h2
                style={{
                  margin: 0,
                  fontSize: "30px",
                  lineHeight: 1.08,
                  fontWeight: 900,
                  color: "#102863",
                }}
              >
                Search hotels with speed and clarity
              </h2>

              <p
                style={{
                  margin: "10px 0 0",
                  color: "#5f7398",
                  fontSize: "15px",
                  lineHeight: 1.55,
                }}
              >
                Search a wider hotel database, refine quickly, and move your best option into booking without wasted time.
              </p>

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
                        borderRadius: "16px",
                        border: 0,
                        background: "linear-gradient(90deg, #f0c84b, #e5b830)",
                        color: "#1d2130",
                        fontSize: "16px",
                        fontWeight: 900,
                        cursor: "pointer",
                      }}
                    >
                      {loading ? "Searching..." : "Search"}
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
                        background: "#fff3f3",
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
            display: "grid",
            gridTemplateColumns: "1.05fr 0.95fr",
            gap: "14px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              ...glassCard(),
              padding: "22px",
            }}
          >
            {sectionLabel("Precision filters")}
            <h2
              style={{
                margin: 0,
                fontSize: "42px",
                lineHeight: 1.04,
                fontWeight: 900,
                maxWidth: "620px",
              }}
            >
              Refine your search with precision filters
            </h2>

            <p
              style={{
                margin: "14px 0 0",
                color: "#5e7398",
                fontSize: "17px",
                lineHeight: 1.6,
                maxWidth: "700px",
              }}
            >
              Help customers reach the right stay faster by removing weak matches and focusing only on the facilities that matter most.
            </p>

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginTop: "18px",
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
                      minHeight: "48px",
                      borderRadius: "16px",
                      border: active ? "2px solid #2f67e8" : "1px solid #d6e0f1",
                      background: active ? "#e8f0ff" : "#ffffff",
                      color: "#17356f",
                      fontSize: "15px",
                      fontWeight: 800,
                      cursor: "pointer",
                      padding: "0 16px",
                      boxShadow: active ? "0 8px 18px rgba(47,103,232,0.12)" : "none",
                    }}
                  >
                    {facility}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              ...darkHeroCard(),
              minHeight: "100%",
              padding: "22px",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02))",
                pointerEvents: "none",
              }}
            />
            <div style={{ position: "relative" }}>
              {sectionLabel("Large hotel inventory", "#c7d7ff")}
              <h2
                style={{
                  margin: 0,
                  fontSize: "46px",
                  lineHeight: 1.02,
                  fontWeight: 900,
                  maxWidth: "520px",
                }}
              >
                Search thousands of hotel options with less effort
              </h2>

              <p
                style={{
                  margin: "14px 0 0",
                  color: "#e6efff",
                  fontSize: "18px",
                  lineHeight: 1.6,
                  maxWidth: "560px",
                }}
              >
                Give customers a stronger reason to use the platform by combining broad hotel choice with faster filtering and a smoother route to booking.
              </p>

              <div
                style={{
                  marginTop: "24px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    borderRadius: "20px",
                    padding: "18px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#d8e4ff" }}>Visible choices</div>
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "40px",
                      lineHeight: 1,
                      fontWeight: 900,
                    }}
                  >
                    {filteredHotels.length}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    borderRadius: "20px",
                    padding: "18px",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#d8e4ff" }}>Booking readiness</div>
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "30px",
                      lineHeight: 1,
                      fontWeight: 900,
                    }}
                  >
                    {activeHotel ? "Ready" : "Waiting"}
                  </div>
                </div>
              </div>
            </div>
          </div>
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
              ...glassCard(),
              padding: "20px",
            }}
          >
            {sectionLabel("Selected hotel")}
            <h2
              style={{
                margin: 0,
                fontSize: "30px",
                lineHeight: 1.08,
                fontWeight: 900,
              }}
            >
              A clear booking view that keeps attention on the best option
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
                    padding: "28px",
                    color: "#5b7196",
                    fontSize: "16px",
                    lineHeight: 1.7,
                  }}
                >
                  Start a search to reveal live hotel options, compare what matters, and move your chosen stay into a stronger booking position.
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
                            color: "#102863",
                          }}
                        >
                          {activeHotel.name}
                        </div>
                        <div
                          style={{
                            marginTop: "8px",
                            color: "#65789a",
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
                        lineHeight: 1.65,
                      }}
                    >
                      {activeHotel.summary ||
                        "A strong hotel option selected from live availability, designed to help customers move from comparison to booking with confidence."}
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
                          Booking partner
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
                          boxShadow: "0 10px 20px rgba(45,103,229,0.18)",
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
                lineHeight: 1.08,
                fontWeight: 900,
              }}
            >
              A wider hotel selection that helps customers stay in control
            </h2>

            <div
              style={{
                marginTop: "12px",
                color: "#5d7298",
                fontSize: "15px",
                lineHeight: 1.6,
              }}
            >
              Keep the strength of a large hotel database while presenting it in a way that feels sharper, faster, and more worth using.
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
                    lineHeight: 1.7,
                  }}
                >
                  Search now to reveal live hotel choices, compare more effectively, and bring the strongest options into view.
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
                        gridTemplateColumns: "108px 1fr auto",
                        gap: "12px",
                        alignItems: "center",
                        boxShadow: selected ? "0 10px 20px rgba(47,103,232,0.08)" : "none",
                      }}
                    >
                      <div
                        style={{
                          width: "108px",
                          height: "84px",
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

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px",
            marginBottom: "14px",
          }}
        >
          <div
            style={{
              ...glassCard(),
              padding: "22px",
            }}
          >
            {sectionLabel("Why customers choose it")}
            <h2
              style={{
                margin: 0,
                fontSize: "30px",
                lineHeight: 1.08,
                fontWeight: 900,
              }}
            >
              Give customers stronger reasons to search and book here
            </h2>

            <div
              style={{
                display: "grid",
                gap: "10px",
                marginTop: "16px",
              }}
            >
              {[
                {
                  title: "Broader hotel choice",
                  text: "A wider hotel database helps customers feel they have a better chance of finding the right stay.",
                },
                {
                  title: "Sharper filtering",
                  text: "Facility-led search reduces clutter and helps customers focus quickly on what fits their trip.",
                },
                {
                  title: "Clearer decisions",
                  text: "One selected hotel view and one strong list layout make comparison easier and booking more direct.",
                },
                {
                  title: "Faster booking path",
                  text: "The route from search to partner reservation is simple, visible, and ready to use.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  style={{
                    background: "#ffffff",
                    borderRadius: "18px",
                    border: "1px solid #dbe5f6",
                    padding: "16px",
                  }}
                >
                  <div style={{ fontSize: "18px", fontWeight: 900, color: "#102863" }}>
                    {item.title}
                  </div>
                  <div
                    style={{
                      marginTop: "8px",
                      color: "#5d7298",
                      fontSize: "15px",
                      lineHeight: 1.6,
                    }}
                  >
                    {item.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              ...glassCard(),
              padding: "22px",
            }}
          >
            {sectionLabel("Before booking")}
            <h2
              style={{
                margin: 0,
                fontSize: "30px",
                lineHeight: 1.08,
                fontWeight: 900,
              }}
            >
              Everything customers need before they continue
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "12px",
                marginTop: "16px",
              }}
            >
              {[
                {
                  key: "terms",
                  title: "Booking Terms",
                  text: "Key details on pricing, availability, and booking accuracy before reservation.",
                  background: "linear-gradient(180deg, #edf4ff, #f7fbff)",
                },
                {
                  key: "cancellation",
                  title: "Cancellation Policy",
                  text: "Important cancellation guidance reviewed before customers continue to book.",
                  background: "linear-gradient(180deg, #eef6ff, #f8fbff)",
                },
                {
                  key: "protection",
                  title: "Booking Protection",
                  text: "Simple checks that help customers complete reservations with more confidence.",
                  background: "linear-gradient(180deg, #eef8ff, #f8fcff)",
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setOpenPage(item.key)}
                  style={{
                    textAlign: "left",
                    border: "1px solid #dbe5f6",
                    borderRadius: "22px",
                    padding: "18px",
                    background: item.background,
                    color: "#17356f",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: "20px", fontWeight: 900 }}>{item.title}</div>
                  <div
                    style={{
                      marginTop: "10px",
                      fontSize: "15px",
                      lineHeight: 1.55,
                      color: "#5a7096",
                    }}
                  >
                    {item.text}
                  </div>
                  <div
                    style={{
                      marginTop: "14px",
                      fontSize: "14px",
                      fontWeight: 900,
                      color: "#17356f",
                    }}
                  >
                    Learn More
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}