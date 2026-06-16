const oracledb = require('oracledb');
require('dotenv').config();

// Use oracledb in Thin mode (default in v6+)
oracledb.initOracleClient = null; 

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECT_STRING
};

async function getConnection() {
    try {
        const connection = await oracledb.getConnection(dbConfig);
        return connection;
    } catch (err) {
        console.error('Oracle connection error:', err);
        throw err;
    }
}

async function execute(sql, params = [], options = {}) {
    let connection;
    try {
        connection = await getConnection();
        // Use autoCommit for simple operations if not specified
        if (options.autoCommit === undefined) {
            options.autoCommit = true;
        }
        // Use outFormat OBJECT to get results as JSON-like objects
        if (options.outFormat === undefined) {
            options.outFormat = oracledb.OUT_FORMAT_OBJECT;
        }
        
        const result = await connection.execute(sql, params, options);
        return result;
    } catch (err) {
        console.error('SQL Execution Error:', err);
        throw err;
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Connection Close Error:', err);
            }
        }
    }
}

module.exports = { execute };
