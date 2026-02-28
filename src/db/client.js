const { Pool } = require('pg');
const { config } = require('../config');

// DATABASE_URL に sslmode=require が含まれている場合のみ SSL を有効化
const sslRequired = config.database.url?.includes('sslmode=require');

const pool = new Pool({
    connectionString: config.database.url,
    ssl: sslRequired ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
    console.error('PostgreSQL クライアントで予期しないエラーが発生しました:', err);
});

module.exports = { pool };
