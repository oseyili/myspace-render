from pathlib import Path

p = Path("frontend/src/App.jsx")
s = p.read_text(encoding="utf-8")

s = s.replace(
'      if (list.length > 0) {\n        setMessage(`${list.length} available stays found in ${dest.name}. Choose your stay to review the details and continue securely.`);\n      } else {\n        setMessage(`No available stays found for ${dest.name}. Try different dates, fewer guests, or another destination.`);\n      }',
'''      const pricedCount = list.filter((h) => h.first_rate && !h.price_confirmation_required).length;
      const reviewOnlyCount = list.length - pricedCount;

      if (pricedCount > 0) {
        setMessage(`${pricedCount} priced bookable stays found in ${dest.name}. ${reviewOnlyCount > 0 ? `${reviewOnlyCount} extra image-only hotels need live price confirmation.` : ""}`);
      } else if (list.length > 0) {
        setMessage(`${list.length} hotels found in ${dest.name}, but live prices are not loaded for this destination yet. These are image-only review results.`);
      } else {
        setMessage(`No hotels found for ${dest.name}. Try another destination or search by city code.`);
      }'''
)

s = s.replace(
'            <h2>{normalisedHotels.length} available stays</h2>',
'''            <h2>{normalisedHotels.filter((h) => h.first_rate && !h.price_confirmation_required).length} priced bookable stays</h2>
            <p style={styles.resultSubline}>{normalisedHotels.filter((h) => !h.first_rate || h.price_confirmation_required).length} image-only hotels need live price confirmation.</p>'''
)

s = s.replace(
'                      {hotel.price_confirmation_required ? "Check today’s price before booking" : "Ready to book securely"}',
'                      {hotel.price_confirmation_required || !rate ? "Image-only result — live price needed" : "Ready to book securely"}'
)

s = s.replace(
'<p><b>Status:</b> Available to review</p>\n                          <p><b>Next step:</b> Choose this stay to check the latest room and price details.</p>',
'<p><b>Status:</b> Image-only hotel record</p>\n                          <p><b>Price:</b> Live price not loaded for this destination yet.</p>\n                          <p><b>Next step:</b> Use a priced hotel, or refresh live rates for this destination before booking.</p>'
)

if "resultSubline:" not in s:
    s = s.replace(
'  results:',
'  resultSubline: { marginTop: -8, color: "#526782", fontWeight: 900 },\n  results:'
)

p.write_text(s, encoding="utf-8")
print("Frontend price clarity fixed.")
