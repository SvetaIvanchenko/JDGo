// Zadania uruchamiane zewnętrznym harmonogramem (cron-job.org) raz dziennie.
// Chronione sekretem CRON_SECRET. Wysyła przypomnienia o terminach ZUS/PIT/VAT.
const express = require('express');
const pool = require('../db');
const mailer = require('../lib/mailer');

const router = express.Router();

// Terminy miesięczne: dzień płatności w bieżącym miesiącu.
const KINDS = {
  zus: { label: 'Składki ZUS', day: 20 },
  pit: { label: 'Zaliczka PIT', day: 20 },
  vat: { label: 'VAT (JPK_V7)', day: 25 }
};
const WINDOW_DAYS = 3; // ile dni przed terminem wysłać przypomnienie

router.all('/reminders', async (req, res) => {
  const key = req.query.key || req.get('x-cron-key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    // "Dziś" liczone w strefie Europe/Warsaw (terminy są polskie), nie w UTC.
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const y = +parts.find((p) => p.type === 'year').value;
    const m = +parts.find((p) => p.type === 'month').value - 1;
    const dd = +parts.find((p) => p.type === 'day').value;
    const today = new Date(Date.UTC(y, m, dd));

    // test=1 rozszerza okno (do ręcznego sprawdzenia wysyłki poza harmonogramem).
    const win = req.query.test ? 40 : WINDOW_DAYS;

    // Terminy w oknie [dziś, dziś + win].
    const due = {};
    for (const k in KINDS) {
      const d = new Date(Date.UTC(y, m, KINDS[k].day));
      const daysLeft = Math.round((d - today) / 86400000);
      if (daysLeft >= 0 && daysLeft <= win) due[k] = d.toISOString().slice(0, 10);
    }
    if (!Object.keys(due).length) return res.json({ ok: true, sent: 0, note: 'brak terminów w oknie' });

    const users = (await pool.query('SELECT id, email, zus_scheme FROM users')).rows;
    let sent = 0;
    for (const u of users) {
      if (!u.email) continue;
      const items = [];
      for (const k in due) {
        if (k === 'zus' && u.zus_scheme === 'none') continue;
        // Dedupe: jedno przypomnienie na (użytkownik, typ, termin).
        const r = await pool.query(
          `INSERT INTO reminder_log (user_id, kind, due_date) VALUES ($1,$2,$3)
           ON CONFLICT (user_id, kind, due_date) DO NOTHING RETURNING id`,
          [u.id, k, due[k]]);
        if (r.rowCount) items.push({ label: KINDS[k].label, due: due[k] });
      }
      if (items.length) {
        try { await mailer.sendReminder(u.email, items, mailer.APP_URL); sent++; }
        catch (e) { console.error('Reminder mail', u.email, e.message); }
      }
    }
    res.json({ ok: true, sent });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

module.exports = router;
