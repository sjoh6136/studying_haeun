const fs = require('fs');
const path = require('path');

const LOCAL_DB_PATH = path.join(__dirname, 'db_local.json');
let CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
if (!fs.existsSync(CREDENTIALS_PATH)) {
    const parentCredentials = path.join(__dirname, '..', 'credentials.json');
    if (fs.existsSync(parentCredentials)) {
        CREDENTIALS_PATH = parentCredentials;
    }
}

// Cache Google sheets API client
let sheetsClient = null;
let googleAuth = null;
const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const defaultDbMode = (fs.existsSync(CREDENTIALS_PATH) && spreadsheetId) ? 'sheets' : 'local';
const dbMode = process.env.DB_MODE || defaultDbMode; // 'local' or 'sheets'
process.env.DB_MODE = dbMode;

// Default JSON DB Schema
const defaultSchema = {
    users: [
        // Admin account created by default
        {
            id: 1,
            username: 'admin',
            password: 'admin123', // plain text for 'admin123'
            role: 'admin',
            created_at: new Date().toISOString()
        }
    ],
    memos: [],
    study_sessions: [],
    connection_logs: [],
    notices: []
};

// --- Local File Database helpers ---
function readLocalDB() {
    try {
        if (!fs.existsSync(LOCAL_DB_PATH)) {
            fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(defaultSchema, null, 2), 'utf8');
            return defaultSchema;
        }
        const content = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error('Error reading local JSON database:', err);
        return defaultSchema;
    }
}

function writeLocalDB(data) {
    try {
        fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing to local JSON database:', err);
    }
}

// --- Google Sheets Connection Initialization ---
function getSheetsService() {
    if (sheetsClient) return sheetsClient;

    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.warn('Google Sheets credentials.json not found. Falling back to local JSON database.');
        process.env.DB_MODE = 'local';
        return null;
    }
    if (!spreadsheetId) {
        console.warn('GOOGLE_SPREADSHEET_ID not set in environment. Falling back to local JSON database.');
        process.env.DB_MODE = 'local';
        return null;
    }

    try {
        const { google } = require('googleapis');
        googleAuth = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        sheetsClient = google.sheets({ version: 'v4', auth: googleAuth });
        return sheetsClient;
    } catch (err) {
        console.error('Failed to initialize Google Sheets service. Falling back to local JSON database.', err);
        process.env.DB_MODE = 'local';
        return null;
    }
}

// Sheet headers definition
const SHEET_HEADERS = {
    users: ['id', 'username', 'password', 'role', 'created_at'],
    memos: ['id', 'user_id', 'content', 'completed', 'created_at'],
    study_sessions: ['id', 'user_id', 'duration', 'tree_planted', 'start_time', 'end_time'],
    connection_logs: ['id', 'user_id', 'login_time', 'ip_address'],
    notices: ['id', 'content', 'type', 'created_at']
};

// Ensure sheets exist on Google Spreadsheets
async function ensureSheets() {
    const service = getSheetsService();
    if (!service || process.env.DB_MODE === 'local') return;

    try {
        const spreadsheet = await service.spreadsheets.get({ spreadsheetId });
        const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);

        for (const sheetName of Object.keys(SHEET_HEADERS)) {
            if (!existingSheets.includes(sheetName)) {
                console.log(`Creating sheet: ${sheetName}`);
                await service.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        requests: [
                            {
                                addSheet: {
                                    properties: { title: sheetName }
                                }
                            }
                        ]
                    }
                });

                // Write headers immediately
                await service.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: [SHEET_HEADERS[sheetName]]
                    }
                });
            }
        }
    } catch (err) {
        console.error('Error validating or creating sheets in Google Sheets:', err);
        console.warn('Falling back to local database.');
        process.env.DB_MODE = 'local';
    }
}

// Initialize tables / DB state
if (dbMode === 'sheets') {
    ensureSheets().then(async () => {
        console.log(`Database initialized in Google Sheets mode (Spreadsheet: ${spreadsheetId})`);
        try {
            const users = await fetchTable('users');
            if (users.length === 0) {
                console.log('No users found in Google Sheets. Seeding default admin user...');
                const adminPasswordHash = 'admin123'; // 'admin123'
                const defaultAdmin = {
                    id: 1,
                    username: 'admin',
                    password: adminPasswordHash,
                    role: 'admin',
                    created_at: new Date().toISOString()
                };
                await saveTable('users', [defaultAdmin]);
                console.log('Default admin seeded successfully to Google Sheets.');
            }
        } catch (e) {
            console.error('Error seeding default admin in sheets:', e);
        }
    });
} else {
    readLocalDB(); // Creates local file if missing
    console.log(`Database initialized in Local JSON File mode (${LOCAL_DB_PATH})`);
}

// --- High-Level Database operations (Unified API) ---

async function fetchTable(sheetName) {
    const activeMode = process.env.DB_MODE || 'local';
    
    if (activeMode === 'local') {
        const db = readLocalDB();
        return db[sheetName] || [];
    }

    // Google Sheets mode
    const service = getSheetsService();
    if (!service) {
        const db = readLocalDB();
        return db[sheetName] || [];
    }

    try {
        const response = await service.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:Z`
        });
        const rows = response.data.values;
        if (!rows || rows.length <= 1) return [];

        const headers = rows[0];
        const dataRows = rows.slice(1);

        return dataRows.map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                let val = row[index] !== undefined ? row[index] : '';
                // Type conversions where helpful
                if (header === 'id' || header === 'user_id' || header === 'duration' || header === 'completed') {
                    if (val !== '') val = Number(val);
                }
                obj[header] = val;
            });
            return obj;
        });
    } catch (err) {
        console.error(`Error fetching table ${sheetName} from Google Sheets:`, err);
        // Fallback to local DB on sheets API error
        const db = readLocalDB();
        return db[sheetName] || [];
    }
}

class TaskQueue {
    constructor() {
        this.queue = Promise.resolve();
    }
    add(fn) {
        return new Promise((resolve, reject) => {
            this.queue = this.queue.then(() => {
                return fn().then(resolve).catch(reject);
            });
        });
    }
}
const dbWriteQueue = new TaskQueue();

async function saveTable(sheetName, items) {
    const activeMode = process.env.DB_MODE || 'local';

    if (activeMode === 'local') {
        const db = readLocalDB();
        db[sheetName] = items;
        writeLocalDB(db);
        return;
    }

    // Google Sheets mode
    const service = getSheetsService();
    if (!service) {
        const db = readLocalDB();
        db[sheetName] = items;
        writeLocalDB(db);
        return;
    }

    try {
        const headers = SHEET_HEADERS[sheetName];
        
        // 1. Clear existing sheet contents (from A2 downwards)
        await service.spreadsheets.values.clear({
            spreadsheetId,
            range: `${sheetName}!A2:Z9999`
        });

        if (items.length === 0) return;

        // 2. Format items as array of arrays matching headers
        const values = items.map(item => {
            return headers.map(header => {
                let val = item[header];
                if (val === undefined || val === null) return '';
                return String(val);
            });
        });

        // 3. Write items
        await service.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values }
        });
    } catch (err) {
        console.error(`Error saving table ${sheetName} to Google Sheets:`, err);
    }
}

async function appendRow(sheetName, item) {
    const activeMode = process.env.DB_MODE || 'local';

    if (activeMode === 'local') {
        const db = readLocalDB();
        if (!db[sheetName]) db[sheetName] = [];
        db[sheetName].push(item);
        writeLocalDB(db);
        return;
    }

    // Google Sheets mode
    const service = getSheetsService();
    if (!service) {
        const db = readLocalDB();
        if (!db[sheetName]) db[sheetName] = [];
        db[sheetName].push(item);
        writeLocalDB(db);
        return;
    }

    try {
        const headers = SHEET_HEADERS[sheetName];
        const values = [headers.map(header => {
            let val = item[header];
            if (val === undefined || val === null) return '';
            return String(val);
        })];

        await service.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetName}!A2`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values }
        });
    } catch (err) {
        console.error(`Error appending row to table ${sheetName} in Google Sheets:`, err);
        // Fallback to local
        const db = readLocalDB();
        if (!db[sheetName]) db[sheetName] = [];
        db[sheetName].push(item);
        writeLocalDB(db);
    }
}

// Generate unique auto-increment integer ID
async function generateId(sheetName) {
    const items = await fetchTable(sheetName);
    if (items.length === 0) return 1;
    const ids = items.map(i => Number(i.id)).filter(id => !isNaN(id));
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

// --- Unified DB Interface Methods ---

const db = {
    users: {
        async create({ username, password }) {
            return dbWriteQueue.add(async () => {
                const items = await fetchTable('users');
                if (items.some(u => u.username === username)) throw new Error('이미 사용 중인 아이디입니다.');

                const id = await generateId('users');
                const newUser = {
                    id,
                    username,
                    password,
                    role: 'user',
                    created_at: new Date().toISOString()
                };

                items.push(newUser);
                await saveTable('users', items);
                return newUser;
            });
        },

        async findByUsername(username) {
            const items = await fetchTable('users');
            return items.find(u => u.username === username) || null;
        },
        async findById(id) {
            const items = await fetchTable('users');
            return items.find(u => Number(u.id) === Number(id)) || null;
        },
        async listAll() {
            return await fetchTable('users');
        },
        async update(id, { username, password }) {
            return dbWriteQueue.add(async () => {
                const items = await fetchTable('users');
                const index = items.findIndex(u => Number(u.id) === Number(id));
                if (index === -1) throw new Error('사용자를 찾을 수 없습니다.');

                if (username && items.some(u => u.username === username && Number(u.id) !== Number(id))) throw new Error('이미 사용 중인 사용자명입니다.');

                if (username !== undefined) items[index].username = username;
                if (password !== undefined) items[index].password = password;

                await saveTable('users', items);
                return items[index];
            });
        }
    },
    memos: {
        async listByUserId(userId) {
            const items = await fetchTable('memos');
            return items.filter(m => Number(m.user_id) === Number(userId));
        },
        async listAll() {
            return await fetchTable('memos');
        },
        async create({ userId, content }) {
            return dbWriteQueue.add(async () => {
                const items = await fetchTable('memos');
                const id = await generateId('memos');
                const newMemo = {
                    id,
                    user_id: Number(userId),
                    content,
                    completed: 0,
                    created_at: new Date().toISOString()
                };
                items.push(newMemo);
                await saveTable('memos', items);
                return newMemo;
            });
        },
        async update(id, userId, { completed }) {
            return dbWriteQueue.add(async () => {
                const items = await fetchTable('memos');
                const index = items.findIndex(m => Number(m.id) === Number(id) && Number(m.user_id) === Number(userId));
                if (index === -1) throw new Error('Memo not found');
                
                items[index].completed = completed ? 1 : 0;
                await saveTable('memos', items);
                return items[index];
            });
        },
        async delete(id, userId) {
            return dbWriteQueue.add(async () => {
                let items = await fetchTable('memos');
                const initialLength = items.length;
                items = items.filter(m => !(Number(m.id) === Number(id) && Number(m.user_id) === Number(userId)));
                if (items.length === initialLength) throw new Error('Memo not found');
                await saveTable('memos', items);
                return true;
            });
        }
    },
    sessions: {
        async listByUserId(userId) {
            const items = await fetchTable('study_sessions');
            return items.filter(s => Number(s.user_id) === Number(userId));
        },
        async create({ userId, duration, treePlanted, startTime }) {
            return dbWriteQueue.add(async () => {
                const id = await generateId('study_sessions');
                const newSession = {
                    id,
                    user_id: Number(userId),
                    duration: Number(duration),
                    tree_planted: treePlanted || '',
                    start_time: new Date(startTime).toISOString(),
                    end_time: new Date().toISOString()
                };
                await appendRow('study_sessions', newSession);
                return newSession;
            });
        },
        async listAll() {
            return await fetchTable('study_sessions');
        },
        async migrateTreeToDuration() {
            return dbWriteQueue.add(async () => {
                const items = await fetchTable('study_sessions');
                let migratedCount = 0;
                items.forEach(s => {
                    const duration = Number(s.duration || 0);
                    const hrs = Math.floor(duration / 60);
                    const mins = duration % 60;
                    const timeStr = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
                    
                    if (!s.tree_planted || !s.tree_planted.includes(':')) {
                        s.tree_planted = timeStr;
                        migratedCount++;
                    }
                });
                if (migratedCount > 0) {
                    await saveTable('study_sessions', items);
                    console.log(`Migrated ${migratedCount} sessions to HH:MM:SS format.`);
                }
                return migratedCount;
            });
        }
    },
    logs: {
        async create({ userId, ipAddress }) {
            return dbWriteQueue.add(async () => {
                const id = await generateId('connection_logs');
                const newLog = {
                    id,
                    user_id: Number(userId),
                    login_time: new Date().toISOString(),
                    ip_address: ipAddress || ''
                };
                await appendRow('connection_logs', newLog);
                return newLog;
            });
        },
        async listAll() {
            return await fetchTable('connection_logs');
        }
    },
    notices: {
        async listAll() {
            return await fetchTable('notices');
        },
        async create({ content, type }) {
            return dbWriteQueue.add(async () => {
                const items = await fetchTable('notices');
                const id = await generateId('notices');
                const newNotice = {
                    id,
                    content,
                    type,
                    created_at: new Date().toISOString()
                };
                items.push(newNotice);
                await saveTable('notices', items);
                return newNotice;
            });
        }
    }
};

module.exports = db;
