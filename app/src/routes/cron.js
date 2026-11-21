// Zadania uruchamiane zewnętrznym harmonogramem (cron-job.org) raz dziennie.
// Chronione sekretem CRON_SECRET. Przypomnienia o terminach ZUS/PIT/VAT:
//  - tylko dla użytkowników, którzy realnie mają co zapłacić,
//  - pomijane, gdy oznaczono zobowiązanie jako opłacone,
//  - przed terminem ('pre') oraz po terminie ('overdue').
const express = require('express');
const pool = require('../db');
const mailer = require('../lib/mailer');

const router = express.Router();

const KINDS = {
  zus: { label: 'Składki ZUS', day: 20 },
  pit: { label: 'Zaliczka PIT', day: 20 },
  vat: { label: 'VAT (JPK_V7)', day: 25 }
};
const WINDOW_DAYS = 3;   // ile dni przed terminem przypominać
const OVERDUE_DAYS = 7;  // jak długo po terminie przypominać o zaległości

router.all('/reminders', async (req, res) => {
  const key = req.query.key || req.get('x-cron-key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: 'forbidden' });
  }
  try {
    // "Dziś" w strefie Europe/Warsaw (terminy polskie).
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const y = +parts.find((p) => p.type === 'year').value;
    const m = +parts.find((p) => p.type === 'month').value - 1;
    const dd = +parts.find((p) => p.type === 'day').value;
    const today = new Date(Date.UTC(y, m, dd));
    const win = req.query.test ? 40 : WINDOW_DAYS;

    // Zobowiązania bieżącego miesiąca dotyczą POPRZEDNIEGO miesiąca (rozliczenie).
    const prev = new Date(Date.UTC(y, m - 1, 1));
    const period = prev.toISOString().slice(0, 7);          // 'YYYY-MM'
    const pFrom = prev.toISOString().slice(0, 10);
    const pTo = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const dueOf = (day) => new Date(Date.UTC(y, m, day));

    const users = (await pool.query('SELECT id, email, zus_scheme FROM users')).rows;
    let sent = 0;
    for (const u of users) {
      if (!u.email) continue;
      const ob = (await pool.query('SELECT f_user_obligations($1,$2,$3) AS ob', [u.id, pFrom, pTo])).rows[0].ob;
      const consider = [
        { k: 'zus', due: dueOf(20), applies: u.zus_scheme !== 'none' && ob.has_activity },
        { k: 'pit', due: dueOf(20), applies: Number(ob.pit) > 0 },
        { k: 'vat', due: dueOf(25), applies: Number(ob.vat_due) > 0 }
      ];
      const items = [];
      for (const c of consider) {
        if (!c.applies) continue;
        const paid = await pool.query('SELECT 1 FROM obligation_paid WHERE user_id=$1 AND kind=$2 AND period=$3', [u.id, c.k, period]);
        if (paid.rowCount) continue; // opłacone — nie przypominamy
        const daysLeft = Math.round((c.due - today) / 86400000);
        let phase = null;
        if (daysLeft >= 0 && daysLeft <= win) phase = 'pre';
        else if (daysLeft < 0 && daysLeft >= -OVERDUE_DAYS) phase = 'overdue';
        if (!phase) continue;
        const dueStr = c.due.toISOString().slice(0, 10);
        const ins = await pool.query(
          `INSERT INTO reminder_log (user_id, kind, due_date, phase) VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, kind, due_date, phase) DO NOTHING RETURNING id`,
          [u.id, c.k, dueStr, phase]);
        if (ins.rowCount) items.push({ label: KINDS[c.k].label, due: dueStr, overdue: phase === 'overdue' });
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
