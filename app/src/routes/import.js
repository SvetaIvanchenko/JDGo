// Import danych — WF-14 (pakietowy import operacji z CSV).
// Klient parsuje CSV i przesyła wiersze; walidację, matching kontrahentów,
// wstawianie i zapis wsadu realizuje funkcja bazy f_import_operations(jsonb).
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendDbError } = require('../lib/http');

const router = express.Router();

router.post('/operations', requireAuth, async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'Brak danych do importu' });
  try {
    const r = await req.db.query('SELECT f_import_operations($1::jsonb, $2) AS data',
      [JSON.stringify(rows), String(req.body.file_name || '').slice(0, 255) || null]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

module.exports = router;
