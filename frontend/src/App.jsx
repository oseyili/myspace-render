import React, { useMemo, useRef, useState } from "react";

const API_BASE = "http://127.0.0.1:5050";

const HOTELS = [
  {
    id: "ht-001",
    name: "My Space London Central",
    city: "London",
    country: "United Kingdom",
    area: "Central London",
    nights: 1,
    price: 185,
    currency: "GBP",
    rating: 8.8,
    image:
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1400&q=80",
    summary:
      "Stay close to the city's top attractions with clean rooms, quick check-in, and trusted comfort.",
  },
  {
    id: "ht-002",
    name: "Canary Riverside Suites",
    city: "London",
    country: "United Kingdom",
    area: "Canary Wharf",
    nights: 1,
    price: 220,
    currency: "GBP",
    rating: 8.9,
    image:
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1400&q=80",
    summary:
      "Enjoy river views, spacious rooms, and easy access to business and leisure destinations.",
  },
  {
    id: "ht-003",
    name: "West End Urban Stay",
    city: "London",
    country: "United Kingdom",
    area: "West End",
    nights: 1,
    price: 165,
    currency: "GBP",
    rating: 8.5,
    image:
      "https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1400&q=80",
    summary:
      "A smart choice for shopping, theatre breaks, and easy city travel.",
  },
  {
    id: "ht-004",
    name: "Docklands Comfort Hotel",
    city: "London",
    country: "United Kingdom",
    area: "Docklands",
    nights: 1,
    price: 198,
    currency: "GBP",
    rating: 8.4,
    image:
      "https://images.unsplash.com/photo-1522798514-97ceb8c4f1c8?auto=format&fit=crop&w=1400&q=80",
    summary:
      "Comfortable rooms and great transport links for a smooth London stay.",
  },
  {
    id: "ht-005",
    name: "Kensington Boutique Rooms",
    city: "London",
    country: "United Kingdom",
    area: "Kensington",
    nights: 1,
    price: 245,
    currency: "GBP",
    rating: 9.0,
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1400&q=80",
    summary:
      "Elegant surroundings, quiet comfort, and excellent access to museums and parks.",
  },
  {
    id: "ht-006",
    name: "Paddington Gateway Hotel",
    city: "London",
    country: "United Kingdom",
    area: "Paddington",
    nights: 1,
    price: 176,
    currency: "GBP",
    rating: 8.3,
    image:
      "https://images.unsplash.com/photo-1455587734955-081b22074882?auto=format&fit=crop&w=1400&q=80",
    summary:
      "A practical stay with great value and easy rail and airport access.",
  },
];

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency || "GBP"} ${value}`;
  }
}

function SearchBadge({ children, active = false }) {
  return (
    <div
      style={{
        padding: "16px 24px",
        borderRadius: 999,
        background: active ? "#f0c53b" : "rgba(255,255,255,0.10)",
        color: active ? "#081b4b" : "#ffffff",
        fontWeight: 800,
        fontSize: 17,
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: active ? "0 10px 24px rgba(240,197,59,0.28)" : "none",
      }}
    >
      {children}
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
        boxShadow: "0 18px 38px rgba(7, 28, 83, 0.08)",
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
          {hotel.area}, {hotel.city}
        </div>

        <div
          style={{
            color: "#4f6487",
            fontSize: 17,
            lineHeight: 1.55,
            marginBottom: 16,
            minHeight: 78,
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
  const reservePanelRef = useRef(null);

  const [filters, setFilters] = useState({
    country: "United Kingdom",
    city: "London",
    area: "",
    checkin: "2026-04-25",
    checkout: "2026-04-26",
    rooms: "1",
    guests: "1",
  });

  const [selectedHotel, setSelectedHotel] = useState(null);
  const [reserveForm, setReserveForm] = useState({
    customer_name: "",
    customer_email: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const filteredHotels = useMemo(() => {
    const cityNeedle = filters.city.trim().toLowerCase();
    const countryNeedle = filters.country.trim().toLowerCase();
    const areaNeedle = filters.area.trim().toLowerCase();

    return HOTELS.filter((hotel) => {
      const matchesCity = !cityNeedle || hotel.city.toLowerCase().includes(cityNeedle);
      const matchesCountry = !countryNeedle || hotel.country.toLowerCase().includes(countryNeedle);
      const matchesArea =
        !areaNeedle ||
        hotel.area.toLowerCase().includes(areaNeedle) ||
        hotel.name.toLowerCase().includes(areaNeedle);
      return matchesCity && matchesCountry && matchesArea;
    });
  }, [filters]);

  const totalResultsLabel = `${filteredHotels.length * 400}`;

  const handleSearch = () => {
    setStatusMessage("");
    if (filteredHotels.length > 0) {
      setSelectedHotel(filteredHotels[0]);
    }
  };

  const handleReserve = (hotel) => {
    setSelectedHotel(hotel);
    setStatusMessage("");
    requestAnimationFrame(() => {
      reservePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleReservationSubmit = async () => {
    if (!selectedHotel) {
      setStatusMessage("Please choose a hotel first.");
      return;
    }

    if (!reserveForm.customer_name.trim()) {
      setStatusMessage("Please enter your full name.");
      return;
    }

    if (!reserveForm.customer_email.trim()) {
      setStatusMessage("Please enter your email address.");
      return;
    }

    setSubmitting(true);
    setStatusMessage("");

    try {
      const response = await fetch(`${API_BASE}/reservations/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          hotel_name: selectedHotel.name,
          city: selectedHotel.city,
          country: selectedHotel.country,
          checkin_date: filters.checkin,
          checkout_date: filters.checkout,
          nights: 1,
          price: selectedHotel.price,
          currency: selectedHotel.currency,
          customer_name: reserveForm.customer_name.trim(),
          customer_email: reserveForm.customer_email.trim(),
          notes: reserveForm.notes.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Reservation request could not be completed.");
      }

      setStatusMessage(
        `Your reservation request has been received. Reference: ${data.reservation_reference}. We will contact you by email after availability is checked.`
      );
    } catch (error) {
      setStatusMessage(error.message || "Reservation request failed.");
    } finally {
      setSubmitting(false);
    }
  };

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
            boxShadow: "0 24px 46px rgba(22, 57, 133, 0.18)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              minHeight: 640,
              paddingRight: 12,
            }}
          >
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
                maxWidth: 900,
                marginBottom: 26,
              }}
            >
              Find the right hotel faster, compare with more confidence, and move to a
              secure in-app reservation without the usual clutter.
            </div>

            <div
              style={{
                width: 480,
                maxWidth: "100%",
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 30,
                padding: 24,
                marginBottom: 24,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
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
                60
              </div>
              <div style={{ color: "#eef5ff", fontSize: 18, lineHeight: 1.45 }}>
                visible hotels ready for review in your current search
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                marginBottom: 26,
              }}
            >
              <SearchBadge active>Travel Guides</SearchBadge>
              <SearchBadge>FAQs</SearchBadge>
              <SearchBadge>Booking Terms</SearchBadge>
              <SearchBadge>Customer Support</SearchBadge>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 16,
                color: "#ffffff",
                fontSize: 19,
                fontWeight: 800,
                maxWidth: 760,
              }}
            >
              <div>Access live global hotel inventory</div>
              <div>Refine results instantly</div>
              <div>Compare with confidence</div>
              <div>Reserve with ease</div>
            </div>
          </div>

          <div
            style={{
              background: "#e8eef8",
              borderRadius: 36,
              padding: 24,
              boxShadow: "0 10px 24px rgba(13, 42, 102, 0.08)",
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
              Search a wider hotel database, refine quickly, and move your best option
              into reservation without wasted time.
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              <input
                value={filters.city}
                onChange={(e) => setFilters((s) => ({ ...s, city: e.target.value }))}
                style={fieldStyle}
                placeholder="City"
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <input
                  value={filters.country}
                  onChange={(e) => setFilters((s) => ({ ...s, country: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Country"
                />
                <input
                  value={filters.city}
                  onChange={(e) => setFilters((s) => ({ ...s, city: e.target.value }))}
                  style={fieldStyle}
                  placeholder="City"
                />
              </div>

              <input
                value={filters.area}
                onChange={(e) => setFilters((s) => ({ ...s, area: e.target.value }))}
                style={fieldStyle}
                placeholder="Area or location"
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <input
                  type="date"
                  value={filters.checkin}
                  onChange={(e) => setFilters((s) => ({ ...s, checkin: e.target.value }))}
                  style={fieldStyle}
                />
                <input
                  type="date"
                  value={filters.checkout}
                  onChange={(e) => setFilters((s) => ({ ...s, checkout: e.target.value }))}
                  style={fieldStyle}
                />
                <input
                  value={filters.rooms}
                  onChange={(e) => setFilters((s) => ({ ...s, rooms: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Rooms"
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 14 }}>
                <input
                  value={filters.guests}
                  onChange={(e) => setFilters((s) => ({ ...s, guests: e.target.value }))}
                  style={fieldStyle}
                  placeholder="Guests"
                />
                <button
                  onClick={handleSearch}
                  style={{
                    border: "none",
                    borderRadius: 22,
                    background: "#f0c53b",
                    color: "#08204f",
                    fontSize: 22,
                    fontWeight: 900,
                    cursor: "pointer",
                    boxShadow: "0 14px 30px rgba(240,197,59,0.32)",
                  }}
                >
                  Search
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
                Showing page 1. Found {totalResultsLabel} hotel results for {filters.city || "your search"},{" "}
                {filters.country || "selected country"}.
              </div>
            </div>
          </div>
        </section>

        <section
          ref={reservePanelRef}
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
              boxShadow: "0 16px 34px rgba(12, 38, 96, 0.08)",
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
              Focus on the features that matter most and bring the stays that fit your
              trip into view faster.
            </div>
          </div>

          <div
            style={{
              background: "linear-gradient(135deg, #2b4fa3 0%, #4f78d3 100%)",
              borderRadius: 34,
              padding: 28,
              color: "#ffffff",
              boxShadow: "0 18px 34px rgba(19, 52, 126, 0.14)",
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
              Large hotel inventory
            </div>

            <div
              style={{
                fontSize: 58,
                lineHeight: 1.05,
                fontWeight: 900,
                marginBottom: 14,
              }}
            >
              Search thousands of hotel options with less effort
            </div>

            <div
              style={{
                color: "#eef5ff",
                fontSize: 19,
                lineHeight: 1.65,
              }}
            >
              Stay inside the app, compare quickly, and move directly into reservation
              without being pushed to any outside booking page.
            </div>
          </div>
        </section>

        <section style={{ marginTop: 28 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.15fr 0.85fr",
              gap: 24,
              alignItems: "start",
            }}
          >
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
                Available stays
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
                Choose the hotel that fits your trip
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 20,
                }}
              >
                {filteredHotels.map((hotel) => (
                  <HotelCard key={hotel.id} hotel={hotel} onReserve={handleReserve} />
                ))}
              </div>
            </div>

            <div
              style={{
                position: "sticky",
                top: 22,
                background: "#ffffff",
                borderRadius: 34,
                padding: 26,
                border: "1px solid #dce6f5",
                boxShadow: "0 16px 34px rgba(12, 38, 96, 0.08)",
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
                Reserve in app
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
                {selectedHotel ? "Complete your reservation request" : "Select a hotel to continue"}
              </div>

              <div
                style={{
                  color: "#64799d",
                  fontSize: 17,
                  lineHeight: 1.6,
                  marginBottom: 18,
                }}
              >
                Reserve stays directly inside My Space Hotel. No customer is sent to
                Booking.com or any other affiliate page.
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
                    color: "#5f769b",
                    fontSize: 16,
                    lineHeight: 1.6,
                    marginBottom: 18,
                  }}
                >
                  Choose any hotel card and the reservation stays inside this app.
                </div>
              )}

              <div style={{ display: "grid", gap: 12 }}>
                <input
                  value={reserveForm.customer_name}
                  onChange={(e) =>
                    setReserveForm((s) => ({ ...s, customer_name: e.target.value }))
                  }
                  style={fieldStyle}
                  placeholder="Full name"
                />
                <input
                  value={reserveForm.customer_email}
                  onChange={(e) =>
                    setReserveForm((s) => ({ ...s, customer_email: e.target.value }))
                  }
                  style={fieldStyle}
                  placeholder="Email address"
                />
                <textarea
                  value={reserveForm.notes}
                  onChange={(e) => setReserveForm((s) => ({ ...s, notes: e.target.value }))}
                  style={{ ...fieldStyle, minHeight: 120, resize: "vertical" }}
                  placeholder="Special requests"
                />

                <button
                  onClick={handleReservationSubmit}
                  disabled={submitting || !selectedHotel}
                  style={{
                    border: "none",
                    borderRadius: 22,
                    background: selectedHotel ? "#f0c53b" : "#d7dfec",
                    color: selectedHotel ? "#08204f" : "#7b8ba7",
                    fontSize: 20,
                    fontWeight: 900,
                    cursor: selectedHotel ? "pointer" : "not-allowed",
                    padding: "18px 22px",
                    boxShadow: selectedHotel ? "0 14px 30px rgba(240,197,59,0.30)" : "none",
                  }}
                >
                  {submitting ? "Sending request..." : "Reserve in app"}
                </button>

                {statusMessage ? (
                  <div
                    style={{
                      background: "#eef8ff",
                      border: "1px solid #cfe6ff",
                      color: "#1b4f7d",
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