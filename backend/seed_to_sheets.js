require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('credentials.json not found!');
    process.exit(1);
}
if (!spreadsheetId) {
    console.error('GOOGLE_SPREADSHEET_ID not set!');
    process.exit(1);
}

const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

const SHEET_HEADERS = {
    users: ['id', 'username', 'email', 'password', 'role', 'created_at'],
    memos: ['id', 'user_id', 'content', 'completed', 'created_at'],
    study_sessions: ['id', 'user_id', 'duration', 'tree_planted', 'start_time', 'end_time'],
    connection_logs: ['id', 'user_id', 'login_time', 'ip_address']
};

const LOCAL_DB_PATH = path.join(__dirname, 'db_local.json');
const dbData = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));

async function seed() {
    console.log('Seeding local mockup data to Google Sheets...');
    for (const sheetName of Object.keys(SHEET_HEADERS)) {
        const items = dbData[sheetName] || [];
        const headers = SHEET_HEADERS[sheetName];
        
        console.log(`Clearing sheet: ${sheetName}`);
        await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range: `${sheetName}!A2:Z9999`
        });

        if (items.length > 0) {
            const values = items.map(item => {
                return headers.map(header => {
                    let val = item[header];
                    if (val === undefined || val === null) return '';
                    return String(val);
                });
            });

            console.log(`Writing ${items.length} items to sheet ${sheetName}`);
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetName}!A2`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values }
            });
        }
    }
    console.log('Mockup data seeding completed successfully!');
}

seed().catch(err => console.error('Seeding failed:', err));
