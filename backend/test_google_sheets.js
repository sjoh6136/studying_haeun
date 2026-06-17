require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

console.log("Using spreadsheet ID:", spreadsheetId);
console.log("Checking credentials at:", CREDENTIALS_PATH);

if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('Error: credentials.json not found!');
    process.exit(1);
}

try {
    const auth = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    
    auth.getClient().then(client => {
        const sheets = google.sheets({ version: 'v4', auth: client });
        
        sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'users!A:Z'
        }).then(res => {
            console.log("Successfully connected!");
            console.log("Sheet rows:", res.data.values);
        }).catch(err => {
            console.error("Google Sheets API Request failed:", err.message);
            if (err.response) {
                console.error("Details:", err.response.data);
            }
        });
    });
} catch (e) {
    console.error("Auth initialization failed:", e.message);
}
