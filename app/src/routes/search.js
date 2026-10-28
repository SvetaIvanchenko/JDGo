// Globalne wyszukiwanie (WF-16) — operacje / kontrahenci / faktury.
// Cienka warstwa: logika w funkcji bazy f_global_search (zwraca gotowy JSON).
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendDbError } = require('../lib/http');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json({ operations: [], contractors: [], invoices: [] });
  try {
    const r = await req.db.query('SELECT f_global_search($1) AS data', [q]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

module.exports = router;
