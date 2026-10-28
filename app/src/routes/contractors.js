// Trasy kontrahentów (WF-18). Cienka warstwa — logika w funkcjach bazy
// (f_contractors_list, f_contractor_save, f_contractor_delete). Izolacja: RLS.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendDbError } = require('../lib/http');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query('SELECT f_contractors_list() AS data');
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

const saveArgs = (b, id) => [id, b.name, b.nip || null, b.street || null, b.postal_code || null, b.city || null, b.country || null];
const SAVE_SQL = 'SELECT f_contractor_save($1, $2, $3, $4, $5, $6, $7) AS id';

router.post('/', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query(SAVE_SQL, saveArgs(req.body, null));
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { sendDbError(res, e); }
});

router.put('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    await req.db.query(SAVE_SQL, saveArgs(req.body, req.params.id));
    res.json({ ok: true });
  } catch (e) { sendDbError(res, e); }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    await req.db.query('SELECT f_contractor_delete($1)', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { sendDbError(res, e); }
});

module.exports = router;
