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
    title: "Why location matters more than the lowest rate",
    body:
      "Customers often lose more through poor location than they save on headline price. The right district can reduce transport stress, improve safety, and make the whole trip feel more successful.",
  },
  {
    title: "Business travel needs a different hotel decision",
    body:
      "A serious business stay should support timing, access, quiet working conditions, internet quality, and confidence on arrival. My Space Hotel helps customers look for those signals instead of only chasing a cheap room.",
  },
  {
    title: "Family travel requires smarter filtering",
    body:
      "Family bookings need space, convenience, calm, and practical facilities. A cleaner guided search reduces wasted time and makes the shortlist easier to trust.",
  },
  {
    title: "Short city breaks need stronger area guidance",
    body:
      "When the trip is short, the customer cannot afford a weak location decision. Better area guidance helps travellers stay closer to the experience they actually came for.",
  },
];

const INFO_PAGES = {
  guides: {
    title: "Travel Guides",
    hero: "Travel intelligence that helps customers choose better stays",
    intro:
      "Travel Guides are not filler content. They are one of the strongest selling points of My Space Hotel because they help customers make better location and hotel decisions before they reserve. That improves confidence, supports trust, and gives the platform a more serious competitive position.",
    sections: [
      {
        heading: "Why this matters for a global audience",
        body:
          "Travellers booking across cities and countries want more than a price tag. They want guidance on which areas work best, what kind of stay fits the trip, and how to shortlist options without wasting time. Strong travel guidance makes the whole app feel more premium and more useful.",
      },
      {
        heading: "A better guide creates a better booking decision",
        body:
          "My Space Hotel should help customers understand the difference between central convenience, luxury positioning, family practicality, nightlife access, beach access, airport convenience, and business suitability. When that guidance is clear, the customer is more likely to continue inside the app instead of leaving to search elsewhere.",
      },
      {
        heading: "Return directly to the app and complete the search",
        body:
          "Each guide is designed to support the search journey, not distract from it. Customers should be able to learn something important, return immediately to the portal, and continue their hotel comparison with more confidence.",
      },
    ],
    links: GUIDE_LINKS,
  },
  faqs: {
    title: "FAQs",
    hero: "Clear answers that reduce hesitation",
    intro:
      "Customers should never feel uncertain about how the platform works. Strong FAQs help serious travellers move forward faster and trust the reservation flow more easily.",
    sections: [
      {
        heading: "Does My Space Hotel keep customers inside the app?",
        body:
          "Yes. The aim is to make the search and reservation request journey feel direct, controlled, and branded inside My Space Hotel.",
      },
      {
        heading: "Can customers compare multiple hotels before requesting availability?",
        body:
          "Yes. The platform is designed to let customers review a broader hotel list, refine results, and then select the stay that best fits the trip.",
      },
      {
        heading: "Is this designed only for one city?",
        body:
          "No. The app is built to scale into a wider international hotel platform with clearer guidance, stronger filtering, and a more serious customer journey.",
      },
    ],
  },
  terms: {
    title: "Booking Terms",
    hero: "A cleaner reservation-first approach",
    intro:
      "My Space Hotel uses a request-first reservation flow that gives customers more clarity before the next step. This helps the platform feel less rushed and more trustworthy.",
    sections: [
      {
        heading: "Reservation requests come first",
        body:
          "The customer first chooses a hotel and sends a request. That keeps the platform in control of the experience and avoids pushing the traveller too quickly into the wrong commitment.",
      },
      {
        heading: "Displayed rates support comparison",
        body:
          "Displayed rates are used to help customers compare, shortlist, and move toward the best-fit stay. They support the decision process inside the app.",
      },
      {
        heading: "The customer journey stays focused",
        body:
          "The platform is designed to keep the customer on a clear path from search to hotel selection to reservation request.",
      },
    ],
  },
  support: {
    title: "Customer Support",
    hero: "Support that helps the customer continue with confidence",
    intro:
      "Support is not just for solving problems. It is part of the trust structure of the app. Clear support helps customers continue the reservation journey with less uncertainty and more confidence.",
    sections: [
      {
        heading: "Search support",
        body:
          "Customers may need help understanding areas, hotel differences, or which stay is the stronger fit for the trip.",
      },
      {
        heading: "Reservation support",
        body:
          "Once a request is submitted, support helps maintain confidence and gives the traveller a stronger feeling of being looked after by the platform.",
      },
      {
        heading: "Built for repeat use",
        body:
          "A serious support layer increases trust, improves return usage, and helps the platform compete more strongly.",
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
          Return to app
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
              Important travel guide themes
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
              Return to app and continue search
            </button>
          </section>
        ) : null}
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
              Search a stronger hotel database, compare more seriously, and move customers into a direct reservation request inside your own platform.
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
                {totalCount}
              </div>
              <div style={{ color: "#eef5ff", fontSize: 18, lineHeight: 1.45 }}>
                {hasSearched
                  ? "visible hotels ready for review in your current search"
                  : "search by city, refine with facilities, and browse through multiple pages of results"}
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
              <NavPill label="Travel Guides" page="guides" />
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
              <div>Search larger internal hotel inventory</div>
              <div>Refine results clearly with tick boxes</div>
              <div>Keep customers inside your platform</div>
              <div>Browse multiple result pages smoothly</div>
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
              Search by city, refine with facility tick boxes, and move directly toward a reservation request without unnecessary friction.
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <input
                value={filters.city}
                onChange={(e) => setFilters((s) => ({ ...s, city: e.target.value }))}
                style={fieldStyle}
                placeholder="City"
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
                  Facilities
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
                  ? "Loading matching hotel options..."
                  : hasSearched
                  ? `Showing ${shownCount} of ${totalCount} hotel options for the current search.`
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
              Customers should be able to narrow choices quickly with clear facility tick boxes and then move through a broader list without losing confidence.
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
              The portal should feel direct, useful, competitive, and informative enough to keep customers inside your own experience.
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
                  Begin with a city search. Once results load, customers can compare a broader list of hotels, move through pages of results, and select the stay that best fits the trip.
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