"use client";

import React, { useMemo, useState } from "react";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";

const PAGES = {
  faqs: {
    title: "FAQs",
    intro: "Clear answers before you request hotel availability.",
    items: [
      ["How do I search?", "Enter the country and city, then add an area, hotel name, or preferred facilities if needed."],
      ["Are these real hotel records?", "Yes. The app uses stored real hotel records and live hotel provider data when available."],
      ["Do I pay before availability is confirmed?", "No. Availability and price should be confirmed before payment is completed."],
      ["Why should I select facilities?", "Facilities help you remove unsuitable stays quickly, so you compare only hotels that fit your trip."],
      ["Can I search with UK, USA, or NG?", "Yes. Abbreviated country names are supported where the backend recognises them."],
    ],
  },
  terms: {
    title: "Booking Terms",
    intro: "Important booking information for customers before continuing.",
    items: [
      ["Availability first", "A reservation request does not guarantee the room until availability is confirmed."],
      ["Prices", "Prices must be confirmed for the selected dates, guests, room type, taxes, and local charges."],
      ["Customer details", "Customers must provide accurate names, email addresses, dates, and room requirements."],
      ["Partner reservation", "Where a partner reservation link is used, the partner’s final booking terms also apply."],
      ["Cancellations", "Cancellation rules depend on the hotel, dates, rate type, and booking partner."],
    ],
  },
  support: {
    title: "Customer Support",
    intro: "Help for customers before and after sending a reservation request.",
    items: [
      ["Email", "Contact reservations@myspace-hotel.com for booking support."],
      ["Before contacting support", "Include destination, dates, number of guests, selected hotel, and any special room needs."],
      ["Response", "Availability requests are reviewed with the hotel or booking source before confirmation."],
    ],
  },
};

const FACILITIES = [
  "wifi",
  "gym",
  "pool",
  "airport shuttle",
  "beach access",
  "spa",
  "restaurant",
  "parking",
  "family rooms",
  "business lounge",
];

function normaliseHotels(payload) {
  const list = payload?.hotels || payload?.results || payload?.data || [];
  return Array.isArray(list) ? list : [];
}

function hotelImage(hotel) {
  const url =
    hotel?.image ||
    hotel?.max_photo_url ||
    hotel?.main_photo_url ||
    hotel?.photo_url ||
    hotel?.image_url ||
    "";
  if (!url || typeof url !== "string") return "";
  return url.replace("square60", "max1280x900").replace("square200", "max1280x900");
}

export default function Home() {
  const [page, setPage] = useState("home");
  const [country, setCountry] = useState("uk");
  const [city, setCity] = useState("london");
  const [area, setArea] = useState("");
  const [keyword, setKeyword] = useState("");
  const [guests, setGuests] = useState(2);
  const [selectedFacilities, setSelectedFacilities] = useState([]);
  const [hotels, setHotels] = useState([]);
  const [selectedHotel, setSelectedHotel] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const countText = useMemo(() => "50,015+ real hotel records available", []);

  async function searchHotels() {
    setLoading(true);
    setMessage("");
    setHotels([]);
    setSelectedHotel(null);

    try {
      const params = new URLSearchParams();
      params.set("country", country.trim());
      params.set("city", city.trim());
      params.set("area", area.trim());
      params.set("keyword", keyword.trim());
      params.set("guests", String(guests));
      params.set("limit", "60");
      if (selectedFacilities.length) params.set("facilities", selectedFacilities.join(","));

      const res = await fetch(`${API_BASE}/api/hotels/search?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = await res.json();
      const list = normaliseHotels(payload);

      setHotels(list);

      if (!list.length) {
        setMessage(
          payload?.message ||
            "No matching hotels found. Try country and city only first, then add filters."
        );
      }
    } catch (err) {
      setMessage("Search could not connect to the hotel server. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  function toggleFacility(facility) {
    setSelectedFacilities((old) =>
      old.includes(facility) ? old.filter((x) => x !== facility) : [...old, facility]
    );
  }

  if (page !== "home") {
    const content = PAGES[page];

    if (page === "guides") {
      const mapQuery = encodeURIComponent([area, city, country].filter(Boolean).join(" "));
      return (
        <main className="min-h-screen bg-[#041126] text-white p-8">
          <section className="rounded-[32px] bg-[#0d2b62] p-8">
            <button onClick={() => setPage("home")} className="bg-yellow-400 text-black font-bold px-6 py-3 rounded-xl">
              Back to hotel search
            </button>
            <h1 className="text-5xl font-black mt-10">Travel Guides</h1>
            <p className="mt-5 text-xl max-w-3xl">
              Explore the destination before choosing your stay. Check the area, nearby districts, and important places before sending a reservation request.
            </p>
            <div className="mt-8 rounded-3xl overflow-hidden border border-white/20">
              <iframe
                title="Destination map"
                src={`https://www.google.com/maps?q=${mapQuery || "London"}&output=embed`}
                className="w-full h-[520px]"
                loading="lazy"
              />
            </div>
            <div className="grid md:grid-cols-3 gap-5 mt-8">
              {["Best area for your trip", "Transport and access", "Nearby attractions"].map((t) => (
                <div key={t} className="bg-white/10 rounded-2xl p-6 text-lg font-bold">{t}</div>
              ))}
            </div>
          </section>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-[#041126] text-white p-8">
        <section className="rounded-[32px] bg-[#0d2b62] p-8">
          <button onClick={() => setPage("home")} className="bg-yellow-400 text-black font-bold px-6 py-3 rounded-xl">
            Back to hotel search
          </button>
          <h1 className="text-5xl font-black mt-10">{content.title}</h1>
          <p className="mt-5 text-xl">{content.intro}</p>
          <div className="grid md:grid-cols-2 gap-5 mt-10">
            {content.items.map(([q, a]) => (
              <div key={q} className="bg-white text-[#041126] rounded-2xl p-6">
                <h2 className="text-2xl font-black">{q}</h2>
                <p className="mt-3 text-lg">{a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#041126] p-6 text-[#06122c]">
      <section className="grid lg:grid-cols-[1.25fr_1fr] gap-6">
        <div className="bg-gradient-to-br from-blue-800 to-blue-600 text-white rounded-[32px] p-10">
          <h1 className="text-5xl md:text-6xl font-black leading-tight">
            Find hotels around the world, compare stays clearly, and request availability with confidence.
          </h1>
          <p className="mt-8 text-xl max-w-4xl">
            Search real hotel records, compare location, facilities, images, and ratings, then continue only when the stay fits your trip.
          </p>
          <div className="mt-8 bg-white/15 rounded-2xl p-6 text-xl font-bold max-w-md">{countText}</div>
          <div className="flex flex-wrap gap-4 mt-8">
            <button onClick={() => setPage("guides")} className="bg-white text-black px-6 py-3 rounded-xl font-bold">Travel Guides</button>
            <button onClick={() => setPage("faqs")} className="bg-white text-black px-6 py-3 rounded-xl font-bold">FAQs</button>
            <button onClick={() => setPage("terms")} className="bg-white text-black px-6 py-3 rounded-xl font-bold">Booking Terms</button>
            <button onClick={() => setPage("support")} className="bg-white text-black px-6 py-3 rounded-xl font-bold">Customer Support</button>
          </div>
        </div>

        <div className="bg-[#edf5ff] rounded-[32px] p-8">
          <p className="text-lg mb-6">Search broadly or narrow your stay by destination, neighbourhood, and facilities.</p>
          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country, e.g. UK, USA, NG" className="w-full p-4 rounded-2xl border mb-4 text-lg" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City, e.g. London, Abuja" className="w-full p-4 rounded-2xl border mb-4 text-lg" />
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area, e.g. Mayfair, Lekki, City Centre" className="w-full p-4 rounded-2xl border mb-4 text-lg" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or keyword" className="w-full p-4 rounded-2xl border mb-5 text-lg" />

          <div className="flex gap-2 items-center mb-6">
            <b>Guests</b>
            {[1,2,3,4,5,6].map((n) => (
              <button key={n} onClick={() => setGuests(n)} className={`px-5 py-3 rounded-xl border ${guests === n ? "bg-yellow-400 font-black" : "bg-white"}`}>{n}</button>
            ))}
          </div>

          <div className="bg-white rounded-3xl p-6">
            <h2 className="font-black text-xl mb-4">Choose preferred facilities</h2>
            <div className="grid grid-cols-2 gap-3">
              {FACILITIES.map((f) => (
                <label key={f} className="text-lg">
                  <input type="checkbox" checked={selectedFacilities.includes(f)} onChange={() => toggleFacility(f)} className="mr-3" />
                  {f}
                </label>
              ))}
            </div>
          </div>

          <button onClick={searchHotels} disabled={loading} className="mt-5 w-full bg-yellow-400 text-black font-black text-xl py-5 rounded-2xl border-2 border-black">
            {loading ? "Searching..." : "Search hotels"}
          </button>

          {message && <div className="mt-4 bg-yellow-100 rounded-xl p-4 font-bold">{message}</div>}
        </div>
      </section>

      <section className="grid lg:grid-cols-[1.3fr_1fr] gap-6 mt-6">
        <div className="bg-[#edf5ff] rounded-[32px] p-8">
          <h2 className="tracking-[0.4em] text-xl font-black text-slate-500">AVAILABLE STAYS</h2>
          <p className="text-3xl font-black mt-6">{hotels.length} stays shown</p>

          <div className="grid gap-5 mt-6 max-h-[760px] overflow-y-auto pr-2">
            {hotels.map((h, i) => {
              const img = hotelImage(h);
              return (
                <button key={h.id || i} onClick={() => setSelectedHotel(h)} className="text-left bg-white rounded-3xl overflow-hidden border hover:border-blue-700">
                  {img ? <img src={img} alt={h.name || "Hotel"} className="w-full h-72 object-cover" loading="lazy" /> : null}
                  <div className="p-5">
                    <h3 className="text-2xl font-black">{h.name || "Hotel"}</h3>
                    <p className="mt-2">{[h.area, h.city, h.country].filter(Boolean).join(", ")}</p>
                    <p className="mt-2 font-bold">{h.rating ? `${h.rating} star` : ""} {h.review_score ? ` • Review ${h.review_score}` : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-[32px] p-8">
          <h2 className="tracking-[0.4em] text-xl font-black text-slate-500">REQUEST AVAILABILITY</h2>
          <h3 className="text-3xl font-black mt-6">Send your reservation request</h3>
          <div className="mt-6 bg-[#f3f7ff] rounded-2xl p-5">
            {selectedHotel ? selectedHotel.name : "Select a hotel from the list to continue."}
          </div>
          <input placeholder="Your name" className="w-full p-4 rounded-2xl border mt-4" />
          <input placeholder="Your email" className="w-full p-4 rounded-2xl border mt-4" />
          <textarea placeholder="Special requests, dates, room needs, or questions" className="w-full p-4 rounded-2xl border mt-4 h-36" />
          <button className="mt-5 w-full bg-yellow-400 text-black font-black text-xl py-5 rounded-2xl">
            Request availability
          </button>
        </div>
      </section>
    </main>
  );
}
