import React, { useMemo, useState } from "react";

const SUPPORT_EMAIL = "reservations@myspace-hotel.com";
const API_BASE = "http://127.0.0.1:3010";

const INFO_PAGES = {
  terms: {
    title: "Terms and Conditions",
    kicker: "BOOKING INFORMATION",
    intro:
      "Please review these important points before you continue to a booking partner.",
    bullets: [
      "Prices, taxes, and availability can change before booking is completed.",
      "Always review your dates, room details, guest details, and final amount before confirming.",
      "Special requests such as early check-in, late check-out, or room preferences depend on availability.",
      "The final booking terms shown by the booking partner apply before payment is completed.",
      "Your booking confirmation and stay details are normally sent by the booking partner after payment.",
    ],
  },
  cancellation: {
    title: "Cancellation Policy",
    kicker: "BEFORE YOU BOOK",
    intro:
      "Cancellation rules can vary by hotel, rate, and room type, so always check the stay you choose.",
    bullets: [
      "Some stays allow free cancellation up to a stated date.",
      "Some stays are partly refundable, while others may be non-refundable.",
      "The cancellation deadline and any charges are normally shown before you confirm.",
      "Changes to dates, guests, or room types can affect price and cancellation terms.",
      "If you need to cancel after booking, use the instructions in your booking confirmation.",
    ],
  },
  protection: {
    title: "Booking Protection",
    kicker: "BOOK WITH CONFIDENCE",
    intro:
      "Your booking continues through trusted partners using their secure checkout process.",
    bullets: [
      "Use your correct name, email address, and travel details so your confirmation reaches you properly.",
      "Review room details and the final amount before payment.",
      "Keep a copy of your confirmation email after booking is complete.",
      "If you are booking for another guest, make sure their details are entered correctly.",
      "For changes after booking, use the contact details in the booking confirmation.",
    ],
  },
  support: {
    title: "Customer Support",
    kicker: "WE ARE HERE TO HELP",
    intro:
      "If you need help before continuing to a booking partner, use the details below.",
    bullets: [
      `Support email: ${SUPPORT_EMAIL}`,
      "Use support for general booking guidance before you continue to a partner.",
      "Questions about completed bookings are usually handled by the booking partner shown on your confirmation.",
      "Before contacting support, it helps to have your destination, travel dates, and hotel name ready.",
    ],
  },
  faq: {
    title: "Frequently Asked Questions",
    kicker: "HELPFUL ANSWERS",
    intro: "Quick answers to common questions about choosing and booking your stay.",
    bullets: [
      "Search for your destination, compare hotel options, and choose the stay that suits you best.",
      "Bookings continue securely through trusted booking partners.",
      "Cancellation and change options depend on the hotel and partner terms shown before confirmation.",
      "Prices can change depending on dates, room availability, and demand.",
      "Use correct guest details so your confirmation reaches you without delay.",
    ],
  },
  etg: {
    title: "Explore Travel Guides",
    kicker: "TRAVEL IDEAS",
    intro:
      "Helpful travel guidance to make choosing your stay easier and more confident.",
    bullets: [
      "City breaks are great for sightseeing, dining, and short stays close to the action.",
      "Family stays should focus on comfort, space, and practical facilities.",
      "Business travel works best with easy transport access and reliable comfort.",
      "Compare room options, check cancellation terms, and review the final price before booking.",
      "Choose the stay that fits your trip, budget, and comfort level best.",
    ],
  },
};

const GUIDE_CARDS = [
  {
    title: "City Breaks",
    text: "Great for sightseeing, dining, and short stays close to the action.",
  },
  {
    title: "Family Stays",
    text: "Choose comfort, space, and practical facilities for everyone travelling.",
  },
  {
    title: "Business Travel",
    text: "Look for easy transport access, reliable comfort, and convenient locations.",
  },
  {
    title: "Smart Booking Tips",
    text: "Compare room options, check cancellation terms, and review the final price before booking.",
  },
];

const FAQ_CARDS = [
  {
    q: "How do I book a hotel?",
    a: "Search for your destination, compare the options, choose the stay that suits you best, and continue securely with a trusted booking partner.",
  },
  {
    q: "Are bookings secure?",
    a: "Yes. Booking continues through trusted partners using their secure booking process.",
  },
  {
    q: "Can I cancel or change a booking?",
    a: "Cancellation and change options depend on the hotel and the booking partner terms shown before you confirm.",
  },
  {
    q: "Do prices stay the same?",
    a: "Prices can change depending on dates, room availability, and demand, so it is best to book once you find the right option.",
  },
];

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

export default function App() {
  const [page, setPage] = useState("home");
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [results, setResults] = useState([]);
  const [searchState, setSearchState] = useState({
    loading: false,
    error: "",
  });
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [form, setForm] = useState({
    destination: "London",
    country: "United Kingdom",
    city: "",
    location: "",
    checkIn: "25/04/2026",
    checkOut: "26/04/2026",
    guests: "1",
    rooms: "1",
    guestName: "",
    guestEmail: "",
    selectedHotelPrice: "",
    satisfaction: "",
    recommend: "",
  });

  const recommended = useMemo(() => {
    if (results.length === 0) {
      return [
        "Choose the features that matter most, then search for stays that match your trip.",
        "Explore more hotel options, compare with confidence, and book with trusted partners.",
        "A smoother search makes it easier to find a stay you will want to return to.",
      ];
    }

    return results.slice(0, 3).map((hotel) => {
      const location = hotel.location || hotel.city || hotel.country || "your destination";
      return `${hotel.name} — ${location}`;
    });
  }, [results]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleFacility = (facility) => {
    setSelectedFacilities((prev) =>
      prev.includes(facility)
        ? prev.filter((item) => item !== facility)
        : [...prev, facility]
    );
  };

  const normalizeHotels = (payload) => {
    const candidates = Array.isArray(payload)
      ? payload
      : payload?.items ||
        payload?.hotels ||
        payload?.results ||
        payload?.data ||
        [];

    if (!Array.isArray(candidates)) {
      return [];
    }

    return candidates
      .map((item, index) => ({
        id: String(item?.id || index + 1),
        name: String(item?.name || `Hotel ${index + 1}`),
        location: String(item?.location || item?.area || item?.city || ""),
        city: String(item?.city || ""),
        country: String(item?.country || ""),
        address: String(item?.address || ""),
        price:
          item?.price !== undefined && item?.price !== null
            ? `£${item.price}`
            : "See final partner price",
        short: String(
          item?.summary ||
            item?.description ||
            "Compare this stay with other available choices."
        ),
        description: String(
          item?.summary ||
            item?.description ||
            "Compare this stay with other available choices."
        ),
        bookingUrl: String(item?.bookingUrl || item?.booking_url || item?.url || ""),
        image: String(item?.image || ""),
        facilities: Array.isArray(item?.facilities)
          ? item.facilities.map((entry) => String(entry))
          : [],
        rating:
          item?.rating !== undefined && item?.rating !== null
            ? String(item.rating)
            : "",
      }))
      .filter((hotel) => hotel.name);
  };

  const fetchHotels = async () => {
    const query = new URLSearchParams({
      destination: form.destination,
      country: form.country,
      city: form.city,
      location: form.location,
      page: "1",
      page_size: "60",
      facilities: selectedFacilities.join(","),
    }).toString();

    const url = `${API_BASE}/api/hotels?${query}`;
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Search service responded with ${response.status}.`);
    }

    const data = await response.json();
    return normalizeHotels(data);
  };

  const handleSearch = async () => {
    setSearchState({ loading: true, error: "" });
    setSelectedHotel(null);
    setResults([]);
    setForm((prev) => ({ ...prev, selectedHotelPrice: "" }));

    try {
      const hotels = await fetchHotels();
      setResults(hotels);

      if (hotels.length === 0) {
        setSearchState({
          loading: false,
          error:
            "No hotels were returned for this search. Try a broader destination or fewer filters.",
        });
        return;
      }

      setSearchState({ loading: false, error: "" });
    } catch (error) {
      setSearchState({
        loading: false,
        error:
          error?.message ||
          `Unable to connect to the hotel search service at ${API_BASE}.`,
      });
    }
  };

  const handleSelectHotel = (hotel) => {
    setSelectedHotel(hotel);
    setForm((prev) => ({
      ...prev,
      selectedHotelPrice: hotel.price,
    }));
  };

  const handleContinueBooking = () => {
    if (!selectedHotel?.bookingUrl) {
      alert(
        "This hotel does not currently provide a direct partner booking link."
      );
      return;
    }

    window.open(selectedHotel.bookingUrl, "_blank", "noopener,noreferrer");
  };

  if (page !== "home") {
    const active = INFO_PAGES[page];
    return (
      <div style={styles.subPageShell}>
        <div style={styles.subPageWrap}>
          <div style={styles.subTopBar}>
            <button style={styles.backButton} onClick={() => setPage("home")}>
              Back to Portal
            </button>
          </div>

          <div style={styles.subHero}>
            <div style={styles.subKicker}>{active.kicker}</div>
            <h1 style={styles.subTitle}>{active.title}</h1>
            <p style={styles.subIntro}>{active.intro}</p>
          </div>

          <div style={styles.subListGrid}>
            {active.bullets.map((item) => (
              <div key={item} style={styles.subItem}>
                <div style={styles.subDot}>•</div>
                <div style={styles.subText}>{item}</div>
              </div>
            ))}
          </div>

          {page === "faq" && (
            <div style={styles.subCardsGrid}>
              {FAQ_CARDS.map((item) => (
                <div key={item.q} style={styles.subInfoCard}>
                  <div style={styles.subInfoTitle}>{item.q}</div>
                  <div style={styles.subInfoText}>{item.a}</div>
                </div>
              ))}
            </div>
          )}

          {page === "etg" && (
            <div style={styles.subCardsGrid}>
              {GUIDE_CARDS.map((item) => (
                <div key={item.title} style={styles.subInfoCard}>
                  <div style={styles.subInfoTitle}>{item.title}</div>
                  <div style={styles.subInfoText}>{item.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appShell}>
      <div style={styles.bgGlowTop} />
      <div style={styles.bgGlowBottom} />

      <div style={styles.container}>
        <section style={styles.topBanner}>
          <div style={styles.topLeft}>
            <div style={styles.kickerLight}>WORLDWIDE HOTEL BOOKINGS</div>
            <h1 style={styles.brandTitle}>My Space Hotel</h1>
            <p style={styles.topText}>
              Discover outstanding places to stay, enjoy a smoother search, and book with confidence through trusted partners.
            </p>

            <div style={styles.topActions}>
              <button style={styles.etgButton} onClick={() => setPage("etg")}>
                Explore Travel Guides
              </button>
              <button style={styles.faqButton} onClick={() => setPage("faq")}>
                Frequently Asked Questions
              </button>
              <button style={styles.supportButton} onClick={() => setPage("support")}>
                Customer Support
              </button>
            </div>
          </div>

          <div style={styles.topHighlight}>
            <div style={styles.topHighlightValue}>{results.length}</div>
            <div style={styles.topHighlightText}>
              hotels currently loaded from your connected live search database
            </div>
          </div>
        </section>

        <section style={styles.priorityStrip}>
          <div style={styles.priorityHeader}>
            <div>
              <div style={styles.kickerDarkOnLight}>CHOOSE WHAT MATTERS MOST</div>
              <h2 style={styles.priorityTitle}>Start with the features that matter to you most</h2>
            </div>
            <div style={styles.priorityHint}>
              Pick your preferred facilities first, then search for stays that match your trip.
            </div>
          </div>

          <div style={styles.facilitiesGridCompact}>
            {FACILITIES.map((facility) => {
              const active = selectedFacilities.includes(facility);
              return (
                <button
                  key={facility}
                  style={active ? styles.facilityChipActive : styles.facilityChip}
                  onClick={() => toggleFacility(facility)}
                >
                  {facility}
                </button>
              );
            })}
          </div>
        </section>

        <section style={styles.heroGrid}>
          <div style={styles.heroPanel}>
            <div style={styles.heroTopRow}>
              <div>
                <div style={styles.kickerDark}>FIND YOUR STAY</div>
                <h2 style={styles.heroTitle}>Find a stay worth coming back to</h2>
                <p style={styles.heroText}>
                  Search more hotel options, compare with ease, and choose the stay that feels right for your next trip.
                </p>
              </div>

              <div style={styles.heroBadge}>
                <div style={styles.heroBadgeNumber}>{selectedHotel ? "1" : "0"}</div>
                <div style={styles.heroBadgeText}>stay selected</div>
              </div>
            </div>

            <div style={styles.statsGrid}>
              <StatCard label="Loaded Results" value={String(results.length)} />
              <StatCard
                label="Selected Hotel"
                value={selectedHotel ? selectedHotel.name : "None"}
                small
              />
              <StatCard
                label="Direct Booking Link"
                value={selectedHotel?.bookingUrl ? "Available" : "Not yet"}
              />
            </div>
          </div>

          <div style={styles.searchPanel}>
            <div style={styles.kickerDark}>SEARCH</div>
            <h3 style={styles.searchTitle}>Search hotels</h3>

            <input
              style={styles.fullInputDark}
              value={form.destination}
              onChange={(e) => updateField("destination", e.target.value)}
              placeholder="Destination"
            />

            <div style={styles.gridTwo}>
              <input
                style={styles.inputDark}
                value={form.country}
                onChange={(e) => updateField("country", e.target.value)}
                placeholder="Country"
              />
              <input
                style={styles.inputDark}
                value={form.city}
                onChange={(e) => updateField("city", e.target.value)}
                placeholder="City"
              />
            </div>

            <input
              style={styles.fullInputDark}
              value={form.location}
              onChange={(e) => updateField("location", e.target.value)}
              placeholder="Area or location"
            />

            <div style={styles.gridThree}>
              <input
                style={styles.inputDark}
                value={form.checkIn}
                onChange={(e) => updateField("checkIn", e.target.value)}
                placeholder="Check-in"
              />
              <input
                style={styles.inputDark}
                value={form.checkOut}
                onChange={(e) => updateField("checkOut", e.target.value)}
                placeholder="Check-out"
              />
              <input
                style={styles.inputDark}
                value={form.guests}
                onChange={(e) => updateField("guests", e.target.value)}
                placeholder="Guests"
              />
            </div>

            <div style={styles.gridTwo}>
              <input
                style={styles.inputDark}
                value={form.rooms}
                onChange={(e) => updateField("rooms", e.target.value)}
                placeholder="Rooms"
              />
              <button
                style={styles.searchButton}
                onClick={handleSearch}
                disabled={searchState.loading}
              >
                {searchState.loading ? "Searching..." : "Search Hotels"}
              </button>
            </div>

            <div style={styles.searchMessage}>
              More choice, clearer comparisons, and a faster path to booking with trusted partners.
            </div>

            {searchState.error ? <div style={styles.errorBox}>{searchState.error}</div> : null}
          </div>
        </section>

        <section style={styles.quickLinksGrid}>
          <QuickLinkCard
            title="Terms and Conditions"
            text="Review important booking details before you continue."
            variant="yellow"
            onClick={() => setPage("terms")}
          />
          <QuickLinkCard
            title="Cancellation Policy"
            text="Check the cancellation rules for your chosen stay."
            variant="blue"
            onClick={() => setPage("cancellation")}
          />
          <QuickLinkCard
            title="Booking Protection"
            text="Use correct guest details and book with confidence."
            variant="green"
            onClick={() => setPage("protection")}
          />
        </section>

        <section style={styles.mainCompactGrid}>
          <div style={styles.leftStack}>
            <div style={styles.whiteCardCompact}>
              <div style={styles.cardHeaderRow}>
                <div>
                  <div style={styles.kickerLight}>PROPERTY OVERVIEW</div>
                  <h3 style={styles.cardTitle}>Preview your chosen stay</h3>
                </div>
                <div style={styles.resultsCount}>
                  {selectedHotel ? "Ready to book" : "Choose a hotel"}
                </div>
              </div>

              <div style={styles.overviewGrid}>
                <div style={styles.previewPanel}>
                  {selectedHotel ? (
                    <div style={styles.previewWrap}>
                      {selectedHotel.image ? (
                        <img
                          src={selectedHotel.image}
                          alt={selectedHotel.name}
                          style={styles.previewImage}
                        />
                      ) : (
                        <div style={styles.previewImagePlaceholder}>Hotel image</div>
                      )}

                      <div style={styles.previewHotelName}>{selectedHotel.name}</div>
                      <div style={styles.previewHotelArea}>
                        {[selectedHotel.location, selectedHotel.address].filter(Boolean).join(" • ")}
                      </div>
                      <div style={styles.previewHotelSummary}>{selectedHotel.description}</div>
                      <div style={styles.previewMetaRow}>
                        <div style={styles.previewHotelPrice}>{selectedHotel.price}</div>
                        {selectedHotel.rating ? (
                          <div style={styles.ratingBadge}>Rating {selectedHotel.rating}</div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div style={styles.placeholderText}>
                      Search and choose a hotel to preview real stay details from the connected database.
                    </div>
                  )}
                </div>

                <div style={styles.mapPanel}>
                  <div style={styles.mapBadge}>Stay details</div>
                  {selectedHotel ? (
                    <div>
                      <div style={styles.mapTextLine}>
                        <strong>Location:</strong> {selectedHotel.location || "Not provided"}
                      </div>
                      <div style={styles.mapTextLine}>
                        <strong>City:</strong> {selectedHotel.city || "Not provided"}
                      </div>
                      <div style={styles.mapTextLine}>
                        <strong>Country:</strong> {selectedHotel.country || "Not provided"}
                      </div>
                      <div style={styles.mapTextLine}>
                        <strong>Address:</strong> {selectedHotel.address || "Not provided"}
                      </div>
                      <div style={styles.mapTextLine}>
                        <strong>Booking link:</strong>{" "}
                        {selectedHotel.bookingUrl ? "Available" : "Not supplied by search service"}
                      </div>
                    </div>
                  ) : (
                    <div style={styles.mapText}>
                      Choose a hotel to see its location and booking details here.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={styles.whiteCardCompact}>
              <div style={styles.kickerLight}>RECOMMENDED FOR YOU</div>
              <h3 style={styles.cardTitle}>Helpful next choices</h3>

              <div style={styles.recommendedGrid}>
                {recommended.map((item) => (
                  <div key={item} style={styles.recommendedItem}>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={styles.rightStack}>
            <div style={styles.whiteCardCompact}>
              <div style={styles.kickerLight}>RESULTS</div>
              <div style={styles.resultsHeaderRow}>
                <h3 style={styles.cardTitle}>Available hotels</h3>
                <div style={styles.resultsCount}>{results.length} shown</div>
              </div>

              <div style={styles.resultsBoxCompact}>
                {searchState.loading ? (
                  <div style={styles.noResultsBox}>Searching connected hotel database...</div>
                ) : results.length === 0 ? (
                  <div style={styles.noResultsBox}>
                    No hotel options are being shown yet. Search to load real results from your connected hotel database.
                  </div>
                ) : (
                  results.map((hotel) => (
                    <div
                      key={hotel.id}
                      style={
                        selectedHotel && selectedHotel.id === hotel.id
                          ? styles.resultCardSelected
                          : styles.resultCard
                      }
                    >
                      <div style={styles.resultHeader}>
                        <div>
                          <div style={styles.resultName}>{hotel.name}</div>
                          <div style={styles.resultArea}>
                            {[hotel.location, hotel.city].filter(Boolean).join(" • ")}
                          </div>
                        </div>
                        <div style={styles.resultPrice}>{hotel.price}</div>
                      </div>

                      <div style={styles.resultSummary}>{hotel.short}</div>

                      <div style={styles.resultButtonRow}>
                        <button
                          style={styles.chooseStayButton}
                          onClick={() => handleSelectHotel(hotel)}
                        >
                          Choose This Stay
                        </button>

                        {hotel.bookingUrl ? (
                          <button
                            style={styles.partnerMiniButton}
                            onClick={() =>
                              window.open(
                                hotel.bookingUrl,
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            Partner Link
                          </button>
                        ) : (
                          <div style={styles.noLinkText}>No link</div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={styles.bookingCard}>
              <div style={styles.bookingTop}>
                <div>
                  <div style={styles.kickerBooking}>RESERVATION AND BOOKING</div>
                  <h3 style={styles.bookingTitle}>Guest information</h3>
                </div>
                <div style={styles.bookingPill}>
                  {selectedHotel ? "Stay selected" : "Choose a stay"}
                </div>
              </div>

              <div style={styles.gridTwo}>
                <input
                  style={styles.fullInputLight}
                  value={form.guestName}
                  onChange={(e) => updateField("guestName", e.target.value)}
                  placeholder="Guest name"
                />
                <input
                  style={styles.fullInputLight}
                  value={form.guestEmail}
                  onChange={(e) => updateField("guestEmail", e.target.value)}
                  placeholder="Guest email"
                />
              </div>

              <input
                style={styles.fullInputLight}
                value={form.selectedHotelPrice}
                onChange={(e) => updateField("selectedHotelPrice", e.target.value)}
                placeholder="Selected hotel price"
              />

              <button
                style={
                  selectedHotel?.bookingUrl
                    ? styles.bookingButton
                    : styles.bookingButtonDisabled
                }
                onClick={handleContinueBooking}
              >
                {selectedHotel?.bookingUrl
                  ? "Continue to Booking Partner"
                  : "Choose a hotel with a partner link"}
              </button>

              <div style={styles.bookingNote}>
                Continue only when a real partner booking link is supplied by your connected hotel database.
              </div>
            </div>

            <div style={styles.whiteCardCompact}>
              <div style={styles.kickerLight}>CUSTOMER SATISFACTION</div>
              <h3 style={styles.cardTitle}>Help us improve your experience</h3>

              <div style={styles.gridTwo}>
                <select
                  style={styles.fullInputLight}
                  value={form.satisfaction}
                  onChange={(e) => updateField("satisfaction", e.target.value)}
                >
                  <option value="">Overall satisfaction</option>
                  <option value="excellent">Excellent</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>

                <select
                  style={styles.fullInputLight}
                  value={form.recommend}
                  onChange={(e) => updateField("recommend", e.target.value)}
                >
                  <option value="">Would you recommend us?</option>
                  <option value="yes">Yes</option>
                  <option value="maybe">Maybe</option>
                  <option value="no">No</option>
                </select>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, small = false }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={small ? styles.statValueSmall : styles.statValue}>{value}</div>
    </div>
  );
}

function QuickLinkCard({ title, text, variant, onClick }) {
  const variantStyle = {
    yellow: styles.quickYellow,
    blue: styles.quickBlue,
    green: styles.quickGreen,
  }[variant];

  return (
    <button style={{ ...styles.quickCard, ...variantStyle }} onClick={onClick}>
      <div style={styles.quickCardTitle}>{title}</div>
      <div style={styles.quickCardText}>{text}</div>
      <div style={styles.quickCardAction}>Open page</div>
    </button>
  );
}

const styles = {
  appShell: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(79, 70, 229, 0.08), transparent 28%), radial-gradient(circle at bottom right, rgba(6, 182, 212, 0.08), transparent 28%), #eef3f9",
    padding: "14px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: "#0b1736",
    position: "relative",
    overflow: "hidden",
  },

  bgGlowTop: {
    position: "absolute",
    top: "-80px",
    right: "-80px",
    width: "260px",
    height: "260px",
    borderRadius: "999px",
    background: "rgba(59, 130, 246, 0.10)",
    filter: "blur(40px)",
    pointerEvents: "none",
  },

  bgGlowBottom: {
    position: "absolute",
    bottom: "-80px",
    left: "-80px",
    width: "240px",
    height: "240px",
    borderRadius: "999px",
    background: "rgba(34, 197, 94, 0.08)",
    filter: "blur(36px)",
    pointerEvents: "none",
  },

  container: {
    maxWidth: "1520px",
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },

  topBanner: {
    background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(213, 223, 236, 0.9)",
    borderRadius: "24px",
    padding: "18px 20px",
    display: "grid",
    gridTemplateColumns: "1.2fr 0.36fr",
    gap: "14px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    marginBottom: "12px",
    backdropFilter: "blur(8px)",
    alignItems: "center",
  },

  topLeft: {
    minWidth: 0,
  },

  topHighlight: {
    background: "linear-gradient(135deg, #0f2c74 0%, #1a4bbb 100%)",
    color: "#ffffff",
    borderRadius: "20px",
    padding: "16px",
    boxShadow: "0 12px 24px rgba(26, 75, 187, 0.22)",
  },

  topHighlightValue: {
    fontSize: "38px",
    fontWeight: 900,
    lineHeight: 1,
    marginBottom: "8px",
  },

  topHighlightText: {
    fontSize: "14px",
    lineHeight: 1.45,
    color: "#d8e4ff",
  },

  kickerLight: {
    fontSize: "12px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#5e7697",
    marginBottom: "8px",
    fontWeight: 700,
  },

  kickerDarkOnLight: {
    fontSize: "12px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#4874b8",
    marginBottom: "8px",
    fontWeight: 700,
  },

  kickerDark: {
    fontSize: "12px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#dbe7ff",
    marginBottom: "8px",
    fontWeight: 700,
  },

  brandTitle: {
    margin: "0 0 8px 0",
    fontSize: "34px",
    fontWeight: 900,
    color: "#081b42",
    lineHeight: 1.05,
  },

  topText: {
    margin: 0,
    fontSize: "16px",
    lineHeight: 1.55,
    color: "#4f6485",
    maxWidth: "820px",
  },

  topActions: {
    display: "flex",
    gap: "10px",
    marginTop: "14px",
    flexWrap: "wrap",
  },

  etgButton: {
    border: "none",
    background: "linear-gradient(135deg, #f8d56a 0%, #f2c94c 100%)",
    color: "#2c2200",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(242, 201, 76, 0.25)",
  },

  faqButton: {
    border: "1px solid #b3c8e8",
    background: "linear-gradient(135deg, #e7f0fe 0%, #d7e8ff 100%)",
    color: "#1e467f",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  supportButton: {
    border: "none",
    background: "linear-gradient(135deg, #2f67e6 0%, #2350c6 100%)",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(47, 103, 230, 0.18)",
  },

  priorityStrip: {
    background: "linear-gradient(135deg, #ffffff 0%, #f6fbff 100%)",
    border: "1px solid #dce7f5",
    borderRadius: "24px",
    padding: "16px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    marginBottom: "12px",
  },

  priorityHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: "10px",
    marginBottom: "12px",
    flexWrap: "wrap",
  },

  priorityTitle: {
    margin: 0,
    fontSize: "26px",
    fontWeight: 900,
    color: "#081b42",
    lineHeight: 1.1,
  },

  priorityHint: {
    maxWidth: "360px",
    fontSize: "14px",
    color: "#5b7191",
    lineHeight: 1.45,
  },

  heroGrid: {
    display: "grid",
    gridTemplateColumns: "1.05fr 0.95fr",
    gap: "12px",
    marginBottom: "12px",
  },

  heroPanel: {
    background: "linear-gradient(135deg, #102972 0%, #11286d 55%, #15358a 100%)",
    borderRadius: "24px",
    padding: "18px",
    color: "#ffffff",
    boxShadow: "0 14px 28px rgba(18, 44, 121, 0.18)",
  },

  searchPanel: {
    background: "linear-gradient(135deg, #102972 0%, #11286d 55%, #15358a 100%)",
    borderRadius: "24px",
    padding: "18px",
    color: "#ffffff",
    boxShadow: "0 14px 28px rgba(18, 44, 121, 0.18)",
  },

  heroTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    alignItems: "flex-start",
    marginBottom: "14px",
  },

  heroBadge: {
    minWidth: "118px",
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "18px",
    padding: "12px",
    textAlign: "center",
  },

  heroBadgeNumber: {
    fontSize: "30px",
    fontWeight: 900,
    lineHeight: 1,
    marginBottom: "6px",
  },

  heroBadgeText: {
    fontSize: "12px",
    color: "#dbe7ff",
    lineHeight: 1.3,
  },

  heroTitle: {
    margin: "0 0 8px 0",
    fontSize: "46px",
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: "-0.04em",
  },

  heroText: {
    margin: 0,
    fontSize: "16px",
    lineHeight: 1.5,
    color: "#e4ecff",
    maxWidth: "660px",
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
  },

  statCard: {
    background: "rgba(255,255,255,0.10)",
    borderRadius: "16px",
    padding: "13px",
  },

  statLabel: {
    fontSize: "13px",
    color: "#dce7ff",
    marginBottom: "6px",
  },

  statValue: {
    fontSize: "20px",
    fontWeight: 900,
    color: "#ffffff",
    lineHeight: 1.15,
  },

  statValueSmall: {
    fontSize: "16px",
    fontWeight: 900,
    color: "#ffffff",
    lineHeight: 1.25,
    wordBreak: "break-word",
  },

  searchTitle: {
    margin: "0 0 10px 0",
    fontSize: "26px",
    fontWeight: 900,
    color: "#ffffff",
  },

  fullInputDark: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "12px",
    padding: "13px 14px",
    fontSize: "15px",
    background: "rgba(255,255,255,0.10)",
    color: "#ffffff",
    outline: "none",
    marginBottom: "10px",
  },

  inputDark: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "12px",
    padding: "13px 14px",
    fontSize: "15px",
    background: "rgba(255,255,255,0.10)",
    color: "#ffffff",
    outline: "none",
  },

  fullInputLight: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d7e1ee",
    borderRadius: "12px",
    padding: "13px 14px",
    fontSize: "15px",
    background: "#f8fbff",
    color: "#173154",
    outline: "none",
    marginBottom: "10px",
  },

  gridTwo: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginBottom: "10px",
  },

  gridThree: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "10px",
  },

  searchButton: {
    width: "100%",
    border: "none",
    borderRadius: "12px",
    padding: "13px 14px",
    background: "linear-gradient(90deg, #2f67e6 0%, #25c1df 100%)",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(47, 103, 230, 0.20)",
  },

  searchMessage: {
    background: "rgba(255,255,255,0.08)",
    borderRadius: "14px",
    padding: "12px",
    color: "#ecf2ff",
    fontSize: "14px",
    lineHeight: 1.45,
  },

  errorBox: {
    marginTop: "10px",
    background: "rgba(255, 214, 214, 0.16)",
    border: "1px solid rgba(255, 214, 214, 0.28)",
    color: "#ffe6e6",
    borderRadius: "12px",
    padding: "12px",
    fontSize: "14px",
    lineHeight: 1.45,
  },

  quickLinksGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "12px",
  },

  quickCard: {
    border: "none",
    borderRadius: "18px",
    padding: "14px",
    textAlign: "left",
    cursor: "pointer",
    minHeight: "106px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    boxShadow: "0 10px 20px rgba(15, 23, 42, 0.08)",
  },

  quickYellow: {
    background: "linear-gradient(135deg, #ffe28a 0%, #f2c94c 100%)",
    color: "#4b3600",
  },

  quickBlue: {
    background: "linear-gradient(135deg, #cfe4ff 0%, #8fb9ff 100%)",
    color: "#103463",
  },

  quickGreen: {
    background: "linear-gradient(135deg, #d6f7df 0%, #8dd8a0 100%)",
    color: "#124324",
  },

  quickCardTitle: {
    fontSize: "17px",
    fontWeight: 900,
    lineHeight: 1.15,
    marginBottom: "6px",
  },

  quickCardText: {
    fontSize: "13px",
    lineHeight: 1.45,
  },

  quickCardAction: {
    fontSize: "13px",
    fontWeight: 900,
    marginTop: "8px",
  },

  mainCompactGrid: {
    display: "grid",
    gridTemplateColumns: "1.05fr 0.95fr",
    gap: "12px",
  },

  leftStack: {
    display: "grid",
    gap: "12px",
  },

  rightStack: {
    display: "grid",
    gap: "12px",
  },

  whiteCardCompact: {
    background: "rgba(255,255,255,0.94)",
    border: "1px solid rgba(213, 223, 236, 0.9)",
    borderRadius: "22px",
    padding: "16px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
    backdropFilter: "blur(8px)",
  },

  bookingCard: {
    background: "linear-gradient(135deg, #ffffff 0%, #f6fbff 100%)",
    border: "1px solid #d7e6f5",
    borderRadius: "22px",
    padding: "16px",
    boxShadow: "0 12px 24px rgba(37, 99, 235, 0.08)",
  },

  bookingTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "flex-start",
    marginBottom: "10px",
  },

  kickerBooking: {
    fontSize: "12px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#4d74b8",
    marginBottom: "8px",
    fontWeight: 700,
  },

  bookingTitle: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 900,
    color: "#081b42",
  },

  bookingPill: {
    background: "#eaf3ff",
    color: "#1f56ab",
    borderRadius: "999px",
    padding: "8px 10px",
    fontSize: "12px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  bookingButton: {
    width: "100%",
    border: "none",
    borderRadius: "12px",
    padding: "14px 15px",
    marginTop: "2px",
    marginBottom: "8px",
    background: "linear-gradient(90deg, #2f67e6 0%, #25c1df 100%)",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 20px rgba(47, 103, 230, 0.16)",
  },

  bookingButtonDisabled: {
    width: "100%",
    border: "none",
    borderRadius: "12px",
    padding: "14px 15px",
    marginTop: "2px",
    marginBottom: "8px",
    background: "#bfcbdc",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 900,
    cursor: "not-allowed",
  },

  bookingNote: {
    fontSize: "14px",
    color: "#567090",
    lineHeight: 1.5,
  },

  cardHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
    marginBottom: "10px",
  },

  resultsHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    alignItems: "center",
    marginBottom: "8px",
  },

  resultsCount: {
    background: "#edf4ff",
    color: "#2b5faf",
    borderRadius: "999px",
    padding: "7px 10px",
    fontSize: "12px",
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  cardTitle: {
    margin: 0,
    fontSize: "22px",
    fontWeight: 900,
    color: "#081b42",
    lineHeight: 1.15,
  },

  overviewGrid: {
    display: "grid",
    gridTemplateColumns: "1.05fr 0.95fr",
    gap: "10px",
  },

  previewPanel: {
    minHeight: "260px",
    background: "linear-gradient(135deg, #f6f9fd 0%, #eef5fc 100%)",
    border: "1px solid #dce5f1",
    borderRadius: "16px",
    padding: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  previewWrap: {
    width: "100%",
  },

  previewImage: {
    width: "100%",
    height: "130px",
    objectFit: "cover",
    borderRadius: "12px",
    marginBottom: "10px",
    display: "block",
  },

  previewImagePlaceholder: {
    width: "100%",
    height: "130px",
    borderRadius: "12px",
    marginBottom: "10px",
    background: "linear-gradient(135deg, #dbe8f8 0%, #eef5ff 100%)",
    color: "#52729b",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: 700,
  },

  mapPanel: {
    minHeight: "260px",
    background: "linear-gradient(135deg, #f8fbff 0%, #f0f7ff 100%)",
    border: "1px solid #dce5f1",
    borderRadius: "16px",
    padding: "14px",
  },

  placeholderText: {
    textAlign: "center",
    color: "#667b9a",
    fontSize: "15px",
    lineHeight: 1.5,
  },

  previewHotelName: {
    fontSize: "21px",
    fontWeight: 900,
    color: "#0d2149",
    marginBottom: "8px",
  },

  previewHotelArea: {
    color: "#567090",
    marginBottom: "10px",
    fontSize: "14px",
    lineHeight: 1.45,
  },

  previewHotelSummary: {
    color: "#4e6485",
    lineHeight: 1.55,
    marginBottom: "12px",
    fontSize: "14px",
  },

  previewMetaRow: {
    display: "flex",
    gap: "10px",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },

  previewHotelPrice: {
    fontSize: "17px",
    fontWeight: 900,
    color: "#1e5bc8",
  },

  ratingBadge: {
    background: "#e9f7ee",
    color: "#1d7a39",
    borderRadius: "999px",
    padding: "6px 10px",
    fontSize: "12px",
    fontWeight: 800,
  },

  mapBadge: {
    display: "inline-flex",
    padding: "7px 10px",
    borderRadius: "999px",
    background: "#eaf3ff",
    color: "#3362a1",
    fontSize: "12px",
    fontWeight: 800,
    marginBottom: "10px",
  },

  mapText: {
    color: "#657c9b",
    fontSize: "14px",
    lineHeight: 1.55,
  },

  mapTextLine: {
    color: "#516a8c",
    fontSize: "14px",
    lineHeight: 1.6,
    marginBottom: "8px",
  },

  resultsBoxCompact: {
    minHeight: "380px",
    maxHeight: "380px",
    overflowY: "auto",
    display: "grid",
    gap: "10px",
    paddingRight: "4px",
  },

  noResultsBox: {
    minHeight: "180px",
    background: "linear-gradient(135deg, #f6f9fd 0%, #eef5fc 100%)",
    border: "1px solid #dce5f1",
    borderRadius: "16px",
    color: "#667b9a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "15px",
    textAlign: "center",
    padding: "14px",
    lineHeight: 1.5,
  },

  resultCard: {
    background: "#f7fbff",
    border: "1px solid #dce5f1",
    borderRadius: "14px",
    padding: "13px",
  },

  resultCardSelected: {
    background: "#eaf1ff",
    border: "1px solid #8aaef1",
    borderRadius: "14px",
    padding: "13px",
  },

  resultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "8px",
  },

  resultName: {
    fontSize: "17px",
    fontWeight: 900,
    color: "#102347",
    marginBottom: "4px",
  },

  resultArea: {
    fontSize: "13px",
    color: "#607692",
    lineHeight: 1.45,
  },

  resultPrice: {
    fontSize: "14px",
    fontWeight: 900,
    color: "#1e5bc8",
  },

  resultSummary: {
    fontSize: "14px",
    color: "#556b8b",
    lineHeight: 1.5,
    marginBottom: "10px",
  },

  resultButtonRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    flexWrap: "wrap",
  },

  chooseStayButton: {
    border: "none",
    background: "linear-gradient(135deg, #2f67e6 0%, #1f56c8 100%)",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },

  partnerMiniButton: {
    border: "1px solid #cde0ff",
    background: "#eef5ff",
    color: "#2854a2",
    borderRadius: "10px",
    padding: "10px 12px",
    fontSize: "13px",
    fontWeight: 800,
    cursor: "pointer",
  },

  noLinkText: {
    color: "#7f91aa",
    fontSize: "13px",
    fontWeight: 700,
  },

  recommendedGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "10px",
  },

  recommendedItem: {
    background: "linear-gradient(135deg, #f7fbff 0%, #eef6ff 100%)",
    border: "1px solid #d8e2f0",
    borderRadius: "14px",
    padding: "12px",
    color: "#41587a",
    fontSize: "14px",
    lineHeight: 1.45,
    fontWeight: 600,
  },

  facilitiesGridCompact: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "10px",
  },

  facilityChip: {
    border: "1px solid #dce7f5",
    background: "#f6faff",
    color: "#24406b",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
    textAlign: "center",
  },

  facilityChipActive: {
    border: "1px solid #7da8ea",
    background: "linear-gradient(135deg, #e8f2ff 0%, #d7e8ff 100%)",
    color: "#143d7c",
    borderRadius: "12px",
    padding: "12px 14px",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
    textAlign: "center",
    boxShadow: "0 8px 18px rgba(47, 103, 230, 0.10)",
  },

  subPageShell: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(79, 70, 229, 0.08), transparent 28%), radial-gradient(circle at bottom right, rgba(6, 182, 212, 0.08), transparent 28%), #eef3f9",
    padding: "16px",
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  subPageWrap: {
    maxWidth: "1120px",
    margin: "0 auto",
    background: "rgba(255,255,255,0.95)",
    border: "1px solid rgba(213, 223, 236, 0.9)",
    borderRadius: "24px",
    padding: "18px",
    boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
  },

  subTopBar: {
    display: "flex",
    justifyContent: "flex-start",
    marginBottom: "10px",
  },

  backButton: {
    border: "none",
    background: "linear-gradient(135deg, #2f67e6 0%, #2350c6 100%)",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "11px 14px",
    fontSize: "14px",
    fontWeight: 800,
    cursor: "pointer",
  },

  subHero: {
    marginBottom: "14px",
  },

  subKicker: {
    fontSize: "12px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "#5e7697",
    marginBottom: "8px",
    fontWeight: 700,
  },

  subTitle: {
    margin: "0 0 8px 0",
    fontSize: "32px",
    fontWeight: 900,
    color: "#081b42",
  },

  subIntro: {
    margin: 0,
    fontSize: "16px",
    lineHeight: 1.55,
    color: "#586c8d",
    maxWidth: "860px",
  },

  subListGrid: {
    display: "grid",
    gap: "10px",
    marginBottom: "14px",
  },

  subItem: {
    display: "grid",
    gridTemplateColumns: "16px 1fr",
    gap: "10px",
    background: "#f6faff",
    border: "1px solid #dbe4f1",
    borderRadius: "14px",
    padding: "12px 14px",
  },

  subDot: {
    fontSize: "18px",
    fontWeight: 900,
    color: "#2f67e6",
    lineHeight: 1.1,
  },

  subText: {
    fontSize: "14px",
    lineHeight: 1.55,
    color: "#4d6488",
  },

  subCardsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "12px",
  },

  subInfoCard: {
    background: "linear-gradient(135deg, #f7fbff 0%, #eef6ff 100%)",
    border: "1px solid #d8e4f2",
    borderRadius: "16px",
    padding: "14px",
  },

  subInfoTitle: {
    fontSize: "18px",
    fontWeight: 900,
    color: "#0b1f48",
    marginBottom: "8px",
  },

  subInfoText: {
    fontSize: "14px",
    lineHeight: 1.55,
    color: "#4d6488",
  },
};