// Jednorazowa migracja: zaszyfrowanie istniejących (jawnych) sekretów 2FA (WN-1).
// Uruchomienie:  node migrate_totp.js
// Wymaga .env z DATABASE_URL oraz TYM SAMYM TOTP_KEY, którego używa aplikacja.
// Skrypt jest idempotentny — bezpiecznie uruchomić ponownie.
require('dotenv').config();
const pool = require('./src/db');
const { encryptSecret, decryptSecret } = require('./src/lib/crypto');

(async () => {
  try {
    const r = await pool.query('SELECT id, totp_secret FROM users WHERE totp_secret IS NOT NULL');
    let migrated = 0, skipped = 0;
    for (const u of r.rows) {
      try {
        decryptSecret(u.totp_secret); // udało się -> już zaszyfrowany
        skipped++;
      } catch (e) {
        // nie da się odszyfrować -> traktujemy jako jawny tekst i szyfrujemy
        const plain = Buffer.from(u.totp_secret).toString('utf8');
        await pool.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [encryptSecret(plain), u.id]);
        migrated++;
      }
    }
    console.log(`Gotowe. Zaszyfrowano: ${migrated}, pominięto (już zaszyfrowane): ${skipped}.`);
  } catch (e) {
    console.error('Błąd migracji:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
