const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

// This logs database errors instead of crashing the server
pool.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
});

module.exports = pool;