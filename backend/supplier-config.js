module.exports = {
  suppliers: [
    {
      id: "hotelbeds",
      name: "Hotelbeds",
      enabled: true,
      type: "live",
      priority: 1,
      env: {
        apiKey: "HOTELBEDS_API_KEY",
        secret: "HOTELBEDS_SECRET",
        baseUrl: "HOTELBEDS_BASE_URL"
      }
    },

    {
      id: "expedia",
      name: "Expedia Rapid",
      enabled: false,
      type: "live",
      priority: 2,
      env: {
        apiKey: "EXPEDIA_API_KEY",
        secret: "EXPEDIA_SECRET",
        baseUrl: "EXPEDIA_BASE_URL"
      }
    },

    {
      id: "agoda",
      name: "Agoda Partner",
      enabled: false,
      type: "live",
      priority: 3,
      env: {
        apiKey: "AGODA_API_KEY",
        secret: "AGODA_SECRET",
        baseUrl: "AGODA_BASE_URL"
      }
    },

    {
      id: "amadeus",
      name: "Amadeus Hotel API",
      enabled: false,
      type: "live",
      priority: 4,
      env: {
        clientId: "AMADEUS_CLIENT_ID",
        clientSecret: "AMADEUS_CLIENT_SECRET",
        baseUrl: "AMADEUS_BASE_URL"
      }
    },

    {
      id: "travelpayouts",
      name: "Travelpayouts / Hotellook",
      enabled: false,
      type: "affiliate",
      priority: 5,
      env: {
        token: "TRAVELPAYOUTS_TOKEN",
        marker: "TRAVELPAYOUTS_MARKER",
        baseUrl: "TRAVELPAYOUTS_BASE_URL"
      }
    },

    {
      id: "booking",
      name: "Booking Affiliate",
      enabled: false,
      type: "affiliate",
      priority: 6,
      env: {
        affiliateId: "BOOKING_AFFILIATE_ID",
        baseUrl: "BOOKING_BASE_URL"
      }
    }
  ]
};
