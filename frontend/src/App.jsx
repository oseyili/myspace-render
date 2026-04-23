import React, { useEffect, useMemo, useState } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.NEXT_PUBLIC_API_BASE ||
  "";

const DEFAULT_FILTERS = {
  city: "",
  facility: "",
};

const DEFAULT_FORM = {
  name: "",
  email: "",
  message: "",
};

const INFO_PAGES = {
  guides: {
    title: "Travel Guides",
    hero: "Travel smarter before you reserve",
    intro:
      "A better hotel decision starts with a better destination decision. My Space Hotel helps customers think beyond price alone and focus on location, convenience, atmosphere, transport access, and the purpose of the trip.",
    sections: [
      {
        heading: "Choose the right area, not just the cheapest room",
        body:
          "A lower price in the wrong location can cost more in time, transport, inconvenience, and missed plans. Customers need a clearer picture of where they are staying, not just a rate.",
      },
      {
        heading: "Compare with confidence",
        body:
          "Strong travel guidance gives customers more confidence before they reserve. That confidence increases trust, reduces hesitation, and helps travellers move faster toward the right stay.",
      },
      {
        heading: "Built for a global audience",
        body:
          "My Space Hotel is being shaped as a serious worldwide hotel platform. Travel guidance is part of that experience because customers need more than a list of rooms. They need useful decision support.",
      },
    ],
  },
  faqs: {
    title: "FAQs",
    hero: "Clear answers for serious travellers",
    intro:
      "Customers booking across different cities and countries need direct answers. These FAQs explain how My Space Hotel works and why the reservation experience is designed to stay simple and controlled.",
    sections: [
      {
        heading: "Do customers pay immediately?",
        body:
          "No. The customer first sends a reservation request. That gives the platform a chance to review the selected stay and continue the process properly without rushing the customer into the wrong decision.",
      },
      {
        heading: "Are customers redirected to outside booking websites?",
        body:
          "No. The aim is to keep customers inside My Space Hotel so the journey feels direct, branded, and easier to trust.",
      },
      {
        heading: "Is this only for one city?",
        body:
          "No. The platform is built to grow into a wider global hotel database. Search, comparison, and reservation flow are all being shaped for international use.",
      },
      {
        heading: "What happens after a reservation request is sent?",
        body:
          "The request is recorded, a response message is returned, and the selected stay can then move into the next communication step from inside your own platform.",
      },
    ],
  },
  terms: {
    title: "Booking Terms",
    hero: "A reservation-first model that protects the customer",
    intro:
      "My Space Hotel uses a request-first reservation approach. This allows customers to select a stay with more control and helps the platform build a cleaner confirmation path.",
    sections: [
      {
        heading: "Reservation request first",
        body:
          "Submitting a request tells the platform which stay the customer wants to move forward with. It does not need to behave like a rushed, instant outside checkout.",
      },
      {
        heading: "Confirmation before pressure",
        body:
          "Customers should not feel pushed toward commitment before the selected stay has been properly reviewed. A calmer reservation path creates stronger confidence and fewer mistakes.",
      },
      {
        heading: "Displayed rates guide selection",
        body:
          "Displayed prices are part of the customer’s comparison journey. The platform uses them to help customers shortlist the right stay before moving forward.",
      },
    ],
  },
  support: {
    title: "Customer Support",
    hero: "Support that helps customers move forward with confidence",
    intro:
      "A serious hotel platform needs strong support. My Space Hotel customer support is part of the trust layer that helps customers feel more secure from first search to reservation request.",
    sections: [
      {
        heading: "Reservation assistance",
        body:
          "Customers can get support with selected hotels, search questions, and the next steps after they submit a request.",
      },
      {
        heading: "Clarity without confusion",
        body:
          "Support should reduce uncertainty, not add to it. Clear answers help customers continue with more confidence and less hesitation.",
      },
      {
        heading: "Built for long-term trust",
        body:
          "As your platform grows, support becomes one of the biggest reasons customers return and recommend the service to others.",
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

function TopPill({ label, page, active }) {
  return (
    <button
      type="button"
      onClick={() => setHash(page)}
      style={{
        padding: "16px 24px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.16)",
        background: active ? "#f0c53b" : "rgba(255,255,255,0.10)",
        color: active ? "#08204f" : "#ffffff",
        fontWeight: 900,
        fontSize: 17,
        cursor: "pointer",
        boxShadow: active ? "0 12px 24px rgba(240,197,59,0.22)" : "none",
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
        color: "#12367c",
      }}
    >
      <div style={{ maxWidth: 1320, margin: "0 auto", padding: 28 }}>
        <button
          type="button"
          onClick={() => setHash("home")}
          style={{
            border: "none",
            borderRadius: 16,
            background: "#12367c",
            color: "#ffffff",
            fontWeight: 800,
            fontSize: 16,
            padding: "14px 18px",
            cursor: "pointer",
            marginBottom: 24,
          }}
        >
          Back to portal
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
              lineHeight: 1.7,
              color: "#eef5ff",
              maxWidth: 980,
            }}
          >
            {content.intro}
          </div>
        </section>

        <section style={{ display: "grid", gap: 20 }}>
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
                  fontSize: 28,
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
      </div>
    </div>
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
          Reserve in app
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState(getPageFromHash());
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [reserveForm, setReserveForm] = useState(DEFAULT_FORM);
  const [hotels, setHotels] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const onHash = () => setPage(getPageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const shownCount = useMemo(() => hotels.length, [hotels]);

  async function handleSearch() {
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

      if (filters.facility.trim()) {
        params.set("facility", filters.facility.trim());
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

  function handleRefresh() {
    setFilters(DEFAULT_FILTERS);
    setReserveForm(DEFAULT_FORM);
    setHotels([]);
    setSelectedHotel(null);
    setStatusMessage("");
    setHasSearched(false);
    setHash("home");
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
      setStatusMessage("Please enter the customer name.");
      return;
    }

    if (!reserveForm.email.trim()) {
      setStatusMessage("Please enter the customer email.");
      return;
    }

    setSubmitting(true);
    setStatusMessage("Sending request...");

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

      setStatusMessage(
        data?.message || "Your request has been submitted. We will contact you shortly."
      );
    } catch (error) {
      setStatusMessage(
        error.name === "AbortError"
          ? "The request took too long to complete. Please try again."
          : "Reservation request failed."
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
              Search a stronger hotel database, compare the right options faster, and move to a direct reservation request inside your own platform.
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
                Live choices shown
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
                {shownCount}
              </div>
              <div style={{ color: "#eef5ff", fontSize: 18, lineHeight: 1.45 }}>
                {hasSearched
                  ? "visible hotels ready for review in your current search"
                  : "search by city and refine with facilities to bring the right stays into view"}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
              <TopPill label="Travel Guides" page="guides" active={page === "guides"} />
              <TopPill label="FAQs" page="faqs" active={page === "faqs"} />
              <TopPill label="Booking Terms" page="terms" active={page === "terms"} />
              <TopPill label="Customer Support" page="support" active={page === "support"} />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
                color: "#ffffff",
                fontSize: 19,
                fontWeight: 800,
                maxWidth: 800,
              }}
            >
              <div>Search larger internal hotel inventory</div>
              <div>Refine results clearly</div>
              <div>Keep customers inside your platform</div>
              <div>Request availability with confidence</div>
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
              Search hotels with speed and clarity
            </div>

            <div
              style={{
                color: "#62779d",
                fontSize: 18,
                lineHeight: 1.6,
                marginBottom: 18,
              }}
            >
              Search by city, refine by facility, and move directly toward a reservation request without unnecessary friction.
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <input
                value={filters.city}
                onChange={(e) => setFilters((s) => ({ ...s, city: e.target.value }))}
                style={fieldStyle}
                placeholder="City"
              />

              <input
                value={filters.facility}
                onChange={(e) => setFilters((s) => ({ ...s, facility: e.target.value }))}
                style={fieldStyle}
                placeholder="Facility, for example wifi or spa"
              />

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
                  ? "Loading matching hotel options..."
                  : hasSearched
                  ? `Showing ${shownCount} hotel option${shownCount === 1 ? "" : "s"} for the current search.`
                  : "Start with a city search to load matching hotels into the portal."}
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
              Precision filters
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
              Refine your search with precision filters
            </div>

            <div
              style={{
                color: "#657ca4",
                fontSize: 19,
                lineHeight: 1.65,
              }}
            >
              Customers should be able to narrow choices faster and focus on stays that actually match the trip. This portal is designed to feel cleaner, stronger, and more professional from the first click.
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
              Professional portal
            </div>

            <div
              style={{
                fontSize: 58,
                lineHeight: 1.05,
                fontWeight: 900,
                marginBottom: 14,
              }}
            >
              Build trust before the customer reserves
            </div>

            <div
              style={{
                color: "#eef5ff",
                fontSize: 19,
                lineHeight: 1.65,
              }}
            >
              The platform should feel direct, useful, and competitive. Customers should understand what the app offers and why it is worth using without being pushed out into unrelated pages.
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
                Choose the hotel that fits the trip
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
                  Begin with a city search. Once results load, customers can compare hotels, shortlist the strongest fit, and move directly into the reservation request panel.
                </div>
              ) : hotels.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 20 }}>
                  {hotels.map((hotel) => (
                    <HotelCard key={hotel.id} hotel={hotel} onReserve={handleReserveSelect} />
                  ))}
                </div>
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
                Request availability
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
                Customers stay inside My Space Hotel. Search, compare, select, and request the stay directly from your own platform.
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
                  Select a hotel card first so the chosen stay appears here.
                </div>
              )}

              <div style={{ display: "grid", gap: 12 }}>
                <input
                  value={reserveForm.name}
                  onChange={(e) => setReserveForm((s) => ({ ...s, name: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Customer name"
                />
                <input
                  value={reserveForm.email}
                  onChange={(e) => setReserveForm((s) => ({ ...s, email: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Customer email"
                />
                <textarea
                  value={reserveForm.message}
                  onChange={(e) => setReserveForm((s) => ({ ...s, message: e.target.value }))}
                  style={{ ...fieldStyle, minHeight: 120, resize: "vertical" }}
                  placeholder="Special requests"
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
                  {submitting ? "Sending request..." : "Request availability"}
                </button>

                {statusMessage ? (
                  <div
                    style={{
                      background:
                        statusMessage.toLowerCase().includes("failed") ||
                        statusMessage.toLowerCase().includes("unavailable") ||
                        statusMessage.toLowerCase().includes("please")
                          ? "#fff0f0"
                          : "#eef8ff",
                      border:
                        statusMessage.toLowerCase().includes("failed") ||
                        statusMessage.toLowerCase().includes("unavailable") ||
                        statusMessage.toLowerCase().includes("please")
                          ? "1px solid #f1caca"
                          : "1px solid #cfe6ff",
                      color:
                        statusMessage.toLowerCase().includes("failed") ||
                        statusMessage.toLowerCase().includes("unavailable") ||
                        statusMessage.toLowerCase().includes("please")
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