"use client";

import { useMemo, useState } from "react";

type Hotel = {
  name: string;
  city: string;
  price: number;
  rating: number;
  image: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

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

function formatMoney(value: number, country: string) {
  const useGBP = country.toLowerCase().includes("kingdom");
  const currency = useGBP ? "GBP" : "USD";
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

export default function HomePage() {
  const [destination, setDestination] = useState("London");
  const [country, setCountry] = useState("United Kingdom");
  const [city, setCity] = useState("");
  const [locationText, setLocationText] = useState("");

  const [checkIn, setCheckIn] = useState(todayPlus(7));
  const [checkOut, setCheckOut] = useState(todayPlus(8));
  const [guests, setGuests] = useState(1);
  const [rooms, setRooms] = useState(1);

  const [loadingSearch, setLoadingSearch] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    "Search a larger real hotel list, filter your stay, and continue with trusted booking partners."
  );

  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [selected, setSelected] = useState<Hotel | null>(null);
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);

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

  async function searchHotels() {
    setLoadingSearch(true);
    setStatusMessage("Searching live hotel inventory...");
    setSelected(null);

    try {
      if (!API_BASE) {
        throw new Error("Missing NEXT_PUBLIC_API_URL");
      }

      const url = `${API_BASE}/api/hotels?city=${encodeURIComponent(
        effectiveDestination
      )}`;

      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }

      const data = await response.json();
      const items: Hotel[] = Array.isArray(data) ? data : [];

      setHotels(items);

      if (items.length > 0) {
        setStatusMessage(`Found ${items.length} hotel option(s) for ${effectiveDestination}.`);
      } else {
        setStatusMessage("No matching hotels were found for this search. Please try another destination.");
      }
    } catch (error) {
      setHotels([]);
      setSelected(null);
      setStatusMessage("Hotel search is temporarily unavailable. Please try again shortly.");
    } finally {
      setLoadingSearch(false);
    }
  }

  const visibleHotels = hotels;

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
              This version uses your live backend and supports a broader hotel search flow.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 10,
              }}
            >
              <StatCard label="Loaded Results" value={String(visibleHotels.length)} />
              <StatCard label="Selected Hotel" value={selected ? selected.name : "None"} />
              <StatCard label="Search Status" value={loadingSearch ? "Loading..." : "Ready"} />
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
              Search and select a hotel to view details.
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
                    style={{ width: "100%", height: "100%", objectFit: "cover", minHeight: 340 }}
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
                    Search and select a hotel to preview its image.
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
                <div style={{ fontSize: 14, color: "#6d7e94", marginBottom: 8 }}>Selected hotel</div>
                {selected ? (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>{selected.name}</div>
                    <div style={{ marginBottom: 8 }}><strong>City:</strong> {selected.city}</div>
                    <div style={{ marginBottom: 8 }}>
                      <strong>Price:</strong> {formatMoney(selected.price, country)} per night
                    </div>
                    <div style={{ marginBottom: 12 }}><strong>Rating:</strong> {selected.rating} / 5</div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${selected.name} ${selected.city}`
                      )}`}
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
                  <div style={{ color: "#6d7e94" }}>No hotel selected yet.</div>
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
              Showing {visibleHotels.length} loaded result(s)
            </div>

            <div style={{ display: "grid", gap: 12, maxHeight: 560, overflowY: "auto", paddingRight: 4 }}>
              {visibleHotels.length === 0 ? (
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
                visibleHotels.map((hotel, index) => (
                  <button
                    key={`${hotel.name}-${hotel.city}-${index}`}
                    type="button"
                    onClick={() => setSelected(hotel)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "120px 1fr",
                      gap: 12,
                      textAlign: "left",
                      border: selected?.name === hotel.name ? "2px solid #2563eb" : "1px solid #dbe3ef",
                      borderRadius: 18,
                      background: selected?.name === hotel.name ? "#eef4ff" : "#ffffff",
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
                      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{hotel.name}</div>
                      <div style={{ color: "#5f6f84", marginBottom: 6 }}>{hotel.city}</div>
                      <div style={{ marginBottom: 4 }}>
                        <strong>{formatMoney(hotel.price, country)}</strong> per night
                      </div>
                      <div>Rating: {hotel.rating} / 5</div>
                    </div>
                  </button>
                ))
              )}
            </div>
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