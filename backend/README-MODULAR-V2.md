# MySpace Backend Modular V2

This package turns the old 10,000+ line backend into a modular bootstrap while preserving every existing endpoint through `legacy/app.js`.

## New working flow

`server.js -> routes -> controllers -> searchOrchestrator -> supplier adapters -> universal hotel model -> ranking/cache -> response`

## Important endpoints

- `GET /api/platform/v2/status`
- `GET /api/platform/v2/search?country=United%20Kingdom&city=London&currency=GBP&limit=60`
- `GET /api/platform/v2/selected-live-rate?...`
- `GET /api/search?...` alias to the v2 orchestrator

## Legacy compatibility

The original backend code is preserved in `legacy/app.js` with its `app.listen` removed. The new `server.js` controls startup.

## Supplier modules now created

- `services/suppliers/hyperguest/index.js`
- `services/suppliers/hotelbeds/index.js`
- `services/suppliers/webbeds/index.js`
- `services/suppliers/ratehawk/index.js`

During this transition they consume the proven existing supplier-union search from the legacy engine, split/normalize supplier rows, and return a universal hotel model. Next phase is to move each direct supplier HTTP connector from `legacy/app.js` into those adapter files.
