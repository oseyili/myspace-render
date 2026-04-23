import React, { useEffect, useMemo, useState } from "react";
import TravelGuide from "./TravelGuide";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";

const FACILITIES = [
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
];

export default function App() {
  const [city, setCity] = useState("London");
  const [hotels, setHotels] = useState([]);
  const [filteredHotels, setFilteredHotels] = useState([]);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [view, setView] = useState("search");
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    requests: "",
  });

  const liveChoicesShown = useMemo(() => filteredHotels.length, [filteredHotels]);

  const searchHotels = async () => {
    if (!city.trim()) {
      setMessage("Please enter a city to begin your search.");
      return;
    }

    setSearching(true);
    setMessage("");

    try {
      const res = await fetch(
        `${API_BASE}/api/hotels?city=${encodeURIComponent(city.trim())}`
      );
      const data = await res.json();

      if (data.hotels) {
        setHotels(data.hotels);
        setSelectedHotel(data.hotels.length > 0 ? data.hotels[0] : null);
      } else {
        setHotels([]);
        setSelectedHotel(null);
        setMessage("No results were found for that city. Try another destination.");
      }
    } catch {
      setHotels([]);
      setSelectedHotel(null);
      setMessage("Search is temporarily unavailable. Please try again.");
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    searchHotels();
  }, []);

  useEffect(() => {
    if (selectedFacilities.length === 0) {
      setFilteredHotels(hotels);
      return;
    }

    const nextFiltered = hotels.filter((hotel) =>
      selectedFacilities.every((facility) =>
        (hotel.facilities || []).includes(facility)
      )
    );

    setFilteredHotels(nextFiltered);
  }, [selectedFacilities, hotels]);

  const toggleFacility = (facility) => {
    setSelectedFacilities((prev) =>
      prev.includes(facility)
        ? prev.filter((item) => item !== facility)
        : [...prev, facility]
    );
  };

  const submitRequest = async () => {
    if (!selectedHotel) {
      setMessage("Please select a hotel before sending your request.");
      return;
    }

    if (!form.name.trim() || !form.email.trim()) {
      setMessage("Please enter your name and email before sending your request.");
      return;
    }

    setSending(true);
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hotel_id: selectedHotel.id,
          name: form.name.trim(),
          email: form.email.trim(),
          message: form.requests.trim(),
        }),
      });

      const data = await res.json();

      if (data && data.message) {
        setMessage(data.message);
      } else {
        setMessage("Your reservation request has been received. We will continue with you shortly.");
      }
    } catch {
      setMessage("Your request could not be sent right now. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (view === "guide") {
    return (
      <TravelGuide
        city={city.trim() || "London"}
        goBack={() => setView("search")}
      />
    );
  }

  return (
    <div
      style={{
        background: "#07152f",
        color: "#ffffff",
        minHeight: "100vh",
        padding: "20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "1600px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.25fr 1fr",
            gap: "22px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #163a87 0%, #2d5fcb 100%)",
              borderRadius: "28px",
              padding: "34px",
              boxShadow: "0 18px 45px rgba(0,0,0,0.28)",
            }}
          >
            <div
              style={{
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontSize: "14px",
                opacity: 0.9,
                marginBottom: "14px",
                fontWeight: "700",
              }}
            >
              Worldwide hotel bookings
            </div>

            <h1
              style={{
                fontSize: "76px",
                lineHeight: 0.98,
                margin: "0 0 18px 0",
                fontWeight: "800",
              }}
            >
              My Space Hotel
            </h1>

            <p
              style={{
                fontSize: "28px",
                lineHeight: 1.55,
                margin: "0 0 28px 0",
                maxWidth: "900px",
                color: "#edf4ff",
                fontWeight: "600",
              }}
            >
              Search more hotels worldwide, compare with clarity, and move
              toward a direct reservation request with more confidence.
            </p>

            <div
              style={{
                background: "rgba(255,255,255,0.10)",
                borderRadius: "24px",
                padding: "22px",
                maxWidth: "520px",
                border: "1px solid rgba(255,255,255,0.10)",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  fontSize: "18px",
                  marginBottom: "14px",
                  color: "#eef5ff",
                }}
              >
                Live choices shown
              </div>

              <div
                style={{
                  fontSize: "78px",
                  lineHeight: 1,
                  fontWeight: "800",
                  marginBottom: "8px",
                }}
              >
                {liveChoicesShown}
              </div>

              <div
                style={{
                  fontSize: "18px",
                  lineHeight: 1.6,
                  color: "#eef5ff",
                }}
              >
                Visible hotel options ready for review in your current search.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "14px",
                flexWrap: "wrap",
                marginBottom: "18px",
              }}
            >
              <button
                onClick={() => setView("guide")}
                style={heroPillButton}
              >
                Smart Travel Guides
              </button>

              <button
                onClick={() =>
                  setMessage("FAQs page can be added next as a premium full page.")
                }
                style={heroPillButton}
              >
                FAQs
              </button>

              <button
                onClick={() =>
                  setMessage("Booking Terms page can be added next as a premium full page.")
                }
                style={heroPillButton}
              >
                Booking Terms
              </button>

              <button
                onClick={() =>
                  setMessage("Customer Support page can be added next as a premium full page.")
                }
                style={heroPillButton}
              >
                Customer Support
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px 22px",
                fontSize: "18px",
                color: "#ffffff",
                fontWeight: "700",
              }}
            >
              <div>Search a broader hotel database</div>
              <div>Refine clearly by the facilities that matter</div>
              <div>Compare options more confidently</div>
              <div>Request your stay directly inside the platform</div>
            </div>
          </div>

          <div
            style={{
              background: "#eaf1fb",
              color: "#0b1c3d",
              borderRadius: "28px",
              padding: "28px",
              boxShadow: "0 18px 45px rgba(0,0,0,0.16)",
            }}
          >
            <div
              style={{
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontSize: "14px",
                marginBottom: "10px",
                fontWeight: "800",
                color: "#617aa7",
              }}
            >
              Search
            </div>

            <h2
              style={{
                fontSize: "58px",
                lineHeight: 1.02,
                margin: "0 0 16px 0",
                fontWeight: "800",
              }}
            >
              Search hotels with speed and clarity
            </h2>

            <p
              style={{
                fontSize: "18px",
                lineHeight: 1.7,
                margin: "0 0 18px 0",
                color: "#4e6489",
              }}
            >
              Search by city, refine by facility, and compare stronger options
              before you choose your stay.
            </p>

            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Where are you travelling?"
              style={searchInputStyle}
            />

            <div
              style={{
                background: "#ffffff",
                borderRadius: "22px",
                padding: "16px",
                marginTop: "14px",
                border: "1px solid #d7e3f4",
              }}
            >
              <div
                style={{
                  fontWeight: "700",
                  marginBottom: "12px",
                  color: "#163a87",
                  fontSize: "17px",
                }}
              >
                Choose the facilities that matter most
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                {FACILITIES.map((facility) => (
                  <label
                    key={facility}
                    style={{
                      background: selectedFacilities.includes(facility)
                        ? "#edf4ff"
                        : "#f8fbff",
                      border: "1px solid #d7e3f4",
                      borderRadius: "14px",
                      padding: "12px",
                      display: "flex",
                      gap: "10px",
                      alignItems: "center",
                      fontSize: "15px",
                      color: "#0b1c3d",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFacilities.includes(facility)}
                      onChange={() => toggleFacility(facility)}
                    />
                    {facility}
                  </label>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
                marginTop: "16px",
              }}
            >
              <button
                onClick={searchHotels}
                style={yellowButton}
              >
                {searching ? "Searching..." : "Search"}
              </button>

              <button
                onClick={() => {
                  setSelectedFacilities([]);
                  setCity("");
                  setHotels([]);
                  setFilteredHotels([]);
                  setSelectedHotel(null);
                  setMessage("");
                }}
                style={navyButton}
              >
                Refresh
              </button>
            </div>

            <div
              style={{
                marginTop: "16px",
                background: "#f8fbff",
                borderRadius: "18px",
                padding: "18px",
                border: "1px solid #d7e3f4",
                color: "#5a6f92",
                fontSize: "17px",
                lineHeight: 1.6,
              }}
            >
              Showing {liveChoicesShown} hotel options for the current search.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.45fr 1fr",
            gap: "22px",
          }}
        >
          <div
            style={{
              background: "#eef3fb",
              color: "#0b1c3d",
              borderRadius: "28px",
              padding: "28px",
              boxShadow: "0 18px 45px rgba(0,0,0,0.16)",
            }}
          >
            <div
              style={{
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontSize: "14px",
                marginBottom: "10px",
                fontWeight: "800",
                color: "#617aa7",
              }}
            >
              Available hotels
            </div>

            <h2
              style={{
                fontSize: "56px",
                lineHeight: 1.02,
                margin: "0 0 18px 0",
                fontWeight: "800",
              }}
            >
              Choose the hotel that fits the trip
            </h2>

            <div
              style={{
                maxHeight: "760px",
                overflowY: "auto",
                paddingRight: "6px",
                display: "grid",
                gap: "18px",
              }}
            >
              {filteredHotels.map((hotel) => (
                <div
                  key={hotel.id}
                  style={{
                    background: "#ffffff",
                    borderRadius: "22px",
                    overflow: "hidden",
                    border: selectedHotel?.id === hotel.id
                      ? "2px solid #f1c644"
                      : "1px solid #d7e3f4",
                    cursor: "pointer",
                    boxShadow: "0 8px 22px rgba(0,0,0,0.08)",
                  }}
                  onClick={() => setSelectedHotel(hotel)}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "320px 1fr",
                    }}
                  >
                    <img
                      src={hotel.image}
                      alt={hotel.name}
                      style={{
                        width: "100%",
                        height: "220px",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />

                    <div style={{ padding: "22px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "16px",
                          alignItems: "start",
                          marginBottom: "12px",
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: "34px",
                            lineHeight: 1.1,
                            color: "#163a87",
                          }}
                        >
                          {hotel.name}
                        </h3>

                        <div
                          style={{
                            background: "#edf4ff",
                            color: "#163a87",
                            borderRadius: "999px",
                            padding: "10px 14px",
                            fontWeight: "700",
                            fontSize: "15px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Guest score {hotel.rating}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: "18px",
                          color: "#617aa7",
                          marginBottom: "12px",
                        }}
                      >
                        {hotel.area}, {hotel.city}, {hotel.country}
                      </div>

                      <div
                        style={{
                          fontSize: "18px",
                          lineHeight: 1.75,
                          color: "#314766",
                          marginBottom: "12px",
                        }}
                      >
                        {hotel.summary}
                      </div>

                      <div
                        style={{
                          fontSize: "17px",
                          lineHeight: 1.7,
                          color: "#4b6085",
                          marginBottom: "14px",
                        }}
                      >
                        Facilities: {(hotel.facilities || []).join(", ")}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "16px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "34px",
                            fontWeight: "800",
                            color: "#163a87",
                          }}
                        >
                          {hotel.currency} {hotel.price}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHotel(hotel);
                          }}
                          style={yellowButtonSmall}
                        >
                          Reserve in app
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {filteredHotels.length === 0 && (
                <div
                  style={{
                    background: "#ffffff",
                    borderRadius: "22px",
                    padding: "28px",
                    border: "1px solid #d7e3f4",
                    fontSize: "18px",
                    color: "#5a6f92",
                    lineHeight: 1.7,
                  }}
                >
                  No hotels matched your current filters. Try removing one or more
                  facility choices and search again.
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              color: "#0b1c3d",
              borderRadius: "28px",
              padding: "28px",
              boxShadow: "0 18px 45px rgba(0,0,0,0.16)",
              alignSelf: "start",
              position: "sticky",
              top: "18px",
            }}
          >
            <div
              style={{
                letterSpacing: "2px",
                textTransform: "uppercase",
                fontSize: "14px",
                marginBottom: "10px",
                fontWeight: "800",
                color: "#617aa7",
              }}
            >
              Request availability
            </div>

            <h2
              style={{
                fontSize: "52px",
                lineHeight: 1.02,
                margin: "0 0 16px 0",
                fontWeight: "800",
                color: "#163a87",
              }}
            >
              Complete your reservation request
            </h2>

            <p
              style={{
                fontSize: "18px",
                lineHeight: 1.7,
                margin: "0 0 18px 0",
                color: "#4e6489",
              }}
            >
              Stay inside My Space Hotel, compare with confidence, and send your
              request directly from your own chosen shortlist.
            </p>

            <div
              style={{
                background: "#f8fbff",
                borderRadius: "22px",
                padding: "18px",
                marginBottom: "16px",
                border: "1px solid #d7e3f4",
              }}
            >
              {selectedHotel ? (
                <>
                  <div
                    style={{
                      fontSize: "24px",
                      fontWeight: "800",
                      color: "#163a87",
                      marginBottom: "8px",
                    }}
                  >
                    {selectedHotel.name}
                  </div>

                  <div
                    style={{
                      fontSize: "17px",
                      color: "#617aa7",
                      marginBottom: "10px",
                    }}
                  >
                    {selectedHotel.area}, {selectedHotel.city}, {selectedHotel.country}
                  </div>

                  <div
                    style={{
                      fontSize: "30px",
                      fontWeight: "800",
                      color: "#163a87",
                    }}
                  >
                    {selectedHotel.currency} {selectedHotel.price}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    fontSize: "17px",
                    color: "#617aa7",
                  }}
                >
                  Select a hotel to continue your reservation request.
                </div>
              )}
            </div>

            <input
              placeholder="Your name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={formInputStyle}
            />

            <input
              placeholder="Your email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              style={formInputStyle}
            />

            <textarea
              placeholder="Special requests"
              value={form.requests}
              onChange={(e) => setForm({ ...form, requests: e.target.value })}
              style={formTextareaStyle}
            />

            <button
              onClick={submitRequest}
              style={yellowButton}
            >
              {sending ? "Sending request..." : "Request availability"}
            </button>

            {message ? (
              <div
                style={{
                  marginTop: "16px",
                  background: "#edf4ff",
                  borderRadius: "18px",
                  padding: "16px",
                  color: "#163a87",
                  fontSize: "16px",
                  lineHeight: 1.7,
                  border: "1px solid #d7e3f4",
                }}
              >
                {message}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

const heroPillButton = {
  background: "rgba(255,255,255,0.10)",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: "999px",
  padding: "14px 18px",
  fontWeight: "700",
  fontSize: "16px",
  cursor: "pointer",
};

const searchInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "18px",
  border: "1px solid #d7e3f4",
  padding: "18px",
  fontSize: "18px",
  outline: "none",
};

const formInputStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "18px",
  border: "1px solid #d7e3f4",
  padding: "16px",
  fontSize: "17px",
  outline: "none",
  marginBottom: "12px",
};

const formTextareaStyle = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: "18px",
  border: "1px solid #d7e3f4",
  padding: "16px",
  fontSize: "17px",
  outline: "none",
  marginBottom: "12px",
  minHeight: "120px",
  resize: "vertical",
  fontFamily: "Arial, sans-serif",
};

const yellowButton = {
  width: "100%",
  background: "#f1c644",
  color: "#0b1c3d",
  border: "none",
  borderRadius: "18px",
  padding: "16px 20px",
  fontWeight: "800",
  fontSize: "18px",
  cursor: "pointer",
};

const navyButton = {
  width: "100%",
  background: "#163a87",
  color: "#ffffff",
  border: "none",
  borderRadius: "18px",
  padding: "16px 20px",
  fontWeight: "800",
  fontSize: "18px",
  cursor: "pointer",
};

const yellowButtonSmall = {
  background: "#f1c644",
  color: "#0b1c3d",
  border: "none",
  borderRadius: "16px",
  padding: "14px 18px",
  fontWeight: "800",
  fontSize: "16px",
  cursor: "pointer",
};