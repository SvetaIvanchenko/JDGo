// Kursy walut — kursy średnie NBP (tabela A) z api.nbp.pl, z cache w bazie.
// Dla PLN kurs = 1. Dla pozostałych walut: kurs z podanej daty lub ostatni
// dostępny dzień roboczy przed nią (fallback). Wyniki zapisywane w exchange_rates.
const https = require('https');

const CODES = ['EUR', 'USD', 'GBP', 'CHF'];

// Pobranie JSON z NBP. Zwraca null dla 404 (brak notowania w danym dniu).
let fetcher = function nbpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      if (res.statusCode === 404) { res.resume(); return resolve(null); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('NBP HTTP ' + res.statusCode)); }
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
};
// Do testów: wstrzyknięcie własnego fetchera.
function _setFetcher(fn) { fetcher = fn; }

const base = 'https://api.nbp.pl/api/exchangerates/rates/a/';
const parse = (j) => (j && j.rates && j.rates[0] ? { rate: j.rates[0].mid, effDate: j.rates[0].effectiveDate } : null);

async function nbpForDate(code, date) {
  const d = new Date(date + 'T00:00:00Z');
  for (let i = 0; i < 8; i++) {                       // fallback: do 7 dni wstecz
    const ds = d.toISOString().slice(0, 10);
    const r = parse(await fetcher(base + code.toLowerCase() + '/' + ds + '/?format=json'));
    if (r) return r;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}
async function nbpLatest(code) {
  return parse(await fetcher(base + code.toLowerCase() + '/?format=json'));
}

// Kurs do PLN dla waluty i daty (date opcjonalne → ostatni dostępny).
async function getRate(db, currency, date) {
  const code = (currency || 'PLN').toUpperCase();
  const d = date || new Date().toISOString().slice(0, 10);
  if (code === 'PLN') return { code: 'PLN', rate: 1, rate_date: d };
  if (!/^[A-Z]{3}$/.test(code)) throw new Error('Nieprawidłowy kod waluty');

  const c = await db.query(
    "SELECT rate, to_char(rate_date,'YYYY-MM-DD') AS rate_date FROM exchange_rates WHERE currency = $1 AND rate_date = $2",
    [code, d]);
  if (c.rows.length) return { code, rate: Number(c.rows[0].rate), rate_date: c.rows[0].rate_date };

  const r = date ? await nbpForDate(code, d) : await nbpLatest(code);
  if (!r) throw new Error('Brak kursu NBP dla ' + code);
  await db.query(
    'INSERT INTO exchange_rates(currency, rate_date, rate) VALUES ($1, $2, $3) ' +
    'ON CONFLICT (currency, rate_date) DO UPDATE SET rate = EXCLUDED.rate, fetched_at = now()',
    [code, d, r.rate]);
  return { code, rate: Number(r.rate), rate_date: r.effDate };
}

// Bieżące kursy głównych walut (do strony „Kursy walut”).
async function getTable(db) {
  const out = [];
  for (const code of CODES) {
    try { out.push(await getRate(db, code, null)); } catch (e) { out.push({ code, rate: null, rate_date: null, error: true }); }
  }
  return out;
}

module.exports = { getRate, getTable, CODES, _setFetcher };
