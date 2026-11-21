// Trasy uwierzytelniania.
// Flow: rejestracja -> obowiazkowa przywiazanie 2FA (QR) -> logowanie -> weryfikacja OTP.
const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const crypto = require('crypto');
const { encryptSecret, decryptSecret } = require('../lib/crypto');
const mailer = require('../lib/mailer');
const rateLimit = require('../middleware/rateLimit');
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.' });

// Tolerancja ±1 kroku (30 s) na rozjazd zegara między telefonem a serwerem.
authenticator.options = { window: 1 };

// Tokeny jednorazowe: losowy ciąg w linku, w bazie tylko jego hasz SHA-256.
function newToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: crypto.createHash('sha256').update(raw).digest() };
}
const hashToken = (raw) => crypto.createHash('sha256').update(String(raw || '')).digest();

// WN-1: polityka hasel — min. 10 znakow, wielka litera, cyfra, znak specjalny.
function passwordPolicyError(pw) {
  if (!pw || pw.length < 10) return 'Hasło musi mieć min. 10 znaków';
  if (!/[A-Z]/.test(pw))     return 'Hasło musi zawierać wielką literę';
  if (!/[0-9]/.test(pw))     return 'Hasło musi zawierać cyfrę';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Hasło musi zawierać znak specjalny';
  return null;
}

// WF-1: rejestracja (e-mail + hasło). 2FA aplikacją (TOTP) jest OPCJONALNE —
// użytkownik może je włączyć później w ustawieniach. Drugim składnikiem przy
// logowaniu jest domyślnie jednorazowy kod wysyłany na e-mail.
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
    await pool.query(
      `INSERT INTO users (email, password_hash, totp_secret, totp_enabled,
                          terms_accepted, terms_accepted_at)
       VALUES ($1, $2, NULL, FALSE, TRUE, now())`,
      [email, hash]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Konto z tym e-mailem juz istnieje' });
    }
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-3 (opcjonalne): rozpoczęcie włączania 2FA aplikacją — generuje sekret i QR.
// Dostępne po zalogowaniu (ustawienia konta). 2FA aktywuje się dopiero po /activate.
router.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const secret = authenticator.generateSecret();
    await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2',
      [encryptSecret(secret), req.session.userId]);        // WN-1: szyfrowany AES-256-GCM
    const r = await pool.query('SELECT email FROM users WHERE id = $1', [req.session.userId]);
    const uri = authenticator.keyuri(r.rows[0].email, 'JDGo', secret);
    const qr = await qrcode.toDataURL(uri);
    res.json({ qr });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
});

// WF-3 (opcjonalne): potwierdzenie pierwszym kodem -> włączenie 2FA.
router.post('/2fa/activate', requireAuth, authLimiter, async (req, res) => {
  const { token } = req.body;
  try {
    const r = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [req.session.userId]);
    if (!r.rows[0].totp_secret) return res.status(400).json({ error: 'Najpierw rozpocznij konfigurację 2FA' });
    const secret = decryptSecret(r.rows[0].totp_secret);
    if (!authenticator.verify({ token, secret })) {
      return res.status(401).json({ error: 'Nieprawidłowy kod' });
    }
    await pool.query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.session.userId]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
});

// WF-3 (opcjonalne): wyłączenie 2FA aplikacją (wymaga hasła).
router.post('/2fa/disable', requireAuth, authLimiter, async (req, res) => {
  const { password } = req.body;
  try {
    const r = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
    if (!(await bcrypt.compare(password || '', r.rows[0].password_hash))) {
      return res.status(401).json({ error: 'Nieprawidłowe hasło' });
    }
    await pool.query('UPDATE users SET totp_enabled = FALSE, totp_secret = NULL WHERE id = $1', [req.session.userId]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
});

// WF-2: logowanie — krok 1: weryfikacja hasła.
// Zwraca totp=true, jeśli konto ma włączony authenticator; inaczej drugim
// składnikiem jest kod e-mail (strona weryfikacji sama go wyśle).
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
    req.session.pendingUserId = user.id;                   // czeka na drugi składnik
    res.json({ step: 'otp', totp: user.totp_enabled });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Blad serwera' });
  }
});

// WF-3: logowanie — krok 2: weryfikacja kodu TOTP (dla kont z włączonym 2FA).
router.post('/login/otp', authLimiter, async (req, res) => {
  const { token } = req.body;
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.status(400).json({ error: 'Brak rozpoczetego logowania' });
  try {
    const r = await pool.query('SELECT totp_secret FROM users WHERE id = $1', [pendingId]);
    if (!r.rows[0].totp_secret) return res.status(400).json({ error: 'Brak skonfigurowanego 2FA' });
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

// WF-3 (alternatywa): wyślij jednorazowy 6-cyfrowy kod na e-mail zamiast kodu TOTP.
router.post('/login/email-code', authLimiter, async (req, res) => {
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.status(400).json({ error: 'Brak rozpoczetego logowania' });
  try {
    const r = await pool.query('SELECT email FROM users WHERE id = $1', [pendingId]);
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await pool.query('SELECT f_token_issue($1,$2,$3,$4)', [pendingId, 'login', hashToken(code), 15]);
    await mailer.sendLoginCode(r.rows[0].email, code);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
});

// WF-3 (alternatywa): logowanie kodem z e-maila (jednorazowy, ważny 15 min).
router.post('/login/email-verify', authLimiter, async (req, res) => {
  const pendingId = req.session.pendingUserId;
  if (!pendingId) return res.status(400).json({ error: 'Brak rozpoczetego logowania' });
  const code = String(req.body.code || '').trim();
  try {
    const r = await pool.query('SELECT f_token_consume($1,$2) AS uid', ['login', hashToken(code)]);
    const uid = r.rows[0].uid;
    if (!uid || uid !== pendingId) return res.status(401).json({ error: 'Nieprawidłowy lub nieważny kod' });
    req.session.userId = uid;
    delete req.session.pendingUserId;
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
});

// Odzyskiwanie dostępu: wyślij link jednorazowego logowania (nie zdradza, czy konto istnieje).
// Po zalogowaniu użytkownik zmienia hasło samodzielnie w ustawieniach konta.
router.post('/password/forgot', authLimiter, async (req, res) => {
  const { email } = req.body;
  try {
    const r = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (r.rows[0]) {
      const { raw, hash } = newToken();
      await pool.query('SELECT f_token_issue($1,$2,$3,$4)', [r.rows[0].id, 'recovery', hash, 15]);
      await mailer.sendRecovery(email, raw);
    }
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
});

// Odzyskiwanie dostępu: jednorazowe logowanie po kliknięciu linku (pomija 2FA).
router.post('/recovery/verify', authLimiter, async (req, res) => {
  const { token } = req.body;
  try {
    const r = await pool.query('SELECT f_token_consume($1,$2) AS uid', ['recovery', hashToken(token)]);
    const uid = r.rows[0].uid;
    if (!uid) return res.status(400).json({ error: 'Link nieprawidłowy lub wygasł' });
    req.session.userId = uid;
    req.session.pwReset = true;            // pozwól ustawić nowe hasło bez starego
    delete req.session.pendingUserId;
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Blad serwera' }); }
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
    // Po zalogowaniu linkiem odzyskiwania (pwReset) nie wymagamy starego hasła.
    if (!req.session.pwReset) {
      const r = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.session.userId]);
      if (!(await bcrypt.compare(old_password || '', r.rows[0].password_hash))) {
        return res.status(401).json({ error: 'Nieprawidlowe stare haslo' });
      }
    }
    const hash = await bcrypt.hash(new_password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);
    delete req.session.pwReset;            // jednorazowo
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
