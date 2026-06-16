const { execute } = require('./db');

const tables = [
    {
        name: 'USERS',
        sql: `CREATE TABLE USERS (
            ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            USERNAME VARCHAR2(50) UNIQUE NOT NULL,
            EMAIL VARCHAR2(100) UNIQUE NOT NULL,
            PASSWORD VARCHAR2(255) NOT NULL,
            ROLE VARCHAR2(20) DEFAULT 'user',
            CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    },
    {
        name: 'MEMOS',
        sql: `CREATE TABLE MEMOS (
            ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            USER_ID NUMBER NOT NULL,
            CONTENT CLOB NOT NULL,
            COMPLETED NUMBER(1) DEFAULT 0,
            CREATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_memo_user FOREIGN KEY (USER_ID) REFERENCES USERS(ID) ON DELETE CASCADE
        )`
    },
    {
        name: 'STUDY_SESSIONS',
        sql: `CREATE TABLE STUDY_SESSIONS (
            ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            USER_ID NUMBER NOT NULL,
            DURATION NUMBER NOT NULL,
            TREE_PLANTED VARCHAR2(50),
            START_TIME TIMESTAMP NOT NULL,
            END_TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_session_user FOREIGN KEY (USER_ID) REFERENCES USERS(ID) ON DELETE CASCADE
        )`
    },
    {
        name: 'CONNECTION_LOGS',
        sql: `CREATE TABLE CONNECTION_LOGS (
            ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            USER_ID NUMBER NOT NULL,
            LOGIN_TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            IP_ADDRESS VARCHAR2(50),
            CONSTRAINT fk_log_user FOREIGN KEY (USER_ID) REFERENCES USERS(ID) ON DELETE CASCADE
        )`
    }
];

async function init() {
    console.log('Starting Oracle Database Initialization...');
    
    for (const table of tables) {
        try {
            // Check if table exists
            const checkSql = `SELECT table_name FROM user_tables WHERE table_name = '${table.name}'`;
            const result = await execute(checkSql);
            
            if (result.rows.length > 0) {
                console.log(`Table ${table.name} already exists. Skipping.`);
            } else {
                console.log(`Creating table ${table.name}...`);
                await execute(table.sql);
                console.log(`Table ${table.name} created successfully.`);
            }
        } catch (err) {
            console.error(`Error processing table ${table.name}:`, err);
        }
    }
    
    console.log('Database Initialization Finished.');
}

if (require.main === module) {
    init();
}

module.exports = { init };
