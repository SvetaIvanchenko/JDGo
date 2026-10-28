// Trasy ewidencji operacji (przychody i koszty) — WF-8..WF-13, WF-16, WF-20.
// Cienka warstwa: walidacja, wyliczenia i zapis realizują funkcje bazy danych
// (f_operations_list, f_operation_save, f_operation_delete). Izolacja przez RLS.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendDbError } = require('../lib/http');

const router = express.Router();
const FILTER_KEYS = ['type', 'dq', 'contractor', 'opis', 'kategoria', 'stawka', 'waluta', 'netMin', 'vatMin', 'grossMin', 'sort', 'dir'];

// Lista z filtrowaniem per kolumna i sortowaniem (WF-16).
router.get('/', requireAuth, async (req, res) => {
  const f = {};
  FILTER_KEYS.forEach((k) => { if (req.query[k] !== undefined && req.query[k] !== '') f[k] = String(req.query[k]); });
  try {
    const r = await req.db.query('SELECT f_operations_list($1::jsonb) AS data', [JSON.stringify(f)]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

const saveArgs = (b, id) => [
  id, b.type, b.operation_date, b.contractor_id || null, b.category || null,
  b.description || null, b.currency || 'PLN', b.vat_rate_id, b.amount_net
];
const SAVE_SQL = 'SELECT f_operation_save($1, $2, $3::date, $4, $5, $6, $7, $8::smallint, $9) AS id';

// Dodanie operacji (WF-8/WF-9, WF-11, WF-12).
router.post('/', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query(SAVE_SQL, saveArgs(req.body, null));
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { sendDbError(res, e); }
});

// Edycja operacji.
router.put('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    await req.db.query(SAVE_SQL, saveArgs(req.body, req.params.id));
    res.json({ ok: true });
  } catch (e) { sendDbError(res, e); }
});

// Usunięcie operacji.
router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    await req.db.query('SELECT f_operation_delete($1)', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { sendDbError(res, e); }
});

module.exports = router;
