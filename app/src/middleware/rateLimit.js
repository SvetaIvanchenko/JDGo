// Proste ograniczanie liczby żądań (rate limiting) w pamięci — WN-1.
// Klucz: adres IP + e-mail (jeśli w treści) + ścieżka. Bez zewnętrznych zależności.
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const email = req.body && req.body.email ? String(req.body.email).toLowerCase() : '';
    const key = (req.ip || '') + '|' + email + '|' + req.path;
    let rec = hits.get(key);
    if (!rec || now > rec.reset) { rec = { count: 0, reset: now + windowMs }; hits.set(key, rec); }
    rec.count++;
    if (hits.size > 5000) { for (const [k, v] of hits) { if (now > v.reset) hits.delete(k); } }
    if (rec.count > max) {
      return res.status(429).json({ error: message || 'Zbyt wiele prób. Spróbuj później.' });
    }
    next();
  };
}

module.exports = rateLimit;
