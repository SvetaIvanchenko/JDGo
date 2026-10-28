// Trasy uwierzytelniania.
// Flow: rejestracja -> obowiazkowa przywiazanie 2FA (QR) -> logowanie -> weryfikacja OTP.
const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const { encryptSecret, decryptSecret } = require('../lib/crypto');
const rateLimit = require('../middleware/rateLimit');
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.' });

// WN-1: polityka hasel — min. 10 znakow, wielka litera, cyfra, znak specjalny.
function passwordPolicyError(pw) {
  if (!pw || pw.length < 10) return 'Hasło musi mieć min. 10 znaków';
  if (!/[A-Z]/.test(pw))     return 'Hasło musi zawierać wielką literę';
  if (!/[0-9]/.test(pw))     return 'Hasło musi zawierać cyfrę';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Hasło musi zawierać znak specjalny';
  return null;
}

// WF-1: rejestracja. Tworzy konto i od razu generuje sekret TOTP (2FA obowiazkowe).
// Ustawia krotka sesje "setupUserId" pozwalajaca dokonczyc przywiazanie aplikacji.
router.post('/register', authLimiter, async (req, res) => {
  const { email, password, terms_accepted } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Podaj e-mail i haslo' });
  }
  const pwErr = passwordPolicyError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (!terms_accepted) {
    return res.status(400).json({ error: 'Wymagana akceptacja regulaminu i RODO' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);          // WN-1
    const secret = authenticator.generateSecret();         // sekret 2FA (WF-3)
    const r = await pool.query(
      `INSERT INTO users (email, password_hash, totp_secret, totp_enabled,
                          terms_accepted, terms_accepted_at)
       VALUES ($1, $2, $3, FALSE, TRUE, now())
       RETURNING id`,
      [email, hash, encryptSecret(secret)]                 // WN-1: sekret 2FA szyfrowany AES-256-GCM
    );
    req.session.setupUserId = r.rows[0].id;                // sesja tylko do dokonczenia 2FA
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Konto z tym e-mailem juz istnieje' });
    }
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-3: zwraca kod QR dla konta w trakcie konfiguracji 2FA (sesja setupUserId).
router.get('/2fa/qr', async (req, res) => {
  const id = req.session.setupUserId;
  if (!id) return res.status(401).json({ error: 'Brak rozpoczetej rejestracji' });
  try {
    const r = await pool.query('SELECT email, totp_secret FROM users WHERE id = $1', [id]);
    const secret = decryptSecret(r.rows[0].totp_secret);
    const uri = authenticator.keyuri(r.rows[0].email, 'JDG Ewidencja', secret);
    const qr = await qrcode.toDataURL(uri);
    res.json({ qr });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-3: potwierdzenie przywiazania aplikacji pierwszym kodem -> wlaczenie 2FA.
router.post('/2fa/confirm', authLimiter, async (req, res) => {
  const id = req.session.setupUserId;
  if (!id) return res.status(401).json({ error: 'Brak rozpoczetej rejestracji' });
  const { token } = req.body;
  try {
    const r = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [id]);
    const secret = decryptSecret(r.rows[0].totp_secret);
    if (!authenticator.verify({ token, secret })) {
      return res.status(401).json({ error: 'Nieprawidlowy kod' });
    }
    await pool.query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [id]);
    delete req.session.setupUserId;
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-2: logowanie — krok 1: weryfikacja hasla.
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query(
      'SELECT id, password_hash, totp_enabled FROM users WHERE email = $1',
      [email]
    );
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Nieprawidlowy e-mail lub haslo' });
    }
    if (!user.totp_enabled) {
      // konto bez dokonczonej konfiguracji 2FA -> wroc do przywiazania aplikacji
      req.session.setupUserId = user.id;
      return res.json({ step: 'setup' });
    }
    req.session.pendingUserId = user.id;                   // czeka na kod 2FA (WF-3)
    res.json({ step: 'otp' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-3: logowanie — krok 2: weryfikacja kodu TOTP.
router.post('/login/otp', authLimiter, async (req, res) => {
  const { token } = req.body;
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.status(400).json({ error: 'Brak rozpoczetego logowania' });
  try {
    const r = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [pendingId]);
    const secret = decryptSecret(r.rows[0].totp_secret);
    if (!authenticator.verify({ token, secret })) {
      return res.status(401).json({ error: 'Nieprawidlowy kod' });
    }
    req.session.userId = pendingId;
    delete req.session.pendingUserId;
    res.json({ step: 'done' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-2: wylogowanie.
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// WF-5: trwale usuniecie konta (ON DELETE CASCADE usuwa wszystkie dane).
router.delete('/account', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.session.userId]);
    req.session.destroy(() => res.json({ ok: true }));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WN-1: zmiana hasla — weryfikacja starego, zapis nowego jako skrot.
router.post('/password', requireAuth, async (req, res) => {
  const { old_password, new_password } = req.body;
  const pwErr = passwordPolicyError(new_password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  try {
    const r = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
    if (!(await bcrypt.compare(old_password || '', r.rows[0].password_hash))) {
      return res.status(401).json({ error: 'Nieprawidlowe stare haslo' });
    }
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-17 / RODO art. 20: eksport wszystkich danych użytkownika (JSON, bez sekretów).
router.get('/account/export', requireAuth, async (req, res) => {
  const uid = req.session.userId;
  try {
    const profile = await pool.query(
      `SELECT id, email, display_name, service_category, default_vat_rate_id, default_currency,
              tax_form, terms_accepted, terms_accepted_at, created_at
       FROM users WHERE id = $1`, [uid]);
    const contractors = await pool.query('SELECT * FROM contractors WHERE user_id = $1 ORDER BY id', [uid]);
    const operations = await pool.query(
      `SELECT id, type, to_char(operation_date,'YYYY-MM-DD') AS operation_date, category, description,
              currency, vat_rate_id, amount_net, amount_vat, amount_gross, contractor_id, source
       FROM operations WHERE user_id = $1 ORDER BY id`, [uid]);
    const inv = await pool.query('SELECT * FROM invoices WHERE user_id = $1 ORDER BY id', [uid]);
    const items = await pool.query(
      `SELECT it.* FROM invoice_items it JOIN invoices i ON i.id = it.invoice_id
       WHERE i.user_id = $1 ORDER BY it.id`, [uid]);
    const byInv = {};
    items.rows.forEach((it) => { (byInv[it.invoice_id] = byInv[it.invoice_id] || []).push(it); });
    const invoices = inv.rows.map((i) => ({ ...i, items: byInv[i.id] || [] }));
    res.setHeader('Content-Disposition', 'attachment; filename="jdgo-eksport.json"');
    res.json({
      exported_at: new Date().toISOString(),
      profile: profile.rows[0], contractors: contractors.rows, operations: operations.rows, invoices
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

module.exports = router;
