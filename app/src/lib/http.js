// Mapowanie błędów bazy na odpowiedzi HTTP.
// Funkcje walidacyjne w bazie zgłaszają RAISE EXCEPTION ... USING ERRCODE = 'P0001'
// (błąd biznesowy/walidacji) → zwracamy 400 z komunikatem. Pozostałe → 500.
function sendDbError(res, e) {
  if (e && e.code === 'P0001') return res.status(400).json({ error: e.message });
  console.error(e);
  return res.status(500).json({ error: 'Blad serwera' });
}

module.exports = { sendDbError };
