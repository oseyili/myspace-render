import React from "react";

export const pages = [
{
title: "Best Hotels in London",
slug: "london-hotels",
content: `London offers one of the widest selections of accommodation in the world. Whether you are travelling for business, leisure, or a short city break, there are options for every budget.

Popular areas include Central London, Westminster, Kensington, Canary Wharf, and Paddington.

When booking, consider transport access, breakfast options, cancellation flexibility, and guest reviews.

My Space Hotel helps you compare London hotel options and book securely through trusted partners.`
},

{
title: "Where to Stay in Paris",
slug: "paris-hotels",
content: `Paris offers a wide range of hotels from boutique stays to luxury accommodation.

Popular areas include Central Paris, Eiffel Tower district, Latin Quarter, and Montmartre.

Check metro access, room size, cancellation policies, and location before booking.

Use My Space Hotel to compare and book through trusted providers.`
},

{
title: "Hotels in Dubai",
slug: "dubai-hotels",
content: `Dubai is known for luxury hotels, business accommodation, and family-friendly resorts.

Popular areas include Downtown Dubai, Dubai Marina, Palm Jumeirah, and Business Bay.

Look for pool access, airport transfers, and flexible booking options.

My Space Hotel helps you find and compare Dubai stays easily.`
},

{
title: "Family-Friendly Hotels",
slug: "family-hotels",
content: `Family travel requires comfort and convenience.

Look for family rooms, breakfast included, swimming pool, and safe locations.

Also consider nearby transport and flexible cancellation.

My Space Hotel helps families find suitable accommodation quickly.`
},

{
title: "Business Travel Hotels",
slug: "business-hotels",
content: `Business travellers need reliable WiFi, convenient location, and fast check-in.

Look for hotels near airports, city centres, or business districts.

Flexible booking is important for changing schedules.

Use My Space Hotel to compare business-friendly stays.`
},

{
title: "Budget Hotels Guide",
slug: "budget-hotels",
content: `Budget hotels can still offer comfort and value.

Check guest ratings, location, WiFi, and cancellation policies.

Avoid choosing based only on price—focus on value.

My Space Hotel helps you compare affordable stays easily.`
},

{
title: "Luxury Hotels Guide",
slug: "luxury-hotels",
content: `Luxury hotels offer premium comfort, location, and service.

Look for high ratings, spacious rooms, and premium facilities.

Popular luxury destinations include London, Paris, and Dubai.

Compare luxury stays easily with My Space Hotel.`
},

{
title: "Last-Minute Hotel Booking",
slug: "last-minute-hotels",
content: `Last-minute travel requires quick decisions.

Focus on location, availability, and flexible booking.

Compare central vs airport locations for convenience.

My Space Hotel helps you find last-minute stays fast.`
},

{
title: "Hotel Booking Tips",
slug: "booking-tips",
content: `Always review booking details before confirming.

Check dates, guest count, cancellation policy, and total price.

Also review guest ratings and location.

My Space Hotel helps you make informed decisions before booking.`
},

{
title: "City Break Hotels",
slug: "city-break-hotels",
content: `City breaks require convenient locations.

Look for walkable areas, transport access, and nearby attractions.

Short stays benefit from central locations.

Use My Space Hotel to find the perfect city break stay.`
}
];

export default function TravelPages() {
return (
<div style={{padding:"40px", maxWidth:"900px", margin:"auto"}}>
<h1>Travel Guides</h1>
{pages.map((p) => (
<div key={p.slug} style={{marginBottom:"30px"}}>
<h2>{p.title}</h2>
<p>{p.content}</p>
</div>
))}
</div>
);
}