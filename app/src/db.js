// Pula polaczen z baza PostgreSQL.
// Cala aplikacja korzysta z jednej, wspoldzielonej puli.
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

module.exports = pool;
