// Kursy walut NBP — kurs pojedynczej waluty oraz tabela bieżących kursów.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendDbError } = require('../lib/http');
const fx = require('../lib/fx');

const router = express.Router();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Kurs waluty do PLN (?currency=EUR&date=YYYY-MM-DD; data opcjonalna).
router.get('/', requireAuth, async (req, res) => {
  const currency = (req.query.currency || 'PLN').toUpperCase();
  const date = req.query.date && isDate(req.query.date) ? req.query.date : null;
  try {
    const r = await fx.getRate(req.db, currency, date);
    res.json(r);
  } catch (e) {
    if (/Brak kursu|Nieprawidłowy|NBP HTTP/.test(e.message)) return res.status(400).json({ error: e.message });
    sendDbError(res, e);
  }
});

// Bieżące kursy głównych walut (EUR/USD/GBP/CHF).
router.get('/table', requireAuth, async (req, res) => {
  try {
    res.json(await fx.getTable(req.db));
  } catch (e) { sendDbError(res, e); }
});

module.exports = router;
