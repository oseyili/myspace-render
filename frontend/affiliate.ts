export type AffiliateProvider = "booking" | "agoda" | "travelpayouts" | "none";

export type AffiliateHotel = {
  name?: string;
  location?: string;
  country?: string;
  city?: string;
  hotel_id?: string;
};

function safeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildSearchText(hotel: AffiliateHotel): string {
  const parts = [
    safeText(hotel.name),
    safeText(hotel.city),
    safeText(hotel.location),
    safeText(hotel.country),
  ].filter(Boolean);

  return parts.join(", ");
}

function formatDate(value: string): string {
  return value;
}

function getProvider(): AffiliateProvider {
  const raw = (process.env.NEXT_PUBLIC_AFFILIATE_PROVIDER || "none").toLowerCase();

  if (raw === "booking") return "booking";
  if (raw === "agoda") return "agoda";
  if (raw === "travelpayouts") return "travelpayouts";
  return "none";
}

function buildBookingUrl(
  hotel: AffiliateHotel,
  checkIn: string,
  checkOut: string,
  guests: number,
  rooms: number
): string {
  const aid = (process.env.NEXT_PUBLIC_BOOKING_AID || "").trim();
  if (!aid) return "";

  const params = new URLSearchParams();
  params.set("aid", aid);
  params.set("label", "myspace_hotel_app");
  params.set("checkin", formatDate(checkIn));
  params.set("checkout", formatDate(checkOut));
  params.set("group_adults", String(Math.max(1, guests)));
  params.set("no_rooms", String(Math.max(1, rooms)));

  const searchText = buildSearchText(hotel);
  if (searchText) {
    params.set("ss", searchText);
  }

  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

function buildAgodaUrl(
  hotel: AffiliateHotel,
  checkIn: string,
  checkOut: string,
  guests: number,
  rooms: number
): string {
  const affiliateId = (process.env.NEXT_PUBLIC_AGODA_AFFILIATE_ID || "").trim();
  if (!affiliateId) return "";

  const params = new URLSearchParams();
  params.set("cid", affiliateId);
  params.set("checkIn", formatDate(checkIn));
  params.set("checkOut", formatDate(checkOut));
  params.set("adults", String(Math.max(1, guests)));
  params.set("rooms", String(Math.max(1, rooms)));

  const searchText = buildSearchText(hotel);
  if (searchText) {
    params.set("textToSearch", searchText);
  }

  return `https://www.agoda.com/search?${params.toString()}`;
}

function buildTravelpayoutsUrl(
  hotel: AffiliateHotel,
  checkIn: string,
  checkOut: string,
  guests: number,
  rooms: number
): string {
  const marker = (process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER || "").trim();
  const host = (process.env.NEXT_PUBLIC_TRAVELPAYOUTS_HOST || "https://tp.media").trim();

  if (!marker) return "";

  const destination = buildSearchText(hotel);
  const deepLink = new URL("https://search.hotellook.com/");
  deepLink.searchParams.set("destination", destination || "Hotel");
  deepLink.searchParams.set("checkIn", formatDate(checkIn));
  deepLink.searchParams.set("checkOut", formatDate(checkOut));
  deepLink.searchParams.set("adults", String(Math.max(1, guests)));
  deepLink.searchParams.set("rooms", String(Math.max(1, rooms)));

  const wrapper = new URL(`${host.replace(/\/$/, "")}/r`);
  wrapper.searchParams.set("marker", marker);
  wrapper.searchParams.set("trs", "426710");
  wrapper.searchParams.set("p", "4114");
  wrapper.searchParams.set("u", deepLink.toString());

  return wrapper.toString();
}

export function getAffiliateCheckoutLabel(): string {
  const provider = getProvider();

  if (provider === "booking") return "Check availability on Booking.com";
  if (provider === "agoda") return "Check availability on Agoda";
  if (provider === "travelpayouts") return "Check hotel options";
  return "Affiliate booking unavailable";
}

export function getAffiliateDisclosure(): string {
  const provider = getProvider();

  if (provider === "booking") {
    return "You will be redirected to Booking.com to complete your reservation.";
  }

  if (provider === "agoda") {
    return "You will be redirected to Agoda to complete your reservation.";
  }

  if (provider === "travelpayouts") {
    return "You will be redirected to our travel partner to complete your reservation.";
  }

  return "Affiliate booking is not active yet.";
}

export function buildAffiliateUrl(args: {
  hotel: AffiliateHotel;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
}): string {
  const provider = getProvider();

  if (provider === "booking") {
    return buildBookingUrl(args.hotel, args.checkIn, args.checkOut, args.guests, args.rooms);
  }

  if (provider === "agoda") {
    return buildAgodaUrl(args.hotel, args.checkIn, args.checkOut, args.guests, args.rooms);
  }

  if (provider === "travelpayouts") {
    return buildTravelpayoutsUrl(args.hotel, args.checkIn, args.checkOut, args.guests, args.rooms);
  }

  return "";
}