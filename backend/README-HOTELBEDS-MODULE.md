# MySpace Platform V2 - Hotelbeds Module Migration

This package starts the real supplier extraction by moving Hotelbeds into a dedicated module:

`services/suppliers/hotelbeds/index.js`

The module now owns:

- Hotelbeds configuration and readiness checks
- Hotelbeds API signature creation
- destination code resolution
- availability request body construction
- Hotelbeds API call
- response mapping into the universal hotel model
- Hotelbeds image lookup
- supplier status endpoint
- supplier-only search endpoint

## New test endpoints

- `GET /api/platform/v2/suppliers/hotelbeds/status`
- `GET /api/platform/v2/suppliers/hotelbeds/search?country=United%20Kingdom&city=London&currency=GBP&limit=20`
- `GET /api/platform/v2/search?country=United%20Kingdom&city=London&currency=GBP&limit=20`

## Required env

- `HOTELBEDS_API_KEY`
- `HOTELBEDS_SECRET`
- optional `HOTELBEDS_BASE_URL`
- optional `HOTELBEDS_DEFAULT_DESTINATION`
- optional `HOTELBEDS_DESTINATIONS` JSON map

Example destination map:

```json
{"united kingdom|london":"LON","france|paris":"PAR","united arab emirates|dubai":"DXB"}
```

This still preserves `legacy/app.js` for all old routes while Hotelbeds now has a real modular adapter.
