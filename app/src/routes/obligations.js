// Status opłacenia zobowiązań (ZUS/PIT/VAT) per miesiąc. Tabela bez RLS —
// filtrujemy po zalogowanym użytkowniku.
const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Które zobowiązania są oznaczone jako opłacone w danym miesiącu.
router.get('/', requireAuth, async (req, res) => {
  const period = String(req.query.period || '');
  if (!/^\d{4}-\d{2}$/.test(period)) return res.status(400).json({ error: 'Nieprawidłowy okres' });
  try {
    const r = await pool.query('SELECT kind FROM obligation_paid WHERE user_id = $1 AND period = $2',
      [req.session.userId, period]);
    res.json({ paid: r.rows.map((x) => x.kind) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
});

// Oznacz/odznacz zobowiązanie jako opłacone.
router.post('/toggle', requireAuth, async (req, res) => {
  const { kind, period, paid } = req.body;
  if (!['zus', 'pit', 'vat'].includes(kind) || !/^\d{4}-\d{2}$/.test(String(period || ''))) {
    return res.status(400).json({ error: 'Nieprawidłowe dane' });
  }
  try {
    if (paid) {
      await pool.query(
        `INSERT INTO obligation_paid (user_id, kind, period) VALUES ($1,$2,$3)
         ON CONFLICT (user_id, kind, period) DO NOTHING`,
        [req.session.userId, kind, period]);
    } else {
      await pool.query('DELETE FROM obligation_paid WHERE user_id = $1 AND kind = $2 AND period = $3',
        [req.session.userId, kind, period]);
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
});

module.exports = router;
