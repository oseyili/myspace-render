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
    text: "Premium city stays, seamless transport access, and world-class culture at your doorstep.",
  },
  {
    city: "Dubai",
    text: "Luxury towers, beachfront resorts, and high-end experiences designed for modern travellers.",
  },
  {
    city: "Paris",
    text: "Boutique elegance, walkable districts, and refined stays in the world’s most iconic city.",
  },
  {
    city: "Lagos",
    text: "Dynamic city hotels built for business, energy, and fast-moving travel schedules.",
  },
];

const FAQS = [
  {
    q: "How does hotel search work?",
    a: "Enter your destination and travel details to unlock a live global inventory of hotels in seconds.",
  },
  {
    q: "Can I refine results precisely?",
    a: "Yes. Apply targeted facility filters to surface only the most relevant and high-quality stays.",
  },
  {
    q: "How do I complete a booking?",
    a: "Select your preferred hotel and continue securely via the booking partner to complete your reservation.",
  },
  {
    q: "How extensive is the selection?",
    a: "The platform connects to large-scale hotel inventories, giving you access to a wide global range of stays.",
  },
];

const PAGE_CONTENT = {
  guides: {
    title: "Travel Intelligence",
    intro:
      "Targeted destination insights to help you choose faster and book with confidence.",
    sections: GUIDE_ITEMS.map((item) => ({
      title: item.city,
      body: item.text,
    })),
  },
  faq: {
    title: "Booking Clarity",
    intro:
      "Everything you need to understand before moving to reservation.",
    sections: FAQS.map((item) => ({
      title: item.q,
      body: item.a,
    })),
  },
  terms: {
    title: "Booking Terms",
    intro:
      "Important details before continuing to a booking partner.",
    sections: [
      {
        title: "Pricing and availability",
        body:
          "Rates, availability, and room types can change in real time. Final confirmation is completed with the booking partner.",
      },
      {
        title: "Guest accuracy",
        body:
          "Ensure all guest details and travel dates are correct before proceeding to avoid booking issues.",
      },
      {
        title: "Partner completion",
        body:
          "All reservations are securely completed on the selected booking partner platform.",
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
    "Live global inventory. Precision filtering. Direct booking through trusted partners."
  );
  const [errorText, setErrorText] = useState("");
  const [loading, setLoading] = useState(false);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);

  const filteredHotels = useMemo(() => {
    if (!selectedFacilities.length) return hotels;
    return hotels.filter((hotel) => {
      const facilities = hotelFacilities(hotel).map((f) => f.toLowerCase());
      return selectedFacilities.every((wanted) =>
        facilities.some((f) => f.includes(wanted.toLowerCase()))
      );
    });
  }, [hotels, selectedFacilities]);

  const activeHotel = selectedHotel || filteredHotels[0] || null;

  function updateSearch(field, value) {
    setSearch((c) => ({ ...c, [field]: value }));
  }

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setErrorText("");

    try {
      const params = new URLSearchParams({
        destination: search.destination,
        country: search.country,
        city: search.city,
        location: search.location,
        guests: search.guests,
        rooms: search.rooms,
        page: "1",
        page_size: "60",
      });

      const res = await fetch(`${API_BASE}/api/hotels?${params}`);
      const data = await res.json();
      const items = normaliseHotels(data);

      setHotels(items);
      setStatusText(
        `${items.length} live hotel options available in ${search.destination}. Refine instantly to find your best match.`
      );
    } catch (err) {
      setErrorText("Unable to load live hotel inventory. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ fontSize: 48, fontWeight: 900 }}>
        My Space Hotel
      </h1>

      <p style={{ fontSize: 18 }}>
        Access a wider global hotel inventory, compare faster, and move to booking instantly through trusted partners.
      </p>

      <form onSubmit={handleSearch}>
        <input
          value={search.destination}
          onChange={(e) => updateSearch("destination", e.target.value)}
          placeholder="Destination"
        />
        <button type="submit">
          {loading ? "Searching..." : "Search Hotels"}
        </button>
      </form>

      <p>{statusText}</p>

      {errorText && <p>{errorText}</p>}

      <div>
        {filteredHotels.map((hotel, i) => (
          <div key={i} onClick={() => setSelectedHotel(hotel)}>
            <h3>{hotel.name}</h3>
            <p>{formatPrice(hotel.price)}</p>
          </div>
        ))}
      </div>

      {activeHotel && (
        <div>
          <h2>{activeHotel.name}</h2>
          <p>
            A premium stay sourced from live global inventory, ready for immediate booking.
          </p>
          <a href={buildAffiliateLink(activeHotel)} target="_blank">
            Reserve Now
          </a>
        </div>
      )}
    </div>
  );
}