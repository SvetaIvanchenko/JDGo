// Punkt wejscia aplikacji — serwer Express
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
app.set('trust proxy', 1); // za odwrotnym proxy (np. Render) — poprawny req.ip dla rate limitingu

// Parsowanie JSON i formularzy
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesja w ciasteczku (WN-1: httpOnly, SameSite; secure=true dopiero przy HTTPS)
// rolling: true — czas bezczynności resetuje się przy każdej aktywności (WF-4).
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-zmien-mnie',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,                 // ustaw true w produkcji (HTTPS)
    maxAge: 1000 * 60 * 30         // 30 min bezczynności (WF-4)
  }
}));

// WF-4: absolutny maksymalny czas trwania sesji (niezależnie od aktywności).
const MAX_SESSION_MS = 8 * 60 * 60 * 1000; // 8 godzin
app.use('/api', (req, res, next) => {
  if (req.session && req.session.userId) {
    if (!req.session.absExpiry) req.session.absExpiry = Date.now() + MAX_SESSION_MS;
    else if (Date.now() > req.session.absExpiry) {
      return req.session.destroy(() => res.status(401).json({ error: 'Sesja wygasła — zaloguj się ponownie' }));
    }
  }
  next();
});

// Kontekst RLS (ustawia app.current_user_id na dedykowanym połączeniu z puli).
// Dotyczy tras operujących na danych użytkownika; auth/profile działają na tabeli
// users (bez RLS) i korzystają ze wspólnej puli.
const dbContext = require('./src/middleware/dbContext');

// REST API
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/profile', require('./src/routes/profile'));
app.use('/api/operations', dbContext, require('./src/routes/operations'));
app.use('/api/contractors', dbContext, require('./src/routes/contractors'));
app.use('/api/invoices', dbContext, require('./src/routes/invoices'));
app.use('/api/reports', dbContext, require('./src/routes/reports'));
app.use('/api/search', dbContext, require('./src/routes/search'));
app.use('/api/import', dbContext, require('./src/routes/import'));
app.use('/api/templates', dbContext, require('./src/routes/templates'));
app.use('/api/rates', dbContext, require('./src/routes/rates'));

// Frontend — pliki statyczne z folderu public/
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serwer dziala: http://localhost:${PORT}`);
});
