"use client";

import React, { useState } from "react";

const API_BASE = "https://hotel-backend-1-ee5z.onrender.com";
const SUPPORT_EMAIL = "reservations@myspace-hotel.com";

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

const CUSTOMER_PAGES = {
  faqs: {
    title: "FAQs",
    intro: "Straight answers customers need before searching, comparing, or sending a reservation request.",
    sections: [
      {
        q: "How do I find a hotel?",
        a: "Enter a country and city first. Add an area, hotel name, or facilities only when you want to narrow the results.",
      },
      {
        q: "Why should I request availability?",
        a: "Hotel availability can change quickly. Requesting availability lets the stay be checked before you continue.",
      },
      {
        q: "Do I pay immediately?",
        a: "No. Payment should only happen after the stay, price, and availability are confirmed.",
      },
      {
        q: "Why might a search return no result?",
        a: "The city may not be loaded yet, the spelling may be different, or the selected filters may be too narrow. Search with country and city first.",
      },
      {
        q: "Can I search with UK, USA, or NG?",
        a: "Yes. Common country abbreviations are supported where recognised by the hotel database.",
      },
      {
        q: "Are prices final?",
        a: "No price should be treated as final until confirmed for the exact dates, guests, room type, taxes, and local charges.",
      },
    ],
  },
  terms: {
    title: "Booking Terms",
    intro: "Important points customers should understand before continuing with a reservation request.",
    sections: [
      {
        q: "Availability confirmation",
        a: "A reservation request is not a confirmed booking. The hotel or booking source must confirm availability first.",
      },
      {
        q: "Price confirmation",
        a: "Prices can change until confirmed for the selected dates, guest count, room type, and local taxes or charges.",
      },
      {
        q: "Customer details",
        a: "Customers must provide accurate names, email addresses, dates, destination, and room requirements.",
      },
      {
        q: "Payment",
        a: "Payment should only be completed when the customer is ready and the stay details have been confirmed.",
      },
      {
        q: "Cancellation rules",
        a: "Cancellation rules depend on the selected hotel, rate type, dates, and final booking provider.",
      },
      {
        q: "Third-party booking path",
        a: "Where a partner booking path is used, the partner’s final terms also apply before payment is made.",
      },
    ],
  },
  support: {
    title: "Customer Support",
    intro: "Help for customers who need support with a hotel search or reservation request.",
    sections: [
      {
        q: "Support email",
        a: SUPPORT_EMAIL,
      },
      {
        q: "What to include",
        a: "Include the country, city, dates, number of guests, selected hotel, and any special room needs.",
      },
      {
        q: "Before sending support request",
        a: "Search with country and city first. Then add facilities or an area if you need a narrower list.",
      },
      {
        q: "Availability help",
        a: "If a selected hotel is not available, support can help continue with another suitable stay.",
      },
    ],
  },
};

function getHotelList(payload) {
  const list = payload?.hotels || payload?.results || payload?.data || [];
  return Array.isArray(list) ? list : [];
}

function imageUrl(hotel) {
  const url =
    hotel?.image ||
    hotel?.max_photo_url ||
    hotel?.main_photo_url ||
    hotel?.photo_url ||
    hotel?.image_url ||
    "";

  if (!url || typeof url !== "string") return "";
  return url
    .replace("square60", "max1280x900")
    .replace("square200", "max1280x900")
    .replace("max300", "max1280x900");
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
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  function toggleFacility(name) {
    setSelectedFacilities((old) =>
      old.includes(name) ? old.filter((x) => x !== name) : [...old, name]
    );
  }

  async function searchHotels() {
    setLoading(true);
    setNotice("");
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
      if (selectedFacilities.length) {
        params.set("facilities", selectedFacilities.join(","));
      }

      const response = await fetch(`${API_BASE}/api/hotels/search?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });

      const payload = await response.json();
      const list = getHotelList(payload);

      setHotels(list);

      if (!list.length) {
        setNotice("No matching hotel was found for this search. Try country and city only first, then add area or facilities.");
      }
    } catch {
      setNotice("The hotel search server did not respond. Please try again shortly.");
    } finally {
      setLoading(false);
    }
  }

  if (page !== "home" && page !== "guides") {
    const content = CUSTOMER_PAGES[page];

    return (
      <main className="min-h-screen bg-[#041126] text-white p-6">
        <section className="max-w-7xl mx-auto bg-[#102b63] rounded-[32px] p-8 md:p-12">
          <button
            onClick={() => setPage("home")}
            className="bg-yellow-400 text-black font-black px-6 py-3 rounded-xl"
          >
            Back to hotel search
          </button>

          <h1 className="text-5xl md:text-6xl font-black mt-10">{content.title}</h1>
          <p className="text-xl mt-5 max-w-4xl">{content.intro}</p>

          <div className="grid md:grid-cols-2 gap-6 mt-10">
            {content.sections.map((item) => (
              <article key={item.q} className="bg-white text-[#041126] rounded-3xl p-7 shadow">
                <h2 className="text-2xl font-black">{item.q}</h2>
                <p className="text-lg mt-3 leading-relaxed">{item.a}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (page === "guides") {
    const query = encodeURIComponent([area, city, country].filter(Boolean).join(" ") || "London");

    return (
      <main className="min-h-screen bg-[#041126] text-white p-6">
        <section className="max-w-7xl mx-auto bg-[#102b63] rounded-[32px] p-8 md:p-12">
          <button
            onClick={() => setPage("home")}
            className="bg-yellow-400 text-black font-black px-6 py-3 rounded-xl"
          >
            Back to hotel search
          </button>

          <h1 className="text-5xl md:text-6xl font-black mt-10">Travel Guides</h1>
          <p className="text-xl mt-5 max-w-4xl">
            Use the map only for destination context. Choose your stay based on hotel location, access, facilities, and confirmed availability.
          </p>

          <div className="mt-8 rounded-3xl overflow-hidden border border-white/20 bg-white">
            <iframe
              title="Destination map"
              src={`https://www.google.com/maps?q=${query}&output=embed`}
              className="w-full h-[520px]"
              loading="lazy"
            />
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <div className="bg-white text-[#041126] rounded-3xl p-7">
              <h2 className="text-2xl font-black">Stay near your main reason for travel</h2>
              <p className="mt-3 text-lg">Check the hotel area against the places you will visit most.</p>
            </div>
            <div className="bg-white text-[#041126] rounded-3xl p-7">
              <h2 className="text-2xl font-black">Compare access before choosing</h2>
              <p className="mt-3 text-lg">Transport, airport distance, and neighbourhood fit can matter as much as price.</p>
            </div>
            <div className="bg-white text-[#041126] rounded-3xl p-7">
              <h2 className="text-2xl font-black">Confirm before payment</h2>
              <p className="mt-3 text-lg">Availability and final price should be checked before a customer completes payment.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#041126] p-6 text-[#041126]">
      <section className="max-w-[1700px] mx-auto grid xl:grid-cols-[1.25fr_1fr] gap-6">
        <section className="bg-gradient-to-br from-blue-800 to-blue-600 text-white rounded-[32px] p-8 md:p-12">
          <div className="tracking-[0.5em] text-lg font-black">MY SPACE HOTEL</div>

          <h1 className="text-5xl md:text-6xl font-black leading-tight mt-10">
            Find hotels around the world, compare stays clearly, and request availability with confidence.
          </h1>

          <p className="mt-8 text-xl max-w-4xl">
            Search real hotel records, compare location, facilities, images, and ratings, then continue only when the stay fits your trip.
          </p>

          <div className="mt-8 bg-white/15 rounded-2xl p-6 text-xl font-bold max-w-md">
            50,015+ real hotel records available
          </div>

          <div className="flex flex-wrap gap-4 mt-8">
            <button onClick={() => setPage("guides")} className="bg-white text-black px-6 py-3 rounded-xl font-bold">
              Travel Guides
            </button>
            <button onClick={() => setPage("faqs")} className="bg-white text-black px-6 py-3 rounded-xl font-bold">
              FAQs
            </button>
            <button onClick={() => setPage("terms")} className="bg-white text-black px-6 py-3 rounded-xl font-bold">
              Booking Terms
            </button>
            <button onClick={() => setPage("support")} className="bg-white text-black px-6 py-3 rounded-xl font-bold">
              Customer Support
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-5 mt-9 text-2xl font-black">
            <div>Search by country, city, or area</div>
            <div>Filter by facilities that matter</div>
            <div>Compare stays before you decide</div>
            <div>Request availability directly</div>
          </div>
        </section>

        <section className="bg-[#edf5ff] rounded-[32px] p-8">
          <h2 className="text-3xl font-black">Search real hotels</h2>
          <p className="mt-5 text-lg">Search broadly or narrow your stay by destination, neighbourhood, and facilities.</p>

          <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country, e.g. UK, USA, NG" className="w-full p-4 rounded-2xl border mt-8 text-lg" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City, e.g. London, Abuja" className="w-full p-4 rounded-2xl border mt-4 text-lg" />
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area, e.g. Mayfair, Lekki, City Centre" className="w-full p-4 rounded-2xl border mt-4 text-lg" />
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Hotel name or keyword" className="w-full p-4 rounded-2xl border mt-4 text-lg" />

          <div className="flex flex-wrap gap-2 items-center mt-5">
            <b className="mr-2">Guests</b>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setGuests(n)}
                className={`px-5 py-3 rounded-xl border ${guests === n ? "bg-yellow-400 font-black" : "bg-white"}`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-3xl p-6 mt-5">
            <h3 className="font-black text-xl mb-4">Choose preferred facilities</h3>
            <div className="grid grid-cols-2 gap-3">
              {FACILITIES.map((item) => (
                <label key={item} className="text-lg">
                  <input
                    type="checkbox"
                    checked={selectedFacilities.includes(item)}
                    onChange={() => toggleFacility(item)}
                    className="mr-3"
                  />
                  {item}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={searchHotels}
            disabled={loading}
            className="mt-5 w-full bg-yellow-400 text-black font-black text-xl py-5 rounded-2xl border-2 border-black"
          >
            {loading ? "Searching..." : "Search hotels"}
          </button>

          {notice && <div className="mt-4 bg-yellow-100 rounded-xl p-4 font-bold">{notice}</div>}
        </section>
      </section>

      <section className="max-w-[1700px] mx-auto grid xl:grid-cols-[1.3fr_1fr] gap-6 mt-6">
        <section className="bg-[#edf5ff] rounded-[32px] p-8">
          <h2 className="tracking-[0.4em] text-xl font-black text-slate-500">AVAILABLE STAYS</h2>
          <p className="text-3xl font-black mt-6">{hotels.length} stays shown</p>

          <div className="grid gap-5 mt-6 max-h-[780px] overflow-y-auto pr-2">
            {hotels.map((hotel, index) => {
              const img = imageUrl(hotel);
              return (
                <button
                  key={hotel.id || index}
                  onClick={() => setSelectedHotel(hotel)}
                  className="text-left bg-white rounded-3xl overflow-hidden border hover:border-blue-700"
                >
                  {img ? (
                    <img src={img} alt={hotel.name || "Hotel"} className="w-full h-72 object-cover bg-slate-100" loading="lazy" />
                  ) : (
                    <div className="w-full h-40 bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                      Image not supplied for this hotel
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="text-2xl font-black">{hotel.name || "Hotel"}</h3>
                    <p className="mt-2 text-lg">{[hotel.area, hotel.city, hotel.country].filter(Boolean).join(", ")}</p>
                    <p className="mt-2 font-bold">
                      {hotel.rating ? `${hotel.rating} star` : "Rating not supplied"}
                      {hotel.review_score ? ` • Review ${hotel.review_score}` : ""}
                    </p>
                    {hotel.address && <p className="mt-2">{hotel.address}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="bg-white rounded-[32px] p-8">
          <h2 className="tracking-[0.4em] text-xl font-black text-slate-500">REQUEST AVAILABILITY</h2>
          <h3 className="text-3xl font-black mt-6">Send your reservation request</h3>

          <div className="mt-6 bg-[#f3f7ff] rounded-2xl p-5 font-bold">
            {selectedHotel ? selectedHotel.name : "Select a hotel from the list to continue."}
          </div>

          <input placeholder="Your name" className="w-full p-4 rounded-2xl border mt-4" />
          <input placeholder="Your email" className="w-full p-4 rounded-2xl border mt-4" />
          <textarea placeholder="Special requests, dates, room needs, or questions" className="w-full p-4 rounded-2xl border mt-4 h-36" />

          <button className="mt-5 w-full bg-yellow-400 text-black font-black text-xl py-5 rounded-2xl">
            Request availability
          </button>
        </section>
      </section>
    </main>
  );
}
