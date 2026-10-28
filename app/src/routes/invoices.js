// Trasy faktur — WF-10 (przegląd, podgląd), WF-19 (status i termin płatności).
// Cienka warstwa — logika w funkcjach bazy (f_invoices_list, f_invoice_get,
// f_invoice_save, f_invoice_set_payment, f_invoice_delete). Izolacja: RLS.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendDbError } = require('../lib/http');

const router = express.Router();

// Lista faktur (filtry: ?status=, ?direction=).
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query('SELECT f_invoices_list($1, $2) AS data', [req.query.status || null, req.query.direction || null]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Szczegóły faktury z pozycjami (edycja / podgląd).
router.get('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    const r = await req.db.query('SELECT f_invoice_get($1) AS data', [req.params.id]);
    if (!r.rows[0].data) return res.status(404).json({ error: 'Nie znaleziono faktury' });
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Dodanie faktury (nagłówek + pozycje w jednej funkcji — atomowo) — WN-5.
router.post('/', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query('SELECT f_invoice_save(NULL, $1::jsonb) AS id', [JSON.stringify(req.body || {})]);
    res.status(201).json({ id: r.rows[0].id });
  } catch (e) { sendDbError(res, e); }
});

// Edycja faktury (aktualizacja nagłówka + wymiana pozycji — atomowo).
router.put('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    await req.db.query('SELECT f_invoice_save($1, $2::jsonb)', [req.params.id, JSON.stringify(req.body || {})]);
    res.json({ ok: true });
  } catch (e) { sendDbError(res, e); }
});

// Szybka zmiana statusu/terminu płatności (WF-19).
router.patch('/:id/payment', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    await req.db.query('SELECT f_invoice_set_payment($1, $2, $3::date)', [req.params.id, req.body.payment_state, req.body.payment_due_date || null]);
    res.json({ ok: true });
  } catch (e) { sendDbError(res, e); }
});

// Usunięcie faktury (pozycje kasowane kaskadowo).
router.delete('/:id', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator' });
  try {
    await req.db.query('SELECT f_invoice_delete($1)', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { sendDbError(res, e); }
});

module.exports = router;
