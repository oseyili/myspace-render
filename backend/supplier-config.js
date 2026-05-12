module.exports = {
  suppliers: [
    {
      id: "hotelbeds",
      name: "Hotelbeds",
      enabled: true,
      type: "live",
      priority: 1,
      realOnly: true,
      requireLiveRateKey: true,
      requireRealImage: true,
      env: {
        apiKey: "HOTELBEDS_API_KEY",
        secret: "HOTELBEDS_SECRET",
        baseUrl: "HOTELBEDS_BASE_URL"
      }
    }
  ],

  rules: {
    noPlaceholders: true,
    noFakeRates: true,
    noFakeImages: true,
    noAffiliateFallbackUnlessLivePayable: true,
    requireFreshDestinationRateOnCustomerSearch: true,
    requireRateKeyBeforePayment: true,
    requirePositivePayableAmount: true,
    requireSupplierConfirmationBeforePaidStatus: true
  }
};
