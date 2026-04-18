"use client";

import { useMemo, useState } from "react";

type Hotel = {
  id: string;
  name: string;
  city: string;
  country: string;
  location: string;
  address: string;
  price: number;
  rating: number;
  image: string;
  lat: number;
  lng: number;
  facilities: string[];
  summary: string;
};

type SearchResponse = {
  items: Hotel[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
  message?: string;
  detail?: string;
};

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "") ||
  "https://hotel-backend-1-ee5z.onrender.com";

const FACILITIES = [
  "Free WiFi",
  "Breakfast included",
  "Parking",
  "Gym",
  "Swimming pool",
  "Airport shuttle",
  "Family rooms",
  "Free cancellation",
];

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function currencyForCountry(country: string) {
  const lowered = (country || "").toLowerCase();
  if (lowered.includes("united kingdom") || lowered.includes("uk")) return "GBP";
  if (
    lowered.includes("france") ||
    lowered.includes("germany") ||
    lowered.includes("italy") ||
    lowered.includes("spain")
  ) {
    return "EUR";
  }
  if (lowered.includes("nigeria")) return "NGN";
  if (lowered.includes("united arab emirates") || lowered.includes("uae")) return "AED";
  return "USD";
}

function formatMoney(value: number, country: string) {
  const currency = currencyForCountry(country);
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value}`;
  }
}

function mapsUrl(hotel: Hotel) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${hotel.name} ${hotel.address}`
  )}`;
}

function hotelKey(hotel: Hotel) {
  return `${hotel.id}|${hotel.name}|${hotel.address}`;
}

export default function HomePage() {
  const [destination, setDestination] = useState("London");
  const [country, setCountry] = useState("United Kingdom");
  const [city, setCity] = useState("");
  const [locationText, setLocationText] = useState("");

  const [checkIn, setCheckIn] = useState(todayPlus(7));
  const [checkOut, setCheckOut] = useState(todayPlus(8));
  const [guests, setGuests] = useState(1);
  const [rooms, setRooms] = useState(1);

  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    "Search a much larger real hotel list, filter your stay, and continue with trusted booking partners."
  );
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selected, setSelected] = useState<Hotel | null>(null);
  const [page, setPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [bookingMessage, setBookingMessage] = useState(
    "You will be redirected to a trusted booking partner to complete your reservation."
  );
  const [surveySatisfaction, setSurveySatisfaction] = useState("");
  const [surveyRecommend, setSurveyRecommend] = useState("");

  const effectiveDestination = useMemo(() => {
    return city.trim() || destination.trim() || locationText.trim() || "London";
  }, [city, destination, locationText]);

  function toggleFacility(facility: string) {
    setSelectedFacilities((current) =>
      current.includes(facility)
        ? current.filter((x) => x !== facility)
        : [...current, facility]
    );
  }

  async function fetchHotels(targetPage: number, append: boolean) {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoadingSearch(true);
      setStatusMessage("Searching live hotel inventory...");
    }

    try {
      const params = new URLSearchParams();
      params.set("destination", effectiveDestination);
      params.set("country", country.trim());
      params.set("city", city.trim() || effectiveDestination);
      params.set("location", locationText.trim());
      params.set("page", String(targetPage));
      params.set("page_size", "24");

      if (selectedFacilities.length > 0) {
        params.set("facilities", selectedFacilities.join(","));
      }

      const response = await fetch(`${API_BASE}/api/hotels?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Backend returned ${response.status}: ${text}`);
      }

      const data: SearchResponse = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];

      if (append) {
        setHotels((current) => {
          const merged = [...current];
          for (const hotel of items) {
            const exists = merged.some((item) => hotelKey(item) === hotelKey(hotel));
            if (!exists) merged.push(hotel);
          }
          return merged;
        });
      } else {
        setHotels(items);
        setSelected(items[0] || null);
      }

      setPage(Number(data.page || targetPage));
      setTotalResults(Number(data.total || 0));
      setHasMore(Boolean(data.has_more));

      if (Number(data.total || 0) > 0) {
        setStatusMessage(
          data.message ||
            `Showing page ${targetPage}. Found ${Number(data.total || 0)} hotel results.`
        );
      } else {
        setStatusMessage(
          data.detail ||
            "No matching hotels were found for this search. Please try another destination."
        );
      }
    } catch (error) {
      console.error("Hotel search failed:", error);
      if (!append) {
        setHotels([]);
        setSelected(null);
        setTotalResults(0);
        setHasMore(false);
      }
      setStatusMessage("Hotel search is temporarily unavailable. Please try again shortly.");
    } finally {
      setLoadingSearch(false);
      setLoadingMore(false);
    }
  }

  async function searchHotels() {
    setPage(1);
    setHasMore(false);
    setTotalResults(0);
    await fetchHotels(1, false);
  }

  async function loadMoreHotels() {
    if (!hasMore || loadingMore) return;
    await fetchHotels(page + 1, true);
  }

  function continueToBookingPartner() {
    if (!selected) {
      setBookingMessage("Please select a hotel before continuing.");
      return;
    }

    if (!guestName.trim()) {
      setBookingMessage("Please enter guest name.");
      return;
    }

    if (!guestEmail.trim()) {
      setBookingMessage("Please enter guest email.");
      return;
    }

    const query = encodeURIComponent(`${selected.name} ${selected.city}`);
    const url = `https://www.google.com/travel/hotels?hl=en&q=${query}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setBookingMessage("Redirecting to trusted booking partner...");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#eef2f7",
        padding: "18px",
        fontFamily: "Arial, sans-serif",
        color: "#0b1628",
      }}
    >
      <div
        style={{
          maxWidth: 1500,
          margin: "0 auto",
          display: "grid",
          gap: 14,
        }}
      >
        <section
          style={{
            background: "#ffffff",
            borderRadius: 24,
            padding: 22,
            boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#546b8b",
                marginBottom: 8,
              }}
            >
              Worldwide hotel reservations
            </div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>My Space Hotel</div>
            <div style={{ color: "#5f6f84", marginTop: 8 }}>
              Search a much larger real hotel list, filter your stay, and continue with trusted booking partners.
            </div>
          </div>

          <button
            type="button"
            style={{
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 16,
              padding: "14px 22px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Contact Support
          </button>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "#0d2667",
              color: "#fff",
              borderRadius: 28,
              padding: 18,
              boxShadow: "0 10px 30px rgba(9,25,71,0.18)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                opacity: 0.9,
                marginBottom: 10,
              }}
            >
              Live real hotel search
            </div>

            <div style={{ fontSize: 38, lineHeight: 1.05, fontWeight: 800, marginBottom: 10 }}>
              Search larger hotel inventories
            </div>

            <div style={{ opacity: 0.92, marginBottom: 16 }}>
              This version searches a broader hotel area and supports pagination, so cities like London are no longer restricted to one tiny batch of results.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              <StatCard label="Loaded Results" value={String(hotels.length)} />
              <StatCard label="Total Found" value={String(totalResults)} />
              <StatCard label="Selected Hotel" value={selected ? selected.name : "None"} />
            </div>
          </div>

          <div
            style={{
              background: "#0d2667",
              color: "#fff",
              borderRadius: 28,
              padding: 18,
              boxShadow: "0 10px 30px rgba(9,25,71,0.18)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                opacity: 0.9,
                marginBottom: 10,
              }}
            >
              Search
            </div>

            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Search hotels</div>

            <div style={{ display: "grid", gap: 10 }}>
              <Input value={destination} onChange={setDestination} placeholder="Destination" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Input value={country} onChange={setCountry} placeholder="Country" />
                <Input value={city} onChange={setCity} placeholder="City" />
                <Input value={locationText} onChange={setLocationText} placeholder="Location" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <DateInput label="Check-in" value={checkIn} onChange={setCheckIn} />
                <DateInput label="Check-out" value={checkOut} onChange={setCheckOut} />
                <NumberInput label="Guests" value={guests} onChange={setGuests} min={1} />
              </div>

              <NumberInput label="Rooms" value={rooms} onChange={setRooms} min={1} />

              <button
                type="button"
                onClick={searchHotels}
                disabled={loadingSearch}
                style={{
                  marginTop: 2,
                  background: "linear-gradient(90deg, #2563eb, #22c1dc)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 16,
                  padding: "16px 20px",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: loadingSearch ? "not-allowed" : "pointer",
                  opacity: loadingSearch ? 0.75 : 1,
                }}
              >
                {loadingSearch ? "Searching..." : "Search Hotels"}
              </button>

              <div
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: "12px 14px",
                  color: "#e4ebff",
                }}
              >
                {statusMessage}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: 28,
            padding: 16,
            boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#6d7e94",
              marginBottom: 8,
            }}
          >
            Preferred facilities
          </div>

          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
            Refine your search before choosing a hotel
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 10,
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
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    borderRadius: 16,
                    border: active ? "2px solid #2563eb" : "1px solid #d8dfeb",
                    background: active ? "#eef4ff" : "#f7f9fc",
                    padding: "14px 16px",
                    cursor: "pointer",
                    fontWeight: 700,
                    color: "#10213d",
                  }}
                >
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 4,
                      border: "1px solid #96a7c2",
                      background: active ? "#2563eb" : "#fff",
                      display: "inline-block",
                    }}
                  />
                  {facility}
                </button>
              );
            })}
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.15fr 1fr",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#6d7e94",
                marginBottom: 8,
              }}
            >
              Property overview
            </div>

            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
              Select a hotel to preview
            </div>

            <div style={{ color: "#6d7e94", marginBottom: 14 }}>
              Search and select a hotel to view full details
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                minHeight: 340,
              }}
            >
              <div
                style={{
                  borderRadius: 18,
                  overflow: "hidden",
                  background: "#eef2f7",
                  border: "1px solid #dbe3ef",
                }}
              >
                {selected ? (
                  <img
                    src={selected.image}
                    alt={selected.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      minHeight: 340,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: "100%",
                      minHeight: 340,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#6d7e94",
                      padding: 20,
                      textAlign: "center",
                    }}
                  >
                    Search and select a hotel to preview full details
                  </div>
                )}
              </div>

              <div
                style={{
                  borderRadius: 18,
                  background: "#f8fafc",
                  border: "1px solid #dbe3ef",
                  padding: 16,
                }}
              >
                <div style={{ fontSize: 14, color: "#6d7e94", marginBottom: 8 }}>Location map</div>

                {selected ? (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>{selected.name}</div>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Location:</strong> {selected.location}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Address:</strong> {selected.address}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Price:</strong> {formatMoney(selected.price, selected.country)} per night
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Rating:</strong> {selected.rating} / 5
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <strong>Facilities:</strong> {selected.facilities.join(", ")}
                    </div>
                    <a
                      href={mapsUrl(selected)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        color: "#2563eb",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Open in Google Maps
                    </a>
                  </>
                ) : (
                  <div style={{ color: "#6d7e94", lineHeight: 1.6 }}>
                    Search and select a hotel to display its Google Cloud location map.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#6d7e94",
                marginBottom: 8,
              }}
            >
              Results
            </div>

            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Available hotels</div>
            <div style={{ color: "#6d7e94", marginBottom: 14 }}>
              Showing {hotels.length} loaded results
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
                maxHeight: 560,
                overflowY: "auto",
                paddingRight: 4,
                marginBottom: 12,
              }}
            >
              {hotels.length === 0 ? (
                <div
                  style={{
                    border: "1px solid #dbe3ef",
                    borderRadius: 18,
                    background: "#f8fafc",
                    minHeight: 180,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#6d7e94",
                    textAlign: "center",
                    padding: 20,
                  }}
                >
                  No hotel options available
                </div>
              ) : (
                hotels.map((hotel, index) => {
                  const isSelected = selected ? hotelKey(selected) === hotelKey(hotel) : false;

                  return (
                    <button
                      key={`${hotel.id}-${index}`}
                      type="button"
                      onClick={() => setSelected(hotel)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr",
                        gap: 12,
                        textAlign: "left",
                        border: isSelected ? "2px solid #2563eb" : "1px solid #dbe3ef",
                        borderRadius: 18,
                        background: isSelected ? "#eef4ff" : "#ffffff",
                        cursor: "pointer",
                        overflow: "hidden",
                        padding: 0,
                      }}
                    >
                      <img
                        src={hotel.image}
                        alt={hotel.name}
                        style={{ width: 120, height: 120, objectFit: "cover" }}
                      />

                      <div style={{ padding: 12 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
                          {hotel.name}
                        </div>
                        <div style={{ color: "#5f6f84", marginBottom: 6 }}>
                          {hotel.location}, {hotel.city}
                        </div>
                        <div style={{ marginBottom: 4 }}>
                          <strong>{formatMoney(hotel.price, hotel.country)}</strong> per night
                        </div>
                        <div>Rating: {hotel.rating} / 5</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={loadMoreHotels}
              disabled={!hasMore || loadingMore}
              style={{
                width: "100%",
                background: hasMore ? "#0d2667" : "#cbd5e1",
                color: "#fff",
                border: "none",
                borderRadius: 16,
                padding: "14px 18px",
                fontWeight: 800,
                cursor: !hasMore || loadingMore ? "not-allowed" : "pointer",
              }}
            >
              {loadingMore ? "Loading more..." : hasMore ? "Load More Hotels" : "No More Hotels"}
            </button>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Terms and Conditions</div>
            <div style={{ color: "#546b8b", lineHeight: 1.6 }}>
              Room rates, taxes, and hotel availability may change before booking is completed. Guests should review dates,
              room type, cancellation rules, and final total before continuing.
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Cancellation Policy</div>
            <div style={{ color: "#546b8b", lineHeight: 1.6 }}>
              Cancellation terms vary by hotel and booking provider. Please review the supplier&apos;s cancellation rules before completing your reservation.
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Booking Protection</div>
            <div style={{ color: "#546b8b", lineHeight: 1.6 }}>
              Booking is completed on trusted partner platforms. Please use valid contact details so your booking provider can send confirmation and stay information.
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Customer Support</div>
            <div style={{ color: "#546b8b", lineHeight: 1.6 }}>
              Support email is not configured yet.
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#6d7e94",
                marginBottom: 8,
              }}
            >
              Recommended stays
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Recommended for you</div>
            <div
              style={{
                minHeight: 130,
                borderRadius: 18,
                border: "1px solid #dbe3ef",
                background: "#f8fafc",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#6d7e94",
                textAlign: "center",
                padding: 20,
              }}
            >
              {hotels.length > 0
                ? `Recommendations are based on ${effectiveDestination} and your selected search preferences.`
                : "Recommendations will appear after search results load."}
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              borderRadius: 28,
              padding: 16,
              boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
            }}
          >
            <div
              style={{
                fontSize: 14,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#6d7e94",
                marginBottom: 8,
              }}
            >
              Book with partner
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Guest information</div>
            <div style={{ display: "grid", gap: 10 }}>
              <SimpleInput value={guestName} onChange={setGuestName} placeholder="Guest name" />
              <SimpleInput value={guestEmail} onChange={setGuestEmail} placeholder="Guest email" />
              <div
                style={{
                  borderRadius: 14,
                  border: "1px solid #dbe3ef",
                  background: "#f8fafc",
                  padding: "14px 16px",
                  color: "#6d7e94",
                  fontWeight: 700,
                }}
              >
                {selected
                  ? `Selected hotel price: ${formatMoney(selected.price, selected.country)}`
                  : "Selected hotel price"}
              </div>
              <button
                type="button"
                onClick={continueToBookingPartner}
                style={{
                  background: "linear-gradient(90deg, #2563eb, #22c1dc)",
                  border: "none",
                  color: "#fff",
                  borderRadius: 16,
                  padding: "16px 20px",
                  fontSize: 16,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Continue to Booking Partner
              </button>
              <div style={{ color: "#546b8b", lineHeight: 1.6 }}>{bookingMessage}</div>
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: 28,
            padding: 16,
            boxShadow: "0 8px 30px rgba(8,25,55,0.08)",
          }}
        >
          <div
            style={{
              fontSize: 14,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#6d7e94",
              marginBottom: 8,
            }}
          >
            Customer satisfaction
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>
            Help us improve your booking experience
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <select
              value={surveySatisfaction}
              onChange={(e) => setSurveySatisfaction(e.target.value)}
              style={selectStyle}
            >
              <option value="">Overall satisfaction</option>
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="fair">Fair</option>
              <option value="poor">Poor</option>
            </select>

            <select
              value={surveyRecommend}
              onChange={(e) => setSurveyRecommend(e.target.value)}
              style={selectStyle}
            >
              <option value="">Would you recommend us?</option>
              <option value="yes">Yes</option>
              <option value="maybe">Maybe</option>
              <option value="no">No</option>
            </select>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.1)",
        borderRadius: 18,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>{label}</div>
      <div
        style={{
          fontSize: value.length > 18 ? 18 : 22,
          fontWeight: 800,
          wordBreak: "break-word",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "rgba(255,255,255,0.1)",
        color: "#fff",
        padding: "14px 16px",
        outline: "none",
        fontSize: 16,
      }}
    />
  );
}

function SimpleInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        borderRadius: 14,
        border: "1px solid #dbe3ef",
        background: "#f8fafc",
        color: "#0b1628",
        padding: "14px 16px",
        outline: "none",
        fontSize: 16,
      }}
    />
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.1)",
          color: "#fff",
          padding: "14px 16px",
          outline: "none",
          fontSize: 16,
        }}
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        style={{
          width: "100%",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.1)",
          color: "#fff",
          padding: "14px 16px",
          outline: "none",
          fontSize: 16,
        }}
      />
    </label>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 14,
  border: "1px solid #dbe3ef",
  background: "#f8fafc",
  color: "#0b1628",
  padding: "14px 16px",
  outline: "none",
  fontSize: 16,
};