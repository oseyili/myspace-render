# MySpace Hotelbeds Module Apply

This package keeps the 404 KB legacy backend in `legacy/app.js`, keeps `server.js` as bootstrap, and adds the dedicated Hotelbeds module plus test routes.

New routes:

- `/api/platform/v2/suppliers/hotelbeds/status`
- `/api/platform/v2/suppliers/hotelbeds/search?country=United%20Kingdom&city=London&currency=GBP&limit=20`

Safe install:

1. Extract the ZIP.
2. Right click `APPLY-HOTELBEDS-MODULE.ps1` and run with PowerShell, or paste this from the extracted backend folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\APPLY-HOTELBEDS-MODULE.ps1
```

The script stops node, backs up `C:\frontend\hotel-booking-app\backend-backup-old`, replaces it with this backend, then starts `node server.js`.
