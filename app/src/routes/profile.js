// Trasy profilu uzytkownika (WF-6, WF-7, WF-21).
const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// WF-7: pobranie danych profilu zalogowanego uzytkownika
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.service_category,
              u.default_vat_rate_id, vr.code AS vat_code,
              u.tax_form, u.default_currency, u.totp_enabled,
              to_char(u.updated_at, 'YYYY-MM-DD HH24:MI') AS updated_at
       FROM users u
       JOIN vat_rates vr ON vr.id = u.default_vat_rate_id
       WHERE u.id = $1`,
      [req.session.userId]
    );
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-6, WF-7, WF-21: aktualizacja profilu
router.put('/', requireAuth, async (req, res) => {
  const { display_name, service_category, default_vat_rate_id, tax_form, default_currency } = req.body;
  try {
    await pool.query(
      `UPDATE users
         SET display_name = $1,
             service_category = $2,
             default_vat_rate_id = $3,
             tax_form = $4,
             default_currency = $5
       WHERE id = $6`,
      [display_name, service_category, default_vat_rate_id, tax_form, default_currency, req.session.userId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

module.exports = router;
