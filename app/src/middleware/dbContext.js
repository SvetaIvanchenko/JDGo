// Kontekst RLS: dla zalogowanego żądania pobiera z puli dedykowane połączenie,
// ustawia app.current_user_id (wykorzystywane przez polityki RLS), udostępnia je
// jako req.db i zwalnia po zakończeniu odpowiedzi (z wyczyszczeniem kontekstu).
const pool = require('../db');

module.exports = async function dbContext(req, res, next) {
  if (!req.session || !req.session.userId) { req.db = pool; return next(); }

  let client;
  try {
    client = await pool.connect();
    await client.query("SELECT set_config('app.current_user_id', $1, false)", [String(req.session.userId)]);
  } catch (e) {
    if (client) client.release();
    return next(e);
  }

  req.db = client;
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    client.query("SELECT set_config('app.current_user_id', '', false)")
      .catch(() => {})
      .finally(() => client.release());
  };
  res.on('finish', release);
  res.on('close', release);
  next();
};
