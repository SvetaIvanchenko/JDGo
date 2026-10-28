// Zestawienia, pulpit, analityka — WF-15, WF-22, WF-R2, WF-R3.
// Cienka warstwa: całość liczą funkcje bazy zwracające gotowy JSON
// (f_report_summary, f_report_monthly, f_dashboard, f_period_operations, f_analytics).
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { sendDbError } = require('../lib/http');

const router = express.Router();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// Domyślny zakres: bieżący miesiąc.
function currentMonth() {
  const d = new Date();
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const f = (x) => x.toISOString().slice(0, 10);
  return [f(from), f(to)];
}

// Zestawienie za okres (sumy, VAT, PIT).
router.get('/summary', requireAuth, async (req, res) => {
  const [df, dt] = currentMonth();
  const from = req.query.from || df;
  const to = req.query.to || dt;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'Nieprawidłowa data' });
  if (from > to) return res.status(400).json({ error: 'Data początkowa jest późniejsza niż końcowa' });
  try {
    const r = await req.db.query('SELECT f_report_summary($1::date, $2::date) AS data', [from, to]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Dane do wykresów: sumy miesięczne + podział wg kategorii (WF-R2).
router.get('/monthly', requireAuth, async (req, res) => {
  const year = /^\d{4}$/.test(req.query.year) ? Number(req.query.year) : new Date().getUTCFullYear();
  try {
    const r = await req.db.query('SELECT f_report_monthly($1) AS data', [year]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Dane analityczne (funkcje okna): saldo narastające + ranking kontrahentów.
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query('SELECT f_analytics() AS data');
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Pulpit: faktury do zapłaty / przeterminowane + ostatnie operacje.
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query('SELECT f_dashboard() AS data');
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Wiekowanie należności (aging) — nieopłacone faktury sprzedaży wg przedziałów.
router.get('/aging', requireAuth, async (req, res) => {
  try {
    const r = await req.db.query('SELECT f_aging() AS data');
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Historia zmian (dziennik audytu: operacje / faktury / kontrahenci).
router.get('/history', requireAuth, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  try {
    const r = await req.db.query('SELECT f_history($1) AS data', [limit]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// KPiR — uproszczona Księga Przychodów i Rozchodów za okres.
router.get('/kpir', requireAuth, async (req, res) => {
  const [df, dt] = currentMonth();
  const from = req.query.from || df, to = req.query.to || dt;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'Nieprawidłowa data' });
  if (from > to) return res.status(400).json({ error: 'Data początkowa jest późniejsza niż końcowa' });
  try {
    const r = await req.db.query('SELECT f_kpir($1::date, $2::date) AS data', [from, to]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Rejestr VAT sprzedaży i zakupów za okres.
router.get('/vat-register', requireAuth, async (req, res) => {
  const [df, dt] = currentMonth();
  const from = req.query.from || df, to = req.query.to || dt;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'Nieprawidłowa data' });
  if (from > to) return res.status(400).json({ error: 'Data początkowa jest późniejsza niż końcowa' });
  try {
    const r = await req.db.query('SELECT f_vat_register($1::date, $2::date) AS data', [from, to]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

// Płaska lista operacji za okres — do eksportu CSV (WF-R3).
router.get('/period-operations', requireAuth, async (req, res) => {
  const [df, dt] = currentMonth();
  const from = req.query.from || df;
  const to = req.query.to || dt;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'Nieprawidłowa data' });
  if (from > to) return res.status(400).json({ error: 'Data początkowa jest późniejsza niż końcowa' });
  try {
    const r = await req.db.query('SELECT f_period_operations($1::date, $2::date) AS data', [from, to]);
    res.json(r.rows[0].data);
  } catch (e) { sendDbError(res, e); }
});

module.exports = router;
