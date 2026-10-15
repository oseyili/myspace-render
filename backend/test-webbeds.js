// test-webbeds.js — Standalone WebBeds DOTW v4 test
require('dotenv').config();
const { XMLParser } = require('fast-xml-parser');

const USERNAME = process.env.WEBBEDS_USERNAME;
const PASSWORD = process.env.WEBBEDS_PASSWORD;
const COMPANY_ID = process.env.WEBBEDS_COMPANY_ID;
const BASE_URL = process.env.WEBBEDS_BASE_URL || 'https://xmldev.dotwconnect.com';
const SOURCE = '1';

console.log('=== WebBeds Test Configuration ===');
console.log('Base URL:', BASE_URL);
console.log('Username:', USERNAME);
console.log('Company ID:', COMPANY_ID);
console.log('Password set:', !!PASSWORD);
console.log('');

// Build the XML request for a London hotel search
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
const checkIn = today.toISOString().split('T')[0];
const checkOut = tomorrow.toISOString().split('T')[0];

const xmlRequest = `<?xml version="1.0" encoding="UTF-8"?>
<customer>
    <username>${USERNAME}</username>
    <password>${PASSWORD}</password>
    <id>${COMPANY_ID}</id>
    <source>${SOURCE}</source>
    <product>hotel</product>
    <request command="searchhotels">
        <bookingDetails>
            <fromDate>${checkIn}</fromDate>
            <toDate>${checkOut}</toDate>
            <currency>GBP</currency>
            <rooms no="1">
                <room runno="0">
                    <adultsCode>1</adultsCode>
                    <children no="0"></children>
                    <rateBasis>-1</rateBasis>
                </room>
            </rooms>
        </bookingDetails>
        <return>
            <getRooms>true</getRooms>
            <filters>
                <city>1339</city>
                <noPrice>true</noPrice>
            </filters>
            <fields>
                <field>hotelName</field>
                <field>hotelImages</field>
                <field>fullAddress</field>
                <field>rating</field>
                <field>description1</field>
            </fields>
        </return>
    </request>
</customer>`;

console.log('=== Sending request to WebBeds ===');
console.log('Check-in:', checkIn, '| Check-out:', checkOut);
console.log('');

fetch(`${BASE_URL}/gatewayV4.dotw`, {
    method: 'POST',
    headers: {
        'Content-Type': 'text/xml',
        'Connection': 'close'
    },
    body: xmlRequest
})
    .then(async (response) => {
        console.log('HTTP Status:', response.status, response.statusText);
        const text = await response.text();
        console.log('');
        console.log('=== Raw Response (first 3000 chars) ===');
        console.log(text.slice(0, 3000));
        console.log('');
        console.log('=== Parsing XML ===');
        try {
            const parser = new XMLParser({ ignoreAttributes: false });
            const json = parser.parse(text);
            console.log('Parsed keys:', Object.keys(json));
            const result = json.result || json;
            console.log('Successful:', result.successful);
            const hotels = result?.hotels?.hotel;
            if (Array.isArray(hotels)) {
                console.log('Hotels found:', hotels.length);
                console.log('First hotel:', JSON.stringify(hotels[0], null, 2).slice(0, 1500));
            } else if (hotels) {
                console.log('Single hotel returned:', JSON.stringify(hotels, null, 2).slice(0, 1500));
            } else {
                console.log('No hotels in response.');
            }
        } catch (err) {
            console.log('XML parse error:', err.message);
        }
    })
    .catch((err) => {
        console.log('Request failed:', err.message);
    });