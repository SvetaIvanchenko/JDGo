# Aplikacja JDGo — uruchomienie

> Główny opis projektu, struktura i pełna instrukcja: **`../README.md`**.
> Ten plik dotyczy wyłącznie uruchomienia samej aplikacji.

Backend: Node.js + Express (REST API). Frontend: HTML/CSS/vanilla JS.
Baza: PostgreSQL (schemat w `../schema.sql`).

## Uruchomienie (pierwszy raz)

1. Zainstaluj zaleznosci:
   ```
   npm install
   ```
2. Skopiuj `.env.example` do `.env` i uzupelnij haslo do bazy oraz `SESSION_SECRET`.
3. Upewnij sie, ze baza `dyplomdb` ma wczytane po kolei:
   `schema.sql` -> `schema_advanced.sql` -> `schema_refactor.sql` -> `schema_features.sql`.
   - `schema_advanced.sql` — triggery liczace kwoty netto/VAT/brutto.
   - `schema_refactor.sql` — logika biznesowa w funkcjach BD + walidacja + aktywacja RLS
     (tworzy role `jdg_app`). Po wczytaniu ustaw jej haslo:
     `ALTER ROLE jdg_app PASSWORD 'twoje_haslo';` i wpisz je w `DATABASE_URL`.
   - `schema_features.sql` — KPiR, rejestr VAT, historia zmian, szablony, kursy walut.
4. Start serwera:
   ```
   npm start
   ```
5. Otworz w przegladarce: http://localhost:3000

## Struktura

```
app/
  server.js              punkt wejscia (Express, sesje, statyczne pliki)
  src/
    db.js                pula polaczen z PostgreSQL
    middleware/auth.js   ochrona tras (requireAuth)
    routes/
      auth.js            WF-1,2,3,5 — rejestracja, login+OTP, logout, usun konto
      profile.js         WF-6,7,21 — profil uzytkownika
  public/
    index.html           strona startowa
    css/styles.css
    js/api.js            pomocnik fetch
    pages/
      register.html      rejestracja (WF-1)
      login.html         logowanie dwuetapowe z OTP (WF-2, WF-3)
      profile.html       profil + wlaczanie 2FA + usuniecie konta
```

## Co dziala

Rejestracja + 2FA, logowanie z OTP, profil, zmiana i eksport danych, usuniecie konta;
ewidencja przychodow/kosztow (CRUD, filtry per kolumna, sort), kontrahenci, faktury z
pozycjami i podgladem, zestawienia (VAT/PIT), wykresy, wyszukiwanie globalne, import CSV
oraz XML KSeF, eksport PDF/CSV, interfejs PL/EN. Bezpieczenstwo: hash hasel, polityka hasel,
2FA szyfrowane (AES-256-GCM), rate limiting, wygasanie sesji. Szczegoly wg `../PLAN_PRACY.md`.

## Architektura (logika w bazie danych)

Logika biznesowa jest przeniesiona do PostgreSQL — trasy Express sa cienka warstwa:
- **Obliczenia** (netto/VAT/brutto, sumy faktur) — triggery (`schema_advanced.sql`).
- **Walidacja** (typ, kwoty, waluta, wlasnosc kontrahenta) — triggery + `RAISE EXCEPTION`
  (kod `P0001` mapowany na HTTP 400).
- **CRUD, raporty, wyszukiwanie, import** — funkcje BD zwracajace gotowy JSON
  (`f_operation_save`, `f_invoice_save`, `f_report_summary`, `f_dashboard`, `f_analytics`,
  `f_global_search`, `f_import_operations`, `f_operations_list`, ...).
- **Izolacja danych** — RLS: aplikacja laczy sie rola `jdg_app` i ustawia
  `app.current_user_id` na poczatku kazdego zadania (middleware `src/middleware/dbContext.js`).
W aplikacji pozostaja: hash hasel (bcrypt), 2FA/TOTP, sesje, rate limiting, HTTP.

## Zmienne srodowiskowe (.env)

- `DATABASE_URL` — polaczenie z PostgreSQL.
- `SESSION_SECRET` — podpis ciasteczek sesji (dlugi, losowy).
- `TOTP_KEY` — klucz do szyfrowania sekretu 2FA (AES-256-GCM; dlugi, losowy).
- `PORT` — port serwera (domyslnie 3000).

## Uwagi wdrozeniowe (produkcja)

- **HTTPS/TLS:** przy wdrozeniu ustaw `cookie.secure = true` w `server.js` (platformy jak
  Render zapewniaja HTTPS automatycznie).
- **RLS:** aktywna po wczytaniu `schema_refactor.sql` i polaczeniu rola `jdg_app`
  (ustaw `DATABASE_URL` na te role). Jesli aplikacja laczy sie rola `postgres` (wlasciciel),
  RLS jest pomijana przez wlasciciela — izolacje zapewnia wtedy filtr `user_id` w funkcjach BD.
