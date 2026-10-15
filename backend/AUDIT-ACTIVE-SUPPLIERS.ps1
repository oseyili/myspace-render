$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Checking JavaScript syntax..."
node --check .\legacy\app.js
node --check .\services\search\searchOrchestrator.js
node --check .\services\supplierContentResolver.js
node --check .\models\universalHotel.js
Write-Host "Checking active supplier contamination..."
$hits = Get-ChildItem .\services, .\config, .\data\supplier_destination_map.json -Recurse -File | Select-String -Pattern "hyperguest_hotelbeds|webbeds_ratehawk_hyperguest_hotelbeds"
if ($hits) { $hits | Format-Table Path,LineNumber,Line -AutoSize; throw "Inactive Hotelbeds scope remains." }
Write-Host "Syntax and active supplier checks passed."
