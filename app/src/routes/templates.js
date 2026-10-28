// Szablony operacji (powtarzalne przychody/koszty). Cienka warstwa — logika w funkcjach
// bazy (f_templates_list, f_template_save, f_template_delete, f_template_use). Izolacja: RLS.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendDbError } = require('../lib/http');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query('SELECT f_templates_list() AS data');
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

const saveArgs = (b, id) => [id, b.name, b.type, b.contractor_id || null, b.category || null, b.description || null, b.currency || 'PLN', b.vat_rate_id, b.amount_net];
const SAVE_SQL = 'SELECT f_template_save($1, $2, $3, $4, $5, $6, $7, $8::smallint, $9) AS id';

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
    await req.db.query('SELECT f_template_delete($1)', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { sendDbError(res, e); }
});

// Utworzenie operacji z szablonu.
router.post('/:id/use', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    const r = await req.db.query('SELECT f_template_use($1, $2::date) AS id', [req.params.id, req.body.operation_date || null]);
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { sendDbError(res, e); }
});

module.exports = router;
