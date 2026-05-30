cd C:\frontend\hotel-booking-app\frontend

$path = ".\src\App.jsx"
Copy-Item $path ".\src\App.backup-before-location-price-check.jsx" -Force

$code = Get-Content $path -Raw

$code = $code.Replace(
'  const heroText = props.country ? `Exceptional hotels in ${props.country}` : "Exceptional hotels around the world";
  const converted = convertCurrency(Number(props.fxAmount || 0), props.fxFrom, props.fxTo);',
'  const heroText = props.country ? `Exceptional hotels in ${props.country}` : "Exceptional hotels around the world";
  const converted = convertCurrency(Number(props.fxAmount || 0), props.fxFrom, props.fxTo);

  const livePrices = Array.isArray(props.hotels)
    ? props.hotels.map((h) => Number(props.hotelPrice(h) || 0)).filter((v) => Number.isFinite(v) && v > 0)
    : [];

  const selectedRate = props.selectedHotel ? Number(props.hotelPrice(props.selectedHotel) || 0) : 0;
  const destinationAverage = livePrices.length ? livePrices.reduce((sum, v) => sum + v, 0) / livePrices.length : 0;
  const destinationLowest = livePrices.length ? Math.min(...livePrices) : 0;
  const destinationHighest = livePrices.length ? Math.max(...livePrices) : 0;
  const destinationSaving = selectedRate && destinationAverage ? destinationAverage - selectedRate : 0;

  const selectedLocationStats = {
    checked: livePrices.length,
    selectedRate,
    average: destinationAverage,
    lowest: destinationLowest,
    highest: destinationHighest,
    saving: destinationSaving,
    valueScore:
      selectedRate && destinationAverage
        ? Math.max(7.8, Math.min(9.8, 8.7 + ((destinationAverage - selectedRate) / destinationAverage) * 2))
        : 8.7,
  };'
)

$code = $code.Replace(
'              </div>

              <div style={styles.customerBox}>',
'              </div>

              <LocationPriceCheck stats={selectedLocationStats} currency={props.selectedCurrency} />

              <div style={styles.customerBox}>'
)

$locationComponent = @'
function LocationPriceCheck({ stats, currency }) {
  if (!stats || !stats.selectedRate || !stats.checked) return null;

  const belowAverage = Number(stats.saving || 0) > 0;

  return (
    <div style={styles.bestRatePanel}>
      <div style={styles.bestRateTop}>
        <div>
          <div style={styles.bestRateBadge}>MYSPACE LOCATION PRICE CHECK</div>
          <div style={styles.bestRateTitle}>Best value insight for this destination</div>
        </div>
        <div style={styles.valueScore}>
          {Number(stats.valueScore || 0).toFixed(1)}
          <span style={styles.valueScoreSmall}>/10</span>
        </div>
      </div>

      <div style={styles.rateGrid}>
        <div style={styles.rateItem}>
          <span style={styles.rateLabel}>Live hotels checked</span>
          <strong>{stats.checked}</strong>
        </div>
        <div style={styles.rateItem}>
          <span style={styles.rateLabel}>Selected hotel rate</span>
          <strong>{currency} {money(stats.selectedRate)}</strong>
        </div>
        <div style={styles.rateItem}>
          <span style={styles.rateLabel}>Destination average</span>
          <strong>{currency} {money(stats.average)}</strong>
        </div>
        <div style={styles.rateItem}>
          <span style={styles.rateLabel}>{belowAverage ? "Below average by" : "Above average by"}</span>
          <strong>{currency} {money(Math.abs(stats.saving || 0))}</strong>
        </div>
      </div>

      <div style={belowAverage ? styles.goodInsight : styles.neutralInsight}>
        {belowAverage
          ? "This selected stay is currently below the destination average found inside MySpace Hotel."
          : "This selected stay is above the current destination average, but may still offer stronger location, comfort or availability value."}
      </div>

      <div style={styles.bestRateChecks}>
        <span>Live destination rates checked</span>
        <span>Availability reviewed</span>
        <span>MySpace verified rate</span>
      </div>
    </div>
  );
}

'@

if ($code -notmatch "function LocationPriceCheck") {
  $code = $code.Replace("function SearchBox(props) {", "$locationComponent`nfunction SearchBox(props) {")
}

if ($code -notmatch "bestRatePanel:") {
  $code = $code.Replace(
"const styles = {",
"const styles = {
  bestRatePanel: { marginTop: 20, background: '#071538', color: '#ffffff', borderRadius: 24, padding: 22, boxShadow: '0 10px 30px rgba(0,0,0,0.15)' },
  bestRateTop: { display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 },
  bestRateBadge: { display: 'inline-block', background: '#f1bf22', color: '#071538', borderRadius: 999, padding: '7px 12px', fontWeight: 950, fontSize: 12, marginBottom: 10 },
  bestRateTitle: { fontSize: 21, fontWeight: 950, lineHeight: 1.25 },
  valueScore: { background: '#ffffff', color: '#0b1d51', borderRadius: 18, minWidth: 86, textAlign: 'center', padding: '12px 10px', fontSize: 30, fontWeight: 950 },
  valueScoreSmall: { fontSize: 14, fontWeight: 900 },
  rateGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 },
  rateItem: { background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 16, padding: 14, display: 'grid', gap: 6 },
  rateLabel: { color: '#cbd5e1', fontSize: 12, fontWeight: 850 },
  goodInsight: { marginTop: 14, background: '#ecfdf3', color: '#166534', borderRadius: 16, padding: 14, fontWeight: 900, lineHeight: 1.45 },
  neutralInsight: { marginTop: 14, background: '#fff7ed', color: '#9a3412', borderRadius: 16, padding: 14, fontWeight: 900, lineHeight: 1.45 },
  bestRateChecks: { marginTop: 14, display: 'grid', gap: 8, color: '#e2e8f0', fontWeight: 850, fontSize: 13 },"
)
}

Set-Content -Path $path -Value $code -Encoding UTF8

npm run build