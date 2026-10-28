// Szyfrowanie danych wrażliwych w spoczynku — AES-256-GCM (WN-1).
// Klucz pochodzi ze zmiennej środowiskowej TOTP_KEY (w produkcji ustaw długi, losowy).
const crypto = require('crypto');

const KEY = crypto.createHash('sha256')
  .update(process.env.TOTP_KEY || 'dev-totp-key-zmien-mnie')
  .digest(); // 32 bajty

// Zwraca Buffer: [iv(12) | tag(16) | ciphertext] — do zapisania w kolumnie BYTEA.
function encryptSecret(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

function decryptSecret(buf) {
  buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
