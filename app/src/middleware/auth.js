// Middleware ochrony tras — wpuszcza tylko zalogowanych uzytkownikow.
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Wymagane zalogowanie' });
  }
  next();
}

module.exports = { requireAuth };
