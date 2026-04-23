import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.NEXT_PUBLIC_API_BASE ||
  "";

const DEFAULT_FORM = {
  name: "",
  email: "",
  message: "",
};

const DEFAULT_FILTERS = {
  city: "",
  page: 1,
};

const GUIDE_LINKS = [
  {
    title: "Choose the right area before you choose the rate",
    body:
      "A lower headline rate can still become the wrong choice if the area adds long journeys, inconvenience, noise, or distance from what matters most on the trip. A stronger hotel decision starts with a stronger location decision.",
  },
  {
    title: "Business travel needs calm, timing, and credibility",
    body:
      "The right business stay should support meetings, transport timing, reliable internet, and a polished arrival experience. Search more carefully and compare more confidently before you reserve.",
  },
  {
    title: "Family travel works best when comfort is practical",
    body:
      "Family bookings need more than a room. They need space, convenience, good area positioning, and useful facilities. Filter clearly so the shortlist feels right from the start.",
  },
  {
    title: "Short city breaks depend on strong positioning",
    body:
      "When the trip is short, location matters even more. The right area can turn a rushed break into a smooth one by reducing wasted time and increasing what you can actually enjoy.",
  },
  {
    title: "Luxury should feel considered, not rushed",
    body:
      "A premium stay should deliver atmosphere, comfort, ease, and confidence. Compare carefully so the hotel feels right for the purpose of the trip, not just impressive on first glance.",
  },
  {
    title: "Return to search with a clearer decision",
    body:
      "Travel guidance should help you make a better hotel choice, then bring you straight back to search and reserve with more confidence.",
  },
];

const INFO_PAGES = {
  guides: {
    title: "Smart Travel Guides",
    hero: "Travel guidance that helps you choose the right stay with more confidence",
    intro:
      "My Space Hotel is built for travellers who want more than a list of rooms. Smart Travel Guides help you compare areas, understand what kind of stay suits the trip, and return to search with a clearer, stronger decision.",
    sections: [
      {
        heading: "A better hotel choice starts before you reserve",
        body:
          "The best stay is not always the one with the lowest headline rate. It is the one that supports the purpose of your trip, saves time, improves comfort, and helps you feel better about where you are staying.",
      },
      {
        heading: "Designed for serious travellers",
        body:
          "Whether you are planning a business trip, a city break, a family stay, or a higher-end experience, strong guidance helps you search more intelligently and compare more effectively.",
      },
      {
        heading: "Built to return you directly to search",
        body:
          "Every guide is part of the reservation journey. Learn what matters, return directly to the app, and continue your hotel search with more confidence.",
      },
    ],
    links: GUIDE_LINKS,
  },
  faqs: {
    title: "FAQs",
    hero: "Clear answers that help you move forward with confidence",
    intro:
      "Booking a hotel should not feel confusing. These answers help you understand how My Space Hotel works and why the reservation journey is designed to stay clear and customer-focused.",
    sections: [
      {
        heading: "Do I stay inside My Space Hotel while searching?",
        body:
          "Yes. The aim is to help you search, compare, choose, and submit your reservation request directly inside My Space Hotel.",
      },
      {
        heading: "Can I compare several hotels before I decide?",
        body:
          "Yes. You can search by city, refine with facilities, browse through multiple pages of results, and then choose the stay that feels right for your trip.",
      },
      {
        heading: "What happens after I send a reservation request?",
        body:
          "Your request is received by the platform and prepared for follow-up using the details you provide. The goal is to keep the process clear, direct, and customer-friendly.",
      },
      {
        heading: "Is this built only for one city?",
        body:
          "No. My Space Hotel is designed as a global hotel platform with a growing catalogue and a clearer search experience.",
      },
    ],
  },
  terms: {
    title: "Booking Terms",
    hero: "A reservation journey designed to feel clearer and more trustworthy",
    intro:
      "My Space Hotel uses a reservation-request approach that helps you compare first, choose carefully, and continue with more confidence.",
    sections: [
      {
        heading: "Search first, choose carefully",
        body:
          "Your journey begins with hotel comparison and selection. This gives you more control before moving into the next step.",
      },
      {
        heading: "Reservation requests help keep the journey focused",
        body:
          "A reservation request allows the platform to continue with you more clearly around the stay you selected.",
      },
      {
        heading: "Displayed rates support comparison",
        body:
          "Displayed rates are there to help you compare and shortlist the right stay for your trip before you continue.",
      },
    ],
  },
  support: {
    title: "Customer Support",
    hero: "Support that helps you continue with more confidence",
    intro:
      "Strong support is part of a strong booking experience. My Space Hotel customer support is there to help you search, compare, and continue your reservation journey with less uncertainty.",
    sections: [
      {
        heading: "Search support",
        body:
          "If you need help understanding locations, hotel differences, or which stay may fit your trip more strongly, support helps make the choice clearer.",
      },
      {
        heading: "Reservation support",
        body:
          "After you send a reservation request, support helps keep the experience more secure, more responsive, and easier to trust.",
      },
      {
        heading: "Built to earn repeat use",
        body:
          "A platform becomes stronger when travellers feel understood, informed, and supported from search to reservation.",
      },
    ],
  },
};

function formatMoney(value, currency) {
  const amount = Number(value || 0);
  const code = (currency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${amount}`;
  }
}

function getPageFromHash() {
  const raw = window.location.hash.replace(/^#\/?/, "").trim();
  if (!raw) return "home";
  return INFO_PAGES[raw] ? raw : "home";
}

function setHash(page) {
  window.location.hash = page === "home" ? "#/" : `#/${page}`;
}

function NavPill({ label, page }) {
  return (
    <button
      type="button"
      onClick={() => setHash(page)}
      style={{
        padding: "16px 24px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.10)",
        color: "#ffffff",
        fontWeight: 900,
        fontSize: 17,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function InfoPage({ page }) {
  const content = INFO_PAGES[page];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f2f5fb",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: 28 }}>
        <button
          type="button"
          onClick={() => setHash("home")}
          style={{
            border: "none",
            borderRadius: 16,
            background: "#12367c",
            color: "#ffffff",
            fontWeight: 900,
            fontSize: 16,
            padding: "14px 18px",
            cursor: "pointer",
            marginBottom: 24,
          }}
        >
          Return to search
        </button>

        <section
          style={{
            background: "linear-gradient(135deg, #1a3e92 0%, #2f58b6 50%, #69a3e3 100%)",
            borderRadius: 36,
            padding: 36,
            color: "#ffffff",
            marginBottom: 24,
            boxShadow: "0 24px 44px rgba(18,54,124,0.16)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              letterSpacing: 3,
              fontWeight: 900,
              textTransform: "uppercase",
              marginBottom: 14,
              color: "#dfeaff",
            }}
          >
            {content.title}
          </div>

          <div
            style={{
              fontSize: 54,
              lineHeight: 1.05,
              fontWeight: 900,
              marginBottom: 16,
            }}
          >
            {content.hero}
          </div>

          <div
            style={{
              fontSize: 20,
              lineHeight: 1.75,
              color: "#eef5ff",
              maxWidth: 1100,
            }}
          >
            {content.intro}
          </div>
        </section>

        <section style={{ display: "grid", gap: 20, marginBottom: 24 }}>
          {content.sections.map((section, index) => (
            <div
              key={`${page}-${index}`}
              style={{
                background: "#ffffff",
                borderRadius: 28,
                padding: 28,
                border: "1px solid #dce6f5",
                boxShadow: "0 14px 30px rgba(12,38,96,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: 30,
                  lineHeight: 1.15,
                  fontWeight: 900,
                  color: "#12367c",
                  marginBottom: 12,
                }}
              >
                {section.heading}
              </div>

              <div
                style={{
                  fontSize: 18,
                  lineHeight: 1.8,
                  color: "#4f6487",
                }}
              >
                {section.body}
              </div>
            </div>
          ))}
        </section>

        {page === "guides" ? (
          <section
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 28,
              border: "1px solid #dce6f5",
              boxShadow: "0 14px 30px rgba(12,38,96,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 34,
                lineHeight: 1.1,
                fontWeight: 900,
                color: "#12367c",
                marginBottom: 16,
              }}
            >
              Travel guide highlights
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              {content.links.map((item, index) => (
                <div
                  key={`guide-link-${index}`}
                  style={{
                    border: "1px solid #dce6f5",
                    background: "#f7faff",
                    borderRadius: 22,
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 23,
                      lineHeight: 1.2,
                      fontWeight: 900,
                      color: "#12367c",
                      marginBottom: 8,
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      lineHeight: 1.7,
                      color: "#5d7090",
                    }}
                  >
                    {item.body}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setHash("home")}
              style={{
                marginTop: 22,
                border: "none",
                borderRadius: 18,
                background: "#f0c53b",
                color: "#08204f",
                fontWeight: 900,
                fontSize: 18,
                padding: "16px 20px",
                cursor: "pointer",
              }}
            >
              Return to search and compare hotels
            </button>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setHash("home")}
            style={{
              border: "none",
              borderRadius: 18,
              background: "#f0c53b",
              color: "#08204f",
              fontWeight: 900,
              fontSize: 18,
              padding: "16px 20px",
              cursor: "pointer",
            }}
          >
            Return to search
          </button>
        )}
      </div>
    </div>
  );
}

function FacilityCheckbox({ label, checked, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderRadius: 16,
        background: checked ? "#eef5ff" : "#ffffff",
        border: checked ? "1px solid #bcd6ff" : "1px solid #dce6f5",
        cursor: "pointer",
        fontWeight: 700,
        color: "#12367c",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 18, height: 18 }}
      />
      {label}
    </label>
  );
}

function HotelCard({ hotel, onReserve }) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 28,
        overflow: "hidden",
        border: "1px solid #dbe6f5",
        boxShadow: "0 18px 38px rgba(7,28,83,0.08)",
      }}
    >
      <img
        src={hotel.image}
        alt={hotel.name}
        style={{
          width: "100%",
          height: 240,
          objectFit: "cover",
          display: "block",
        }}
      />

      <div style={{ padding: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontSize: 24,
              lineHeight: 1.2,
              fontWeight: 900,
              color: "#0d2a66",
            }}
          >
            {hotel.name}
          </div>

          <div
            style={{
              background: "#eef5ff",
              color: "#17407b",
              border: "1px solid #d7e7ff",
              borderRadius: 999,
              padding: "10px 14px",
              fontWeight: 800,
              fontSize: 14,
              whiteSpace: "nowrap",
            }}
          >
            Guest score {hotel.rating}
          </div>
        </div>

        <div style={{ color: "#5d7090", fontSize: 15, marginBottom: 12 }}>
          {hotel.area}, {hotel.city}, {hotel.country}
        </div>

        <div
          style={{
            color: "#4f6487",
            fontSize: 17,
            lineHeight: 1.55,
            marginBottom: 14,
          }}
        >
          Facilities: {(hotel.facilities || []).join(", ")}
        </div>

        <div
          style={{
            color: "#5d7090",
            fontSize: 16,
            lineHeight: 1.6,
            marginBottom: 14,
          }}
        >
          {hotel.summary}
        </div>

        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: "#0d2a66",
            marginBottom: 18,
          }}
        >
          {formatMoney(hotel.price, hotel.currency)}
        </div>

        <button
          type="button"
          onClick={() => onReserve(hotel)}
          style={{
            width: "100%",
            background: "#f0c53b",
            color: "#08204f",
            border: "none",
            borderRadius: 18,
            padding: "16px 18px",
            fontWeight: 900,
            fontSize: 18,
            cursor: "pointer",
            boxShadow: "0 14px 28px rgba(240,197,59,0.34)",
          }}
        >
          Choose this stay
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(getPageFromHash());
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [facilityOptions, setFacilityOptions] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [reserveForm, setReserveForm] = useState(DEFAULT_FORM);
  const [hotels, setHotels] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const onHash = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    async function loadFacilities() {
      try {
        const response = await fetch(`${API_BASE}/api/facilities`);
        const data = await response.json();
        setFacilityOptions(Array.isArray(data.facilities) ? data.facilities : []);
      } catch {
        setFacilityOptions([
          "wifi",
          "spa",
          "gym",
          "restaurant",
          "pool",
          "parking",
          "airport shuttle",
          "family rooms",
          "beach access",
          "business lounge",
          "breakfast included",
          "city centre access",
        ]);
      }
    }

    loadFacilities();
  }, []);

  const shownCount = useMemo(() => hotels.length, [hotels]);

  async function runSearch(pageNumber = 1) {
    if (!filters.city.trim()) {
      setStatusMessage("Please enter a city before searching.");
      return;
    }

    setSearchLoading(true);
    setStatusMessage("");
    setHasSearched(true);
    setHotels([]);
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams();
      params.set("city", filters.city.trim());
      params.set("page", String(pageNumber));
      params.set("page_size", "12");

      if (selectedFacilities.length > 0) {
        params.set("facilities", selectedFacilities.join(","));
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE}/api/hotels?${params.toString()}`, {
        signal: controller.signal,
      });

      clearTimeout(timer);

      const data = await response.json();

      if (!response.ok) {
        throw new Error("Hotel search could not be completed.");
      }

      const list = Array.isArray(data.hotels) ? data.hotels : [];

      setHotels(list);
      setTotalCount(Number(data.count || 0));
      setTotalPages(Number(data.total_pages || 1));
      setFilters((s) => ({ ...s, page: Number(data.page || pageNumber) }));

      if (list.length > 0) {
        setSelectedHotel(list[0]);
      } else {
        setStatusMessage("No hotels matched that search.");
      }
    } catch (error) {
      setStatusMessage(
        error.name === "AbortError"
          ? "Search is taking longer than expected. Please try again."
          : "Hotel search is temporarily unavailable."
      );
    } finally {
      setSearchLoading(false);
    }
  }

  function handleSearch() {
    runSearch(1);
  }

  function handlePageChange(nextPage) {
    runSearch(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleRefresh() {
    setFilters(DEFAULT_FILTERS);
    setSelectedFacilities([]);
    setReserveForm(DEFAULT_FORM);
    setHotels([]);
    setSelectedHotel(null);
    setStatusMessage("");
    setHasSearched(false);
    setTotalCount(0);
    setTotalPages(1);
    setHash("home");
  }

  function toggleFacility(facility) {
    setSelectedFacilities((prev) =>
      prev.includes(facility)
        ? prev.filter((item) => item !== facility)
        : [...prev, facility]
    );
  }

  function handleReserveSelect(hotel) {
    setSelectedHotel(hotel);
    setStatusMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleReservationSubmit() {
    if (!selectedHotel) {
      setStatusMessage("Please choose a hotel first.");
      return;
    }

    if (!reserveForm.name.trim()) {
      setStatusMessage("Please enter your name.");
      return;
    }

    if (!reserveForm.email.trim()) {
      setStatusMessage("Please enter your email address.");
      return;
    }

    setSubmitting(true);
    setStatusMessage("Sending your reservation request...");

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_BASE}/api/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          name: reserveForm.name.trim(),
          email: reserveForm.email.trim(),
          message: reserveForm.message.trim(),
        }),
      });

      clearTimeout(timer);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || "Request could not be submitted.");
      }

      const supportSent = Boolean(data?.email_delivery?.support_sent);
      const customerSent = Boolean(data?.email_delivery?.customer_sent);

      if (supportSent && customerSent) {
        setStatusMessage(
          "Your reservation request has been received and confirmation emails have been sent."
        );
      } else {
        setStatusMessage(
          "Your reservation request has been received. We will continue with you shortly."
        );
      }
    } catch (error) {
      setStatusMessage(
        error.name === "AbortError"
          ? "The request took too long to complete. Please try again."
          : "Your reservation request could not be completed right now."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (page !== "home") {
    return <InfoPage page={page} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f2f5fb",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: "#0d2a66",
      }}
    >
      <div style={{ maxWidth: 1860, margin: "0 auto", padding: 28 }}>
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.18fr 1fr",
            gap: 24,
            background:
              "linear-gradient(135deg, #1a3e92 0%, #2f58b6 50%, #69a3e3 100%)",
            borderRadius: 42,
            padding: 32,
            boxShadow: "0 24px 46px rgba(22,57,133,0.18)",
            overflow: "hidden",
          }}
        >
          <div style={{ minHeight: 640, paddingRight: 12 }}>
            <div
              style={{
                color: "#dfeaff",
                fontWeight: 900,
                letterSpacing: 3,
                fontSize: 16,
                textTransform: "uppercase",
                marginBottom: 20,
              }}
            >
              Worldwide hotel bookings
            </div>

            <div
              style={{
                color: "#ffffff",
                fontSize: 78,
                lineHeight: 0.98,
                fontWeight: 900,
                marginBottom: 24,
              }}
            >
              My Space Hotel
            </div>

            <div
              style={{
                color: "#f4f8ff",
                fontSize: 28,
                lineHeight: 1.45,
                fontWeight: 700,
                maxWidth: 920,
                marginBottom: 26,
              }}
            >
              Search more hotels worldwide, compare with clarity, and reserve with confidence inside one customer-focused platform.
            </div>

            <div
              style={{
                width: 500,
                maxWidth: "100%",
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 30,
                padding: 24,
                marginBottom: 24,
              }}
            >
              <div style={{ color: "#e4eeff", fontSize: 18, marginBottom: 14 }}>
                Hotels in your current search
              </div>
              <div
                style={{
                  color: "#ffffff",
                  fontSize: 74,
                  fontWeight: 900,
                  lineHeight: 1,
                  marginBottom: 8,
                }}
              >
                {totalCount}
              </div>
              <div style={{ color: "#eef5ff", fontSize: 18, lineHeight: 1.45 }}>
                {hasSearched
                  ? "Search results ready for review, comparison, and reservation request"
                  : "Search by city, refine with facilities, and browse through multiple pages of stays"}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
              <NavPill label="Smart Travel Guides" page="guides" />
              <NavPill label="FAQs" page="faqs" />
              <NavPill label="Booking Terms" page="terms" />
              <NavPill label="Customer Support" page="support" />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
                color: "#ffffff",
                fontSize: 19,
                fontWeight: 800,
                maxWidth: 860,
              }}
            >
              <div>Search a wider hotel catalogue</div>
              <div>Refine clearly with facility tick boxes</div>
              <div>Compare more confidently</div>
              <div>Send your reservation request directly</div>
            </div>
          </div>

          <div
            style={{
              background: "#e8eef8",
              borderRadius: 36,
              padding: 24,
              boxShadow: "0 10px 24px rgba(13,42,102,0.08)",
              alignSelf: "stretch",
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: 3,
                color: "#657ca4",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Search
            </div>

            <div
              style={{
                fontSize: 58,
                lineHeight: 1.05,
                fontWeight: 900,
                color: "#12367c",
                marginBottom: 12,
              }}
            >
              Find the stay that feels right for your trip
            </div>

            <div
              style={{
                color: "#62779d",
                fontSize: 18,
                lineHeight: 1.6,
                marginBottom: 18,
              }}
            >
              Search by city, refine by what matters most, compare more clearly, and continue to reservation with greater confidence.
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <input
                value={filters.city}
                onChange={(e) => setFilters((s) => ({ ...s, city: e.target.value }))}
                style={fieldStyle}
                placeholder="Where are you travelling?"
              />

              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #d8e3f1",
                  borderRadius: 24,
                  padding: 16,
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    color: "#12367c",
                    fontSize: 16,
                    marginBottom: 12,
                  }}
                >
                  Choose the facilities that matter most
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 10,
                    maxHeight: 220,
                    overflowY: "auto",
                    paddingRight: 4,
                  }}
                >
                  {facilityOptions.map((facility) => (
                    <FacilityCheckbox
                      key={facility}
                      label={facility}
                      checked={selectedFacilities.includes(facility)}
                      onChange={() => toggleFacility(facility)}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <button type="button" onClick={handleSearch} style={yellowButtonStyle}>
                  {searchLoading ? "Searching..." : "Search"}
                </button>
                <button type="button" onClick={handleRefresh} style={navyButtonStyle}>
                  Refresh
                </button>
              </div>

              <div
                style={{
                  background: "#f4f7fc",
                  border: "1px solid #d9e5f4",
                  color: "#6a7fa2",
                  borderRadius: 18,
                  padding: "18px 20px",
                  fontSize: 18,
                }}
              >
                {searchLoading
                  ? "Searching for matching stays..."
                  : hasSearched
                  ? `Showing ${shownCount} of ${totalCount} hotel options for this search.`
                  : "Start with a city search to load hotel options into the portal."}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            marginTop: 26,
            display: "grid",
            gridTemplateColumns: "1.05fr 0.95fr",
            gap: 22,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 34,
              padding: 28,
              border: "1px solid #dce6f5",
              boxShadow: "0 16px 34px rgba(12,38,96,0.08)",
            }}
          >
            <div
              style={{
                color: "#7b8dab",
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: 3,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Find the right match faster
            </div>

            <div
              style={{
                fontSize: 58,
                lineHeight: 1.05,
                fontWeight: 900,
                color: "#12367c",
                marginBottom: 14,
              }}
            >
              Narrow your search with more confidence
            </div>

            <div
              style={{
                color: "#657ca4",
                fontSize: 19,
                lineHeight: 1.65,
              }}
            >
              Filter by the facilities you care about, compare the strongest options, and focus on stays that genuinely suit your trip.
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(135deg, #2b4fa3 0%, #4f78d3 100%)",
              borderRadius: 34,
              padding: 28,
              color: "#ffffff",
              boxShadow: "0 18px 34px rgba(19,52,126,0.14)",
            }}
          >
            <div
              style={{
                color: "#d9e7ff",
                fontSize: 15,
                fontWeight: 900,
                letterSpacing: 3,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Why travellers choose My Space Hotel
            </div>

            <div
              style={{
                fontSize: 58,
                lineHeight: 1.05,
                fontWeight: 900,
                marginBottom: 14,
              }}
            >
              Search, compare, and reserve with more clarity
            </div>

            <div
              style={{
                color: "#eef5ff",
                fontSize: 19,
                lineHeight: 1.65,
              }}
            >
              My Space Hotel is designed to help you make a stronger hotel decision before you reserve, with clearer guidance, cleaner filtering, and a more focused reservation journey.
            </div>
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 24, alignItems: "start" }}>
            <div>
              <div
                style={{
                  fontSize: 18,
                  color: "#7387a8",
                  fontWeight: 900,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  marginBottom: 8,
                }}
              >
                Available hotels
              </div>

              <div
                style={{
                  fontSize: 54,
                  lineHeight: 1.05,
                  fontWeight: 900,
                  color: "#12367c",
                  marginBottom: 18,
                }}
              >
                Compare hotels and choose the stay that fits your trip
              </div>

              {!hasSearched ? (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 28,
                    padding: 28,
                    border: "1px solid #dce6f5",
                    boxShadow: "0 16px 34px rgba(12,38,96,0.08)",
                    color: "#5f769b",
                    fontSize: 18,
                    lineHeight: 1.7,
                  }}
                >
                  Begin with a city search. Once results load, you can compare a broader hotel list, move through multiple pages of results, and select the stay that feels right.
                </div>
              ) : hotels.length > 0 ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}>
                    {hotels.map((hotel) => (
                      <HotelCard key={hotel.id} hotel={hotel} onReserve={handleReserveSelect} />
                    ))}
                  </div>

                  <div
                    style={{
                      marginTop: 22,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <button
                      type="button"
                      disabled={filters.page <= 1 || searchLoading}
                      onClick={() => handlePageChange(filters.page - 1)}
                      style={{
                        ...navyButtonStyle,
                        padding: "14px 18px",
                        fontSize: 16,
                        opacity: filters.page <= 1 ? 0.5 : 1,
                      }}
                    >
                      Previous
                    </button>

                    <div
                      style={{
                        background: "#ffffff",
                        border: "1px solid #dce6f5",
                        borderRadius: 16,
                        padding: "14px 18px",
                        color: "#12367c",
                        fontWeight: 800,
                        fontSize: 16,
                      }}
                    >
                      Page {filters.page} of {totalPages}
                    </div>

                    <button
                      type="button"
                      disabled={filters.page >= totalPages || searchLoading}
                      onClick={() => handlePageChange(filters.page + 1)}
                      style={{
                        ...yellowButtonStyle,
                        padding: "14px 18px",
                        fontSize: 16,
                        opacity: filters.page >= totalPages ? 0.5 : 1,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: 28,
                    padding: 28,
                    border: "1px solid #dce6f5",
                    boxShadow: "0 16px 34px rgba(12,38,96,0.08)",
                    color: "#9f2d2d",
                    fontSize: 18,
                    lineHeight: 1.7,
                  }}
                >
                  {statusMessage || "No hotels matched that search."}
                </div>
              )}
            </div>

            <div
              style={{
                position: "sticky",
                top: 22,
                background: "#ffffff",
                borderRadius: 34,
                padding: 26,
                border: "1px solid #dce6f5",
                boxShadow: "0 16px 34px rgba(12,38,96,0.08)",
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  color: "#7387a8",
                  fontWeight: 900,
                  letterSpacing: 3,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Send your reservation request
              </div>

              <div
                style={{
                  fontSize: 42,
                  lineHeight: 1.08,
                  fontWeight: 900,
                  color: "#12367c",
                  marginBottom: 14,
                }}
              >
                Complete your reservation request
              </div>

              <div
                style={{
                  color: "#64799d",
                  fontSize: 17,
                  lineHeight: 1.6,
                  marginBottom: 18,
                }}
              >
                Choose your stay, share your details, and continue your reservation journey directly inside My Space Hotel.
              </div>

              {selectedHotel ? (
                <div
                  style={{
                    background: "#f7faff",
                    border: "1px solid #dce8f8",
                    borderRadius: 22,
                    padding: 18,
                    marginBottom: 18,
                  }}
                >
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#12367c", marginBottom: 8 }}>
                    {selectedHotel.name}
                  </div>
                  <div style={{ color: "#5f769b", fontSize: 16, marginBottom: 8 }}>
                    {selectedHotel.area}, {selectedHotel.city}, {selectedHotel.country}
                  </div>
                  <div style={{ color: "#12367c", fontSize: 26, fontWeight: 900 }}>
                    {formatMoney(selectedHotel.price, selectedHotel.currency)}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "#f7faff",
                    border: "1px solid #dce8f8",
                    borderRadius: 22,
                    padding: 18,
                    marginBottom: 18,
                    color: "#5f769b",
                    fontSize: 16,
                    lineHeight: 1.6,
                  }}
                >
                  Select a hotel first so your chosen stay appears here.
                </div>
              )}

              <div style={{ display: "grid", gap: 12 }}>
                <input
                  value={reserveForm.name}
                  onChange={(e) => setReserveForm((s) => ({ ...s, name: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Your name"
                />
                <input
                  value={reserveForm.email}
                  onChange={(e) => setReserveForm((s) => ({ ...s, email: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Your email address"
                />
                <textarea
                  value={reserveForm.message}
                  onChange={(e) => setReserveForm((s) => ({ ...s, message: e.target.value }))}
                  style={{ ...fieldStyle, minHeight: 120, resize: "vertical" }}
                  placeholder="Special requests or important details"
                />

                <button
                  type="button"
                  onClick={handleReservationSubmit}
                  disabled={submitting}
                  style={{
                    ...yellowButtonStyle,
                    width: "100%",
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? "Sending request..." : "Send reservation request"}
                </button>

                {statusMessage ? (
                  <div
                    style={{
                      background:
                        statusMessage.toLowerCase().includes("could not") ||
                        statusMessage.toLowerCase().includes("please") ||
                        statusMessage.toLowerCase().includes("unavailable")
                          ? "#fff0f0"
                          : "#eef8ff",
                      border:
                        statusMessage.toLowerCase().includes("could not") ||
                        statusMessage.toLowerCase().includes("please") ||
                        statusMessage.toLowerCase().includes("unavailable")
                          ? "1px solid #f1caca"
                          : "1px solid #cfe6ff",
                      color:
                        statusMessage.toLowerCase().includes("could not") ||
                        statusMessage.toLowerCase().includes("please") ||
                        statusMessage.toLowerCase().includes("unavailable")
                          ? "#9f2d2d"
                          : "#1b4f7d",
                      borderRadius: 20,
                      padding: "16px 18px",
                      fontSize: 16,
                      lineHeight: 1.6,
                      fontWeight: 700,
                    }}
                  >
                    {statusMessage}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 22,
  border: "1px solid #d8e3f1",
  background: "#ffffff",
  color: "#12367c",
  fontSize: 18,
  padding: "20px 20px",
  outline: "none",
};

const yellowButtonStyle = {
  border: "none",
  borderRadius: 22,
  background: "#f0c53b",
  color: "#08204f",
  fontSize: 20,
  fontWeight: 900,
  cursor: "pointer",
  padding: "18px 22px",
  boxShadow: "0 14px 30px rgba(240,197,59,0.30)",
};

const navyButtonStyle = {
  border: "none",
  borderRadius: 22,
  background: "#12367c",
  color: "#ffffff",
  fontSize: 20,
  fontWeight: 900,
  cursor: "pointer",
  padding: "18px 22px",
  boxShadow: "0 14px 30px rgba(18,54,124,0.18)",
};