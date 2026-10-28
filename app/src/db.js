// Pula polaczen z baza PostgreSQL.
// Cala aplikacja korzysta z jednej, wspoldzielonej puli.
const { Pool } = require('pg');

// Neon/produkcja wymaga SSL (connection string z sslmode=require) — lokalnie wyłączone.
const useSsl = /sslmode=require/.test(process.env.DATABASE_URL || '') || process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
