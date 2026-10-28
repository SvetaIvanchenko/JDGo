-- ============================================================================
--  JDGo — KOMPLETNY schemat bazy danych (wszystko w jednym pliku)
--  System ewidencji przychodów, kosztów i faktur dla JDG (praca dyplomowa)
--
--  Ten plik łączy w prawidłowej kolejności:
--    1) schema.sql           — model fizyczny (tabele, ograniczenia, indeksy)
--    2) schema_advanced.sql  — triggery obliczeń, widoki, audyt, wyszukiwanie
--    3) schema_refactor.sql  — funkcje biznesowe + walidacja + RLS (rola jdg_app)
--    4) schema_features.sql  — KPiR, rejestr VAT, historia zmian, szablony, kursy
--
--  Uruchomienie (jednorazowo, na świeżej bazie):
--    CREATE DATABASE dyplomdb;
--    psql -U postgres -d dyplomdb -f schema_full.sql
--
--  Po wczytaniu ustaw hasło roli aplikacyjnej (wymagane dla RLS):
--    ALTER ROLE jdg_app PASSWORD 'twoje_haslo';
--  i wpisz je w DATABASE_URL aplikacji.
--
--  (Pliki modułowe pozostają osobno — ten plik jest wersją "all-in-one"
--   do prezentacji na obronie.)
-- ============================================================================


-- ########################################################################
-- ##  schema.sql
-- ########################################################################

-- System ewidencji przychodów, kosztów i faktur dla JDG
-- Schemat bazy danych PostgreSQL (model fizyczny)
-- Praca dyplomowa — zgodny z wymaganiami WF-1..WF-22, WN-1..WN-8
--
-- Uruchomienie:  psql -U postgres -d dyplomdb -f schema.sql
-- Wymagany PostgreSQL 14+ (testowane na 16/18).


-- Rozszerzenia
CREATE EXTENSION IF NOT EXISTS citext;    -- e-mail bez rozróżniania wielkości liter
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- szyfrowanie danych wrażliwych (WN-1)


-- Typy wyliczeniowe (ENUM)
CREATE TYPE tax_form          AS ENUM ('skala', 'liniowy');           -- WF-21
CREATE TYPE operation_type    AS ENUM ('przychod', 'koszt');         -- WF-8 / WF-9
CREATE TYPE invoice_direction AS ENUM ('sprzedaz', 'zakup');         -- faktura wystawiona / otrzymana
CREATE TYPE payment_status    AS ENUM ('oplacona', 'nieoplacona');   -- WF-19
CREATE TYPE record_source     AS ENUM ('reczny', 'csv', 'ksef_xml'); -- WF-14 / WF-R1


-- Funkcja pomocnicza: automatyczna aktualizacja kolumny updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Tabela słownikowa: stawki VAT (23%, 8%, 5%, 0%, zw.). 'zw' = zwolniona (rate = NULL).
CREATE TABLE vat_rates (
    id          SMALLINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code        VARCHAR(4)    NOT NULL UNIQUE,                 -- '23','8','5','0','zw'
    rate        NUMERIC(5,4)  CHECK (rate >= 0 AND rate <= 1), -- np. 0.2300; NULL dla 'zw'
    description VARCHAR(50)   NOT NULL
);

COMMENT ON TABLE  vat_rates IS 'Słownik stawek VAT (WF-6, WF-12).';
COMMENT ON COLUMN vat_rates.rate IS 'Ułamek dziesiętny stawki, NULL oznacza zwolnienie (zw.).';

INSERT INTO vat_rates (code, rate, description) VALUES
    ('23', 0.2300, 'Stawka podstawowa 23%'),
    ('8',  0.0800, 'Stawka obniżona 8%'),
    ('5',  0.0500, 'Stawka obniżona 5%'),
    ('0',  0.0000, 'Stawka 0%'),
    ('zw', NULL,   'Zwolniona z VAT');


-- Użytkownicy (Przedsiębiorca): konto, uwierzytelnianie, profil (WF-1..WF-7, WF-21, WN-1)
CREATE TABLE users (
    id                  BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    -- Uwierzytelnianie
    email               CITEXT       NOT NULL UNIQUE,
    password_hash       TEXT         NOT NULL,                 -- argon2/bcrypt (WN-1)

    -- Dwuetapowe uwierzytelnianie TOTP (WF-3)
    totp_secret         BYTEA,                                 -- zaszyfrowany (pgcrypto)
    totp_enabled        BOOLEAN      NOT NULL DEFAULT FALSE,

    -- Zgody: regulamin i RODO jako jedno pole (jeden checkbox na stronie)
    terms_accepted      BOOLEAN      NOT NULL DEFAULT FALSE,
    terms_accepted_at   TIMESTAMPTZ,

    -- Profil (WF-6, WF-7, WF-21)
    display_name        VARCHAR(120),
    service_category    VARCHAR(120),                          -- kategoria świadczonych usług (PKD/PKWiU, tekst dowolny)
    default_vat_rate_id SMALLINT     NOT NULL DEFAULT 1
                                     REFERENCES vat_rates(id) ON DELETE RESTRICT,
    tax_form            tax_form     NOT NULL DEFAULT 'skala', -- forma opodatkowania
    default_currency    CHAR(3)      NOT NULL DEFAULT 'PLN',   -- ISO 4217

    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  users IS 'Konto przedsiębiorcy: uwierzytelnianie + profil (WF-1..WF-7, WF-21).';
COMMENT ON COLUMN users.totp_secret IS 'Sekret TOTP przechowywany w postaci zaszyfrowanej (WN-1).';
COMMENT ON COLUMN users.terms_accepted_at IS 'Moment akceptacji regulaminu/RODO — zasada rozliczalności (art. 7 RODO).';

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Kontrahenci (WF-18)
CREATE TABLE contractors (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- WF-5

    name         VARCHAR(200) NOT NULL,
    nip          VARCHAR(10)  CHECK (nip ~ '^[0-9]{10}$'),   -- 10 cyfr lub NULL

    -- Dane adresowe
    street       VARCHAR(200),
    postal_code  VARCHAR(10),
    city         VARCHAR(120),
    country      CHAR(2)      DEFAULT 'PL',                  -- ISO 3166-1 alpha-2

    -- Pełnotekstowe wyszukiwanie po nazwie (WF-16)
    search_tsv   tsvector GENERATED ALWAYS AS
                 (to_tsvector('simple', coalesce(name, ''))) STORED,

    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE contractors IS 'Kontrahenci przypisani do użytkownika (WF-18).';

CREATE INDEX idx_contractors_user   ON contractors(user_id);
CREATE INDEX idx_contractors_name   ON contractors(user_id, name);
CREATE INDEX idx_contractors_search ON contractors USING GIN (search_tsv);

CREATE TRIGGER trg_contractors_updated
    BEFORE UPDATE ON contractors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Faktury (WF-10, WF-19, WF-20). Nadawanie numeru/daty i wysyłka do KSeF poza zakresem.
CREATE TABLE invoices (
    id               BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id          BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contractor_id    BIGINT       REFERENCES contractors(id) ON DELETE SET NULL,

    direction        invoice_direction NOT NULL,             -- sprzedaż / zakup
    invoice_number   VARCHAR(60),                            -- może być NULL (poza zakresem)
    issue_date       DATE,                                   -- data wystawienia (opcjonalna)
    sale_date        DATE,                                   -- data sprzedaży/dostawy
    payment_due_date DATE,                                   -- termin płatności (WF-19)
    payment_state    payment_status NOT NULL DEFAULT 'nieoplacona', -- WF-19

    currency         CHAR(3)      NOT NULL DEFAULT 'PLN',     -- WF-20, ISO 4217

    -- Sumy (WN-8: DECIMAL, 2 miejsca po przecinku)
    total_net        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_net   >= 0),
    total_vat        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_vat   >= 0),
    total_gross      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_gross >= 0),

    source           record_source NOT NULL DEFAULT 'reczny', -- WF-14 / WF-R1
    notes            TEXT,

    created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_invoice_gross CHECK (total_gross = total_net + total_vat)
);

COMMENT ON TABLE invoices IS 'Faktury sprzedaży i zakupu (WF-10, WF-19).';

CREATE INDEX idx_invoices_user       ON invoices(user_id);
CREATE INDEX idx_invoices_contractor ON invoices(contractor_id);
CREATE INDEX idx_invoices_due_date   ON invoices(user_id, payment_due_date);
CREATE INDEX idx_invoices_pay_state  ON invoices(user_id, payment_state);
CREATE UNIQUE INDEX uq_invoices_number
    ON invoices(user_id, invoice_number) WHERE invoice_number IS NOT NULL;

CREATE TRIGGER trg_invoices_updated
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Pozycje faktury — szczegóły potrzebne przy imporcie KSeF FA(3)
CREATE TABLE invoice_items (
    id              BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id      BIGINT        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

    name            VARCHAR(300)  NOT NULL,                  -- nazwa towaru/usługi
    quantity        NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_net  NUMERIC(14,2) NOT NULL CHECK (unit_price_net >= 0),
    vat_rate_id     SMALLINT      NOT NULL REFERENCES vat_rates(id) ON DELETE RESTRICT,

    line_net        NUMERIC(14,2) NOT NULL CHECK (line_net   >= 0),
    line_vat        NUMERIC(14,2) NOT NULL CHECK (line_vat   >= 0),
    line_gross      NUMERIC(14,2) NOT NULL CHECK (line_gross >= 0),

    CONSTRAINT chk_item_gross CHECK (line_gross = line_net + line_vat)
);

COMMENT ON TABLE invoice_items IS 'Pozycje faktury (import KSeF FA(3), podgląd faktury).';

CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id);


-- Operacje — przychody i koszty w jednej tabeli (typ rozróżnia rodzaj)
-- WF-8, WF-9, WF-11, WF-12, WF-16, WF-20; podstawa zestawień WF-15, WF-22
CREATE TABLE operations (
    id              BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- WF-5
    contractor_id   BIGINT        REFERENCES contractors(id) ON DELETE SET NULL,
    invoice_id      BIGINT        REFERENCES invoices(id) ON DELETE SET NULL, -- powiązanie z fakturą (opcjonalne)

    type            operation_type NOT NULL,                 -- 'przychod' / 'koszt'
    operation_date  DATE          NOT NULL,
    category        VARCHAR(120),
    description     TEXT,

    -- Kwoty (WN-8: DECIMAL, 2 miejsca; WF-12 wyliczane net/VAT/brutto)
    currency        CHAR(3)       NOT NULL DEFAULT 'PLN',    -- WF-20, ISO 4217
    vat_rate_id     SMALLINT      NOT NULL REFERENCES vat_rates(id) ON DELETE RESTRICT,
    amount_net      NUMERIC(14,2) NOT NULL CHECK (amount_net   >= 0),
    amount_vat      NUMERIC(14,2) NOT NULL CHECK (amount_vat   >= 0),
    amount_gross    NUMERIC(14,2) NOT NULL CHECK (amount_gross >= 0),

    -- Pełnotekstowe wyszukiwanie po opisie i kategorii (WF-16)
    search_tsv      tsvector GENERATED ALWAYS AS
                    (to_tsvector('simple', coalesce(description, '') || ' ' || coalesce(category, ''))) STORED,

    source          record_source NOT NULL DEFAULT 'reczny', -- WF-14
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

    CONSTRAINT chk_operation_gross CHECK (amount_gross = amount_net + amount_vat)
);

COMMENT ON TABLE  operations IS 'Ewidencja przychodów i kosztów (WF-8, WF-9).';
COMMENT ON COLUMN operations.type IS 'Rodzaj operacji: przychod lub koszt.';

CREATE INDEX idx_operations_user       ON operations(user_id);
CREATE INDEX idx_operations_date       ON operations(user_id, operation_date);
CREATE INDEX idx_operations_type       ON operations(user_id, type);
CREATE INDEX idx_operations_contractor ON operations(contractor_id);
CREATE INDEX idx_operations_invoice    ON operations(invoice_id);
CREATE INDEX idx_operations_search     ON operations USING GIN (search_tsv);

CREATE TRIGGER trg_operations_updated
    BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- Importy — śledzenie wsadów importu CSV/XML (WF-14, WF-R1)
CREATE TABLE import_batches (
    id            BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source        record_source NOT NULL,                   -- 'csv' / 'ksef_xml'
    file_name     VARCHAR(255),
    rows_total    INTEGER       NOT NULL DEFAULT 0,
    rows_imported INTEGER       NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE import_batches IS 'Historia importów danych z plików (WF-14, WF-R1).';

CREATE INDEX idx_import_batches_user ON import_batches(user_id);


-- Sesje — kontrola czasu trwania sesji i bezczynności (WF-4)
CREATE TABLE user_sessions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),     -- bezczynność (WF-4)
    expires_at      TIMESTAMPTZ  NOT NULL,                   -- maks. czas trwania (WF-4)
    ip_address      INET,
    user_agent      TEXT
);

COMMENT ON TABLE user_sessions IS 'Sesje użytkownika — wygasanie po bezczynności i czasie (WF-4).';

CREATE INDEX idx_sessions_user    ON user_sessions(user_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);


-- =====================================================================
-- Elementy zaawansowane bazy danych
-- =====================================================================


-- Widoki (VIEW) — logika zestawień przeniesiona do warstwy bazy danych

-- Operacje wzbogacone o kod stawki VAT i nazwę kontrahenta (wygodne do listy/wyszukiwania)
CREATE VIEW v_operations_full AS
SELECT o.id, o.user_id, o.type, o.operation_date,
       o.category, o.description, o.currency,
       vr.code AS vat_code, vr.rate AS vat_rate,
       o.amount_net, o.amount_vat, o.amount_gross,
       c.name AS contractor_name, o.invoice_id, o.source
FROM operations o
JOIN vat_rates vr ON vr.id = o.vat_rate_id
LEFT JOIN contractors c ON c.id = o.contractor_id;

COMMENT ON VIEW v_operations_full IS 'Operacje z rozwiniętymi danymi stawki VAT i kontrahenta.';

-- Miesięczne zestawienie sum netto/VAT/brutto wg typu i stawki (podstawa WF-15)
CREATE VIEW v_monthly_summary AS
SELECT user_id,
       date_trunc('month', operation_date)::date AS month,
       type,
       vat_rate_id,
       sum(amount_net)   AS sum_net,
       sum(amount_vat)   AS sum_vat,
       sum(amount_gross) AS sum_gross,
       count(*)          AS items
FROM operations
GROUP BY user_id, date_trunc('month', operation_date), type, vat_rate_id;

COMMENT ON VIEW v_monthly_summary IS 'Miesięczne sumy operacji wg typu i stawki VAT (WF-15).';


-- Funkcje SQL — rozliczenia za okres realizowane w bazie danych

-- WF-15: rozliczenie VAT za okres (VAT należny - VAT naliczony)
CREATE OR REPLACE FUNCTION f_vat_settlement(
    p_user_id BIGINT, p_from DATE, p_to DATE)
RETURNS TABLE (vat_nalezny NUMERIC, vat_naliczony NUMERIC, do_zaplaty NUMERIC)
LANGUAGE sql STABLE AS $$
    SELECT
        coalesce(sum(amount_vat) FILTER (WHERE type = 'przychod'), 0) AS vat_nalezny,
        coalesce(sum(amount_vat) FILTER (WHERE type = 'koszt'),    0) AS vat_naliczony,
        coalesce(sum(amount_vat) FILTER (WHERE type = 'przychod'), 0)
          - coalesce(sum(amount_vat) FILTER (WHERE type = 'koszt'), 0) AS do_zaplaty
    FROM operations
    WHERE user_id = p_user_id
      AND operation_date BETWEEN p_from AND p_to;
$$;

COMMENT ON FUNCTION f_vat_settlement IS 'Rozliczenie VAT za okres: należny - naliczony (WF-15).';

-- WF-22: uproszczona zaliczka na PIT za okres wg formy opodatkowania
-- Uwaga: uproszczenie — dla skali stosuje 12% bez progu 32% i kwoty wolnej.
CREATE OR REPLACE FUNCTION f_pit_advance(
    p_user_id BIGINT, p_from DATE, p_to DATE)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_income NUMERIC;
    v_cost   NUMERIC;
    v_dochod NUMERIC;
    v_form   tax_form;
BEGIN
    SELECT tax_form INTO v_form FROM users WHERE id = p_user_id;

    SELECT coalesce(sum(amount_net) FILTER (WHERE type = 'przychod'), 0),
           coalesce(sum(amount_net) FILTER (WHERE type = 'koszt'),    0)
      INTO v_income, v_cost
    FROM operations
    WHERE user_id = p_user_id
      AND operation_date BETWEEN p_from AND p_to;

    v_dochod := v_income - v_cost;
    IF v_dochod <= 0 THEN
        RETURN 0;
    END IF;

    IF v_form = 'liniowy' THEN
        RETURN round(v_dochod * 0.19, 2);   -- podatek liniowy 19%
    ELSE
        RETURN round(v_dochod * 0.12, 2);   -- skala (uproszczone 12%)
    END IF;
END;
$$;

COMMENT ON FUNCTION f_pit_advance IS 'Uproszczona zaliczka na PIT za okres wg formy opodatkowania (WF-22).';


-- Audyt zmian operacji — dziennik historii przez trigger

CREATE TABLE operations_audit (
    id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operation_id BIGINT,                                     -- bez FK: operacja może już nie istnieć
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- WF-5
    action       VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_data     JSONB,
    new_data     JSONB
);

COMMENT ON TABLE operations_audit IS 'Dziennik zmian operacji (kto/kiedy/co) realizowany triggerem.';

CREATE INDEX idx_operations_audit_op   ON operations_audit(operation_id);
CREATE INDEX idx_operations_audit_user ON operations_audit(user_id);

CREATE OR REPLACE FUNCTION audit_operations()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO operations_audit(operation_id, user_id, action, new_data)
            VALUES (NEW.id, NEW.user_id, 'INSERT', to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO operations_audit(operation_id, user_id, action, old_data, new_data)
            VALUES (NEW.id, NEW.user_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSE  -- DELETE
        INSERT INTO operations_audit(operation_id, user_id, action, old_data)
            VALUES (OLD.id, OLD.user_id, 'DELETE', to_jsonb(OLD));
        RETURN OLD;
    END IF;
END;
$$;

CREATE TRIGGER trg_operations_audit
    AFTER INSERT OR UPDATE OR DELETE ON operations
    FOR EACH ROW EXECUTE FUNCTION audit_operations();


-- Row-Level Security (RLS) — izolacja danych: każdy użytkownik widzi tylko własne wiersze
-- Aplikacja po zalogowaniu ustawia na połączeniu:  SET app.current_user_id = '<id>';
-- i łączy się rolą BEZ uprawnień właściciela tabel (właściciel domyślnie omija RLS).

ALTER TABLE contractors    ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_contractors_isolation ON contractors
    USING (user_id = nullif(current_setting('app.current_user_id', true), '')::bigint);

CREATE POLICY p_invoices_isolation ON invoices
    USING (user_id = nullif(current_setting('app.current_user_id', true), '')::bigint);

CREATE POLICY p_operations_isolation ON operations
    USING (user_id = nullif(current_setting('app.current_user_id', true), '')::bigint);

CREATE POLICY p_import_batches_isolation ON import_batches
    USING (user_id = nullif(current_setting('app.current_user_id', true), '')::bigint);

CREATE POLICY p_user_sessions_isolation ON user_sessions
    USING (user_id = nullif(current_setting('app.current_user_id', true), '')::bigint);

-- Pozycje faktury nie mają własnego user_id — izolacja przez fakturę nadrzędną
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_invoice_items_isolation ON invoice_items
    USING (invoice_id IN (
        SELECT id FROM invoices
        WHERE user_id = nullif(current_setting('app.current_user_id', true), '')::bigint
    ));

-- ########################################################################
-- ##  schema_advanced.sql
-- ########################################################################

-- ============================================================================
--  JDGo — rozszerzenia bazodanowe (praca z naciskiem na SUBD)
--  Uruchom PO schema.sql:  psql -U postgres -d dyplomdb -f schema_advanced.sql
--
--  Zawiera:
--   1) Typy DOMAIN (modelowanie na poziomie typu)
--   2) Triggery liczące — logika obliczeń przeniesiona z aplikacji do bazy
--   3) Widoki analityczne (funkcje okna: running total, RANK, LAG)
--  Skrypt jest w większości idempotentny (można uruchomić ponownie).
-- ============================================================================


-- 1) TYPY DOMAIN -------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nip') THEN
    CREATE DOMAIN nip AS VARCHAR(10) CHECK (VALUE ~ '^[0-9]{10}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency_code') THEN
    CREATE DOMAIN currency_code AS CHAR(3) CHECK (VALUE ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- Zastosowanie domen do istniejących kolumn (typ pilnuje poprawności formatu).
ALTER TABLE contractors ALTER COLUMN nip TYPE nip;
ALTER TABLE invoices    ALTER COLUMN currency TYPE currency_code;
ALTER TABLE users       ALTER COLUMN default_currency TYPE currency_code;

-- operations.currency jest używana w widoku v_operations_full — PostgreSQL nie pozwala
-- zmienić typu kolumny zależnej od widoku, więc odtwarzamy widok wokół zmiany typu.
DROP VIEW IF EXISTS v_operations_full;
ALTER TABLE operations ALTER COLUMN currency TYPE currency_code;
CREATE VIEW v_operations_full AS
SELECT o.id, o.user_id, o.type, o.operation_date, o.category, o.description, o.currency,
       vr.code AS vat_code, vr.rate AS vat_rate,
       o.amount_net, o.amount_vat, o.amount_gross,
       c.name AS contractor_name, o.invoice_id, o.source
FROM operations o
JOIN vat_rates vr ON vr.id = o.vat_rate_id
LEFT JOIN contractors c ON c.id = o.contractor_id;


-- 2) TRIGGERY LICZĄCE (logika obliczeń w bazie) ------------------------------

-- Operacje: netto/VAT/brutto wyliczane z kwoty netto i stawki (WF-12 w SUBD).
CREATE OR REPLACE FUNCTION trg_operation_calc()
RETURNS TRIGGER AS $$
DECLARE r NUMERIC;
BEGIN
  SELECT COALESCE(rate, 0) INTO r FROM vat_rates WHERE id = NEW.vat_rate_id;
  NEW.amount_net   := round(NEW.amount_net, 2);
  NEW.amount_vat   := round(NEW.amount_net * r, 2);
  NEW.amount_gross := round(NEW.amount_net + NEW.amount_vat, 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS operation_calc ON operations;
CREATE TRIGGER operation_calc
  BEFORE INSERT OR UPDATE ON operations
  FOR EACH ROW EXECUTE FUNCTION trg_operation_calc();

-- Pozycje faktury: wartości linii wyliczane z ilości, ceny i stawki.
CREATE OR REPLACE FUNCTION trg_invoice_item_calc()
RETURNS TRIGGER AS $$
DECLARE r NUMERIC;
BEGIN
  SELECT COALESCE(rate, 0) INTO r FROM vat_rates WHERE id = NEW.vat_rate_id;
  NEW.line_net   := round(NEW.quantity * NEW.unit_price_net, 2);
  NEW.line_vat   := round(NEW.line_net * r, 2);
  NEW.line_gross := round(NEW.line_net + NEW.line_vat, 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoice_item_calc ON invoice_items;
CREATE TRIGGER invoice_item_calc
  BEFORE INSERT OR UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION trg_invoice_item_calc();

-- Faktura: sumy (netto/VAT/brutto) utrzymywane automatycznie z pozycji.
CREATE OR REPLACE FUNCTION trg_invoice_totals()
RETURNS TRIGGER AS $$
DECLARE inv BIGINT;
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  UPDATE invoices SET
    total_net   = COALESCE((SELECT sum(line_net)   FROM invoice_items WHERE invoice_id = inv), 0),
    total_vat   = COALESCE((SELECT sum(line_vat)   FROM invoice_items WHERE invoice_id = inv), 0),
    total_gross = COALESCE((SELECT sum(line_gross) FROM invoice_items WHERE invoice_id = inv), 0)
  WHERE id = inv;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoice_totals ON invoice_items;
CREATE TRIGGER invoice_totals
  AFTER INSERT OR UPDATE OR DELETE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION trg_invoice_totals();


-- 3) WIDOKI ANALITYCZNE (funkcje okna) ---------------------------------------

-- Saldo narastająco (przychody minus koszty) w kolejności dat — running total.
CREATE OR REPLACE VIEW v_running_balance AS
SELECT
  user_id,
  operation_date,
  type,
  amount_net,
  sum(CASE WHEN type = 'przychod' THEN amount_net ELSE -amount_net END)
    OVER (PARTITION BY user_id ORDER BY operation_date, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_narastajaco
FROM operations;

COMMENT ON VIEW v_running_balance IS 'Saldo narastające wg dat (funkcja okna SUM ... OVER).';

-- Ranking kontrahentów wg obrotu (przychody) — RANK w obrębie użytkownika.
CREATE OR REPLACE VIEW v_top_contractors AS
SELECT
  user_id, contractor_id, contractor_name, obrot,
  RANK() OVER (PARTITION BY user_id ORDER BY obrot DESC) AS pozycja
FROM (
  SELECT o.user_id, o.contractor_id, c.name AS contractor_name,
         sum(o.amount_net) FILTER (WHERE o.type = 'przychod') AS obrot
  FROM operations o JOIN contractors c ON c.id = o.contractor_id
  GROUP BY o.user_id, o.contractor_id, c.name
) t
WHERE obrot IS NOT NULL;

COMMENT ON VIEW v_top_contractors IS 'Ranking kontrahentów wg obrotu (RANK OVER PARTITION).';

-- Dynamika miesięczna: zmiana przychodu względem poprzedniego miesiąca — LAG.
CREATE OR REPLACE VIEW v_monthly_dynamics AS
SELECT
  user_id, miesiac, przychod, koszt,
  przychod - LAG(przychod) OVER (PARTITION BY user_id ORDER BY miesiac) AS zmiana_przychodu
FROM (
  SELECT user_id,
         date_trunc('month', operation_date)::date AS miesiac,
         COALESCE(sum(amount_net) FILTER (WHERE type = 'przychod'), 0) AS przychod,
         COALESCE(sum(amount_net) FILTER (WHERE type = 'koszt'), 0)    AS koszt
  FROM operations
  GROUP BY user_id, date_trunc('month', operation_date)
) m;

COMMENT ON VIEW v_monthly_dynamics IS 'Miesięczna dynamika przychodu (funkcja LAG).';

-- ########################################################################
-- ##  schema_refactor.sql
-- ########################################################################

-- ============================================================================
--  JDGo — refaktor: przeniesienie logiki biznesowej do bazy danych
--  Uruchom PO: schema.sql  oraz  schema_advanced.sql
--     psql -U postgres -d dyplomdb -f schema_refactor.sql
--
--  Zawiera:
--   1) Walidacja na poziomie bazy (triggery + RAISE EXCEPTION)
--   2) Funkcje CRUD (operacje, kontrahenci, faktury) — walidacja i zapis w BD
--   3) Funkcje raportów i wyszukiwania — zwracają gotowy JSON (jsonb)
--   4) Funkcja importu CSV (jsonb) — matching, walidacja, wstawianie, raport
--   5) Aktywacja RLS: rola aplikacyjna jdg_app + uprawnienia
--  Skrypt jest idempotentny (CREATE OR REPLACE / DROP IF EXISTS / DO).
-- ============================================================================


-- Kontekst użytkownika ustawiany przez aplikację:  SET app.current_user_id = '<id>'
CREATE OR REPLACE FUNCTION f_current_uid() RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::bigint;
$$;
COMMENT ON FUNCTION f_current_uid IS 'Id zalogowanego użytkownika z kontekstu sesji (RLS).';


-- 1) WALIDACJA NA POZIOMIE BAZY ---------------------------------------------

-- Operacje: kontrahent i faktura muszą należeć do tego samego użytkownika.
CREATE OR REPLACE FUNCTION trg_operation_owner() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contractor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM contractors WHERE id = NEW.contractor_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Nieprawidłowy kontrahent' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.invoice_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM invoices WHERE id = NEW.invoice_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Nieprawidłowa faktura' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS operation_owner ON operations;
CREATE TRIGGER operation_owner BEFORE INSERT OR UPDATE ON operations
  FOR EACH ROW EXECUTE FUNCTION trg_operation_owner();

-- Faktury: kontrahent musi należeć do tego samego użytkownika.
CREATE OR REPLACE FUNCTION trg_invoice_owner() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contractor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM contractors WHERE id = NEW.contractor_id AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Nieprawidłowy kontrahent' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS invoice_owner ON invoices;
CREATE TRIGGER invoice_owner BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_invoice_owner();


-- 2) FUNKCJE CRUD (walidacja + zapis w bazie) -------------------------------

-- Operacja: zapis (insert gdy p_id IS NULL, inaczej update). Kwoty VAT/brutto
-- dolicza trigger operation_calc. Zwraca id operacji.
CREATE OR REPLACE FUNCTION f_operation_save(
  p_id BIGINT, p_type TEXT, p_date DATE, p_contractor BIGINT,
  p_category TEXT, p_description TEXT, p_currency TEXT,
  p_vat_rate_id SMALLINT, p_net NUMERIC)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_uid BIGINT := f_current_uid(); v_cur CHAR(3); v_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Brak kontekstu użytkownika' USING ERRCODE = 'P0001'; END IF;
  IF p_type NOT IN ('przychod','koszt') THEN RAISE EXCEPTION 'Nieprawidłowy typ operacji' USING ERRCODE = 'P0001'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Nieprawidłowa data' USING ERRCODE = 'P0001'; END IF;
  IF p_net IS NULL OR p_net < 0 THEN RAISE EXCEPTION 'Nieprawidłowa kwota netto' USING ERRCODE = 'P0001'; END IF;
  v_cur := upper(coalesce(p_currency, 'PLN'));
  IF v_cur !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Nieprawidłowy kod waluty (ISO 4217)' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM vat_rates WHERE id = p_vat_rate_id) THEN RAISE EXCEPTION 'Nieprawidłowa stawka VAT' USING ERRCODE = 'P0001'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO operations (user_id, contractor_id, type, operation_date, category, description,
                            currency, vat_rate_id, amount_net, source)
    VALUES (v_uid, p_contractor, p_type::operation_type, p_date,
            nullif(p_category, ''), nullif(p_description, ''), v_cur, p_vat_rate_id, p_net, 'reczny')
    RETURNING id INTO v_id;
  ELSE
    UPDATE operations SET contractor_id = p_contractor, type = p_type::operation_type, operation_date = p_date,
           category = nullif(p_category, ''), description = nullif(p_description, ''),
           currency = v_cur, vat_rate_id = p_vat_rate_id, amount_net = p_net
    WHERE id = p_id AND user_id = v_uid
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono operacji' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION f_operation_delete(p_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  DELETE FROM operations WHERE id = p_id AND user_id = f_current_uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Nie znaleziono operacji' USING ERRCODE = 'P0001'; END IF;
  RETURN TRUE;
END; $$;

-- Kontrahent: zapis (insert/update). Zwraca id.
CREATE OR REPLACE FUNCTION f_contractor_save(
  p_id BIGINT, p_name TEXT, p_nip TEXT, p_street TEXT,
  p_postal_code TEXT, p_city TEXT, p_country TEXT)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_uid BIGINT := f_current_uid(); v_id BIGINT; v_nip TEXT; v_country TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Brak kontekstu użytkownika' USING ERRCODE = 'P0001'; END IF;
  IF coalesce(trim(p_name), '') = '' THEN RAISE EXCEPTION 'Podaj nazwę kontrahenta' USING ERRCODE = 'P0001'; END IF;
  v_nip := nullif(trim(coalesce(p_nip, '')), '');
  IF v_nip IS NOT NULL AND v_nip !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Nieprawidłowy NIP (10 cyfr)' USING ERRCODE = 'P0001'; END IF;
  v_country := upper(nullif(trim(coalesce(p_country, '')), ''));

  IF p_id IS NULL THEN
    INSERT INTO contractors (user_id, name, nip, street, postal_code, city, country)
    VALUES (v_uid, trim(p_name), v_nip, nullif(trim(coalesce(p_street,'')),''),
            nullif(trim(coalesce(p_postal_code,'')),''), nullif(trim(coalesce(p_city,'')),''), coalesce(v_country,'PL'))
    RETURNING id INTO v_id;
  ELSE
    UPDATE contractors SET name = trim(p_name), nip = v_nip,
           street = nullif(trim(coalesce(p_street,'')),''), postal_code = nullif(trim(coalesce(p_postal_code,'')),''),
           city = nullif(trim(coalesce(p_city,'')),''), country = coalesce(v_country,'PL')
    WHERE id = p_id AND user_id = v_uid
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono kontrahenta' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION f_contractor_delete(p_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  DELETE FROM contractors WHERE id = p_id AND user_id = f_current_uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Nie znaleziono kontrahenta' USING ERRCODE = 'P0001'; END IF;
  RETURN TRUE;
END; $$;

-- Faktura: zapis nagłówka + pozycji (jsonb). Sumy i wartości linii liczą triggery.
CREATE OR REPLACE FUNCTION f_invoice_save(p_id BIGINT, p_payload JSONB)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_uid BIGINT := f_current_uid(); v_id BIGINT;
  v_dir TEXT := p_payload->>'direction';
  v_state TEXT := coalesce(nullif(p_payload->>'payment_state',''), 'nieoplacona');
  v_cur CHAR(3) := upper(coalesce(nullif(p_payload->>'currency',''), 'PLN'));
  v_contr BIGINT := nullif(p_payload->>'contractor_id','')::bigint;
  v_items JSONB := coalesce(p_payload->'items', '[]'::jsonb);
  it JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Brak kontekstu użytkownika' USING ERRCODE = 'P0001'; END IF;
  IF v_dir NOT IN ('sprzedaz','zakup') THEN RAISE EXCEPTION 'Nieprawidłowy typ faktury' USING ERRCODE = 'P0001'; END IF;
  IF v_state NOT IN ('oplacona','nieoplacona') THEN RAISE EXCEPTION 'Nieprawidłowy status płatności' USING ERRCODE = 'P0001'; END IF;
  IF v_cur !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Nieprawidłowy kod waluty' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_typeof(v_items) <> 'array' OR jsonb_array_length(v_items) < 1 THEN
    RAISE EXCEPTION 'Faktura musi mieć co najmniej jedną pozycję' USING ERRCODE = 'P0001';
  END IF;

  FOR it IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    IF coalesce(trim(it->>'name'), '') = '' THEN RAISE EXCEPTION 'Pozycja musi mieć nazwę' USING ERRCODE = 'P0001'; END IF;
    IF coalesce((it->>'quantity')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Nieprawidłowa ilość' USING ERRCODE = 'P0001'; END IF;
    IF coalesce((it->>'unit_price_net')::numeric, -1) < 0 THEN RAISE EXCEPTION 'Nieprawidłowa cena' USING ERRCODE = 'P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM vat_rates WHERE id = (it->>'vat_rate_id')::smallint) THEN
      RAISE EXCEPTION 'Nieprawidłowa stawka VAT' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  IF p_id IS NULL THEN
    INSERT INTO invoices (user_id, contractor_id, direction, invoice_number, issue_date, sale_date,
                          payment_due_date, payment_state, currency, notes, source)
    VALUES (v_uid, v_contr, v_dir::invoice_direction, nullif(p_payload->>'invoice_number',''),
            nullif(p_payload->>'issue_date','')::date, nullif(p_payload->>'sale_date','')::date,
            nullif(p_payload->>'payment_due_date','')::date, v_state::payment_status, v_cur,
            nullif(p_payload->>'notes',''), 'reczny')
    RETURNING id INTO v_id;
  ELSE
    UPDATE invoices SET contractor_id = v_contr, direction = v_dir::invoice_direction,
           invoice_number = nullif(p_payload->>'invoice_number',''),
           issue_date = nullif(p_payload->>'issue_date','')::date, sale_date = nullif(p_payload->>'sale_date','')::date,
           payment_due_date = nullif(p_payload->>'payment_due_date','')::date, payment_state = v_state::payment_status,
           currency = v_cur, notes = nullif(p_payload->>'notes','')
    WHERE id = p_id AND user_id = v_uid
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono faktury' USING ERRCODE = 'P0001'; END IF;
    DELETE FROM invoice_items WHERE invoice_id = v_id;
  END IF;

  INSERT INTO invoice_items (invoice_id, name, quantity, unit_price_net, vat_rate_id)
  SELECT v_id, trim(value->>'name'), (value->>'quantity')::numeric,
         (value->>'unit_price_net')::numeric, (value->>'vat_rate_id')::smallint
  FROM jsonb_array_elements(v_items);

  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION f_invoice_delete(p_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  DELETE FROM invoices WHERE id = p_id AND user_id = f_current_uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Nie znaleziono faktury' USING ERRCODE = 'P0001'; END IF;
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION f_invoice_set_payment(p_id BIGINT, p_state TEXT, p_due DATE)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  IF p_state NOT IN ('oplacona','nieoplacona') THEN RAISE EXCEPTION 'Nieprawidłowy status' USING ERRCODE = 'P0001'; END IF;
  UPDATE invoices SET payment_state = p_state::payment_status,
         payment_due_date = COALESCE(p_due, payment_due_date)
  WHERE id = p_id AND user_id = f_current_uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Nie znaleziono faktury' USING ERRCODE = 'P0001'; END IF;
  RETURN TRUE;
END; $$;


-- 3) FUNKCJE RAPORTÓW I WYSZUKIWANIA (zwracają gotowy JSON) ------------------

-- Zestawienie za okres (WF-15, WF-22): sumy, rozbicie wg stawek, VAT, PIT.
CREATE OR REPLACE FUNCTION f_report_summary(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_uid BIGINT := f_current_uid();
  inet NUMERIC; ivat NUMERIC; igross NUMERIC; cnet NUMERIC; cvat NUMERIC; cgross NUMERIC;
  v_vat RECORD; v_pit NUMERIC; v_byrate JSONB;
BEGIN
  SELECT coalesce(sum(amount_net)   FILTER (WHERE type='przychod'),0),
         coalesce(sum(amount_vat)   FILTER (WHERE type='przychod'),0),
         coalesce(sum(amount_gross) FILTER (WHERE type='przychod'),0),
         coalesce(sum(amount_net)   FILTER (WHERE type='koszt'),0),
         coalesce(sum(amount_vat)   FILTER (WHERE type='koszt'),0),
         coalesce(sum(amount_gross) FILTER (WHERE type='koszt'),0)
    INTO inet, ivat, igross, cnet, cvat, cgross
  FROM operations WHERE user_id = v_uid AND operation_date BETWEEN p_from AND p_to;

  SELECT * INTO v_vat FROM f_vat_settlement(v_uid, p_from, p_to);
  v_pit := f_pit_advance(v_uid, p_from, p_to);

  SELECT coalesce(jsonb_agg(jsonb_build_object('type', t, 'vat_code', vc, 'net', n, 'vat', v, 'gross', g)
                            ORDER BY t, vc), '[]'::jsonb)
    INTO v_byrate
  FROM (
    SELECT o.type t, vr.code vc, sum(o.amount_net) n, sum(o.amount_vat) v, sum(o.amount_gross) g
    FROM operations o JOIN vat_rates vr ON vr.id = o.vat_rate_id
    WHERE o.user_id = v_uid AND o.operation_date BETWEEN p_from AND p_to
    GROUP BY o.type, vr.code
  ) s;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to,
    'byRate', v_byrate,
    'income', jsonb_build_object('net', inet, 'vat', ivat, 'gross', igross),
    'cost',   jsonb_build_object('net', cnet, 'vat', cvat, 'gross', cgross),
    'wynik_net', round(inet - cnet, 2),
    'vat', jsonb_build_object('vat_nalezny', v_vat.vat_nalezny, 'vat_naliczony', v_vat.vat_naliczony, 'do_zaplaty', v_vat.do_zaplaty),
    'pit', v_pit
  );
END; $$;

-- Dane do wykresów: sumy miesięczne + podział wg kategorii (WF-R2).
CREATE OR REPLACE FUNCTION f_report_monthly(p_year INT)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  m AS (
    SELECT to_char(date_trunc('month', operation_date), 'YYYY-MM') ym, type, sum(amount_net) net
    FROM operations, u
    WHERE user_id = u.id AND operation_date >= make_date(p_year,1,1) AND operation_date < make_date(p_year+1,1,1)
    GROUP BY 1, 2
  ),
  cat AS (
    SELECT type, coalesce(category, '(bez kategorii)') cat, sum(amount_net) net
    FROM operations, u
    WHERE user_id = u.id AND operation_date >= make_date(p_year,1,1) AND operation_date < make_date(p_year+1,1,1)
    GROUP BY 1, 2 ORDER BY 3 DESC
  ),
  months AS (
    SELECT to_char(make_date(p_year, g, 1), 'YYYY-MM') ym,
           coalesce((SELECT net FROM m WHERE m.ym = to_char(make_date(p_year,g,1),'YYYY-MM') AND m.type='przychod'), 0) przychod,
           coalesce((SELECT net FROM m WHERE m.ym = to_char(make_date(p_year,g,1),'YYYY-MM') AND m.type='koszt'), 0) koszt
    FROM generate_series(1,12) g
  )
  SELECT jsonb_build_object(
    'year', p_year::text,
    'months', (SELECT jsonb_agg(jsonb_build_object('month', ym, 'przychod', przychod, 'koszt', koszt) ORDER BY ym) FROM months),
    'byCategory', coalesce((SELECT jsonb_agg(jsonb_build_object('type', type, 'cat', cat, 'net', net)) FROM cat), '[]'::jsonb)
  );
$$;

-- Pulpit: faktury do zapłaty / przeterminowane + ostatnie operacje.
CREATE OR REPLACE FUNCTION f_dashboard()
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  agg AS (
    SELECT count(*) FILTER (WHERE payment_state='nieoplacona') unpaid_count,
           coalesce(sum(total_gross) FILTER (WHERE payment_state='nieoplacona'),0) unpaid_total,
           count(*) FILTER (WHERE payment_state='nieoplacona' AND payment_due_date IS NOT NULL AND payment_due_date<CURRENT_DATE) overdue_count,
           coalesce(sum(total_gross) FILTER (WHERE payment_state='nieoplacona' AND payment_due_date IS NOT NULL AND payment_due_date<CURRENT_DATE),0) overdue_total
    FROM invoices, u WHERE user_id = u.id AND direction = 'sprzedaz'
  ),
  due AS (
    SELECT i.id, i.invoice_number, i.total_gross, i.currency,
           to_char(i.payment_due_date,'YYYY-MM-DD') payment_due_date,
           (i.payment_due_date IS NOT NULL AND i.payment_due_date < CURRENT_DATE) overdue,
           c.name contractor_name
    FROM invoices i LEFT JOIN contractors c ON c.id = i.contractor_id, u
    WHERE i.user_id = u.id AND i.direction='sprzedaz' AND i.payment_state='nieoplacona'
    ORDER BY i.payment_due_date ASC NULLS LAST, i.id DESC LIMIT 5
  ),
  recent AS (
    SELECT o.id, o.type, to_char(o.operation_date,'YYYY-MM-DD') operation_date,
           o.description, o.category, o.currency, o.amount_gross, c.name contractor_name
    FROM operations o LEFT JOIN contractors c ON c.id = o.contractor_id, u
    WHERE o.user_id = u.id ORDER BY o.operation_date DESC, o.id DESC LIMIT 6
  )
  SELECT jsonb_build_object(
    'invoices', jsonb_build_object(
      'unpaidCount', (SELECT unpaid_count FROM agg),
      'unpaidTotal', (SELECT unpaid_total FROM agg),
      'overdueCount', (SELECT overdue_count FROM agg),
      'overdueTotal', (SELECT overdue_total FROM agg),
      'due', coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM due d), '[]'::jsonb)),
    'recent', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM recent r), '[]'::jsonb)
  );
$$;

-- Płaska lista operacji za okres — do eksportu CSV (WF-R3).
CREATE OR REPLACE FUNCTION f_period_operations(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  rows AS (
    SELECT to_char(o.operation_date,'YYYY-MM-DD') operation_date, o.type, c.name contractor_name,
           o.category, o.description, vr.code vat_code, o.currency, o.amount_net, o.amount_vat, o.amount_gross
    FROM operations o JOIN vat_rates vr ON vr.id = o.vat_rate_id LEFT JOIN contractors c ON c.id = o.contractor_id, u
    WHERE o.user_id = u.id AND o.operation_date BETWEEN p_from AND p_to
    ORDER BY o.operation_date, o.id
  )
  SELECT jsonb_build_object('from', p_from, 'to', p_to,
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM rows r), '[]'::jsonb));
$$;

-- Dane analityczne (funkcje okna): saldo narastające + ranking kontrahentów.
CREATE OR REPLACE FUNCTION f_analytics()
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  bal AS (
    SELECT to_char(operation_date,'YYYY-MM-DD') date,
           sum(sum(CASE WHEN type='przychod' THEN amount_net ELSE -amount_net END)) OVER (ORDER BY operation_date) saldo
    FROM operations, u WHERE user_id = u.id GROUP BY operation_date
  ),
  top AS (
    SELECT t.contractor_name, t.obrot, t.pozycja
    FROM v_top_contractors t, u WHERE t.user_id = u.id AND t.pozycja <= 8 ORDER BY t.pozycja
  )
  SELECT jsonb_build_object(
    'runningBalance', coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.date) FROM bal b), '[]'::jsonb),
    'topContractors', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.pozycja) FROM top t), '[]'::jsonb)
  );
$$;

-- Globalne wyszukiwanie (WF-16): operacje / kontrahenci / faktury.
CREATE OR REPLACE FUNCTION f_global_search(p_q TEXT)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  ops AS (
    SELECT o.id, o.type, o.description, o.category, o.amount_gross, o.currency,
           to_char(o.operation_date,'YYYY-MM-DD') date
    FROM operations o, u
    WHERE o.user_id = u.id
      AND (o.search_tsv @@ plainto_tsquery('simple', p_q)
           OR o.description ILIKE '%'||p_q||'%' OR o.category ILIKE '%'||p_q||'%')
    ORDER BY o.operation_date DESC, o.id DESC LIMIT 6
  ),
  contr AS (
    SELECT c.id, c.name, c.nip, c.city
    FROM contractors c, u
    WHERE c.user_id = u.id
      AND (c.search_tsv @@ plainto_tsquery('simple', p_q) OR c.name ILIKE '%'||p_q||'%' OR c.nip ILIKE '%'||p_q||'%')
    ORDER BY c.name LIMIT 6
  ),
  inv AS (
    SELECT i.id, i.invoice_number, c.name contractor_name, i.total_gross, i.currency
    FROM invoices i LEFT JOIN contractors c ON c.id = i.contractor_id, u
    WHERE i.user_id = u.id
      AND (i.invoice_number ILIKE '%'||p_q||'%' OR c.name ILIKE '%'||p_q||'%')
    ORDER BY i.issue_date DESC NULLS LAST, i.id DESC LIMIT 6
  )
  SELECT jsonb_build_object(
    'operations',  coalesce((SELECT jsonb_agg(to_jsonb(o)) FROM ops o), '[]'::jsonb),
    'contractors', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM contr c), '[]'::jsonb),
    'invoices',    coalesce((SELECT jsonb_agg(to_jsonb(i)) FROM inv i), '[]'::jsonb)
  );
$$;


-- 4) IMPORT CSV (walidacja + matching + wstawianie w bazie) ------------------
CREATE OR REPLACE FUNCTION f_import_operations(p_rows JSONB, p_filename TEXT)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_uid BIGINT := f_current_uid();
  r JSONB; i INT := 0; imported INT := 0; errs JSONB := '[]'::jsonb; err TEXT;
  v_type TEXT; v_date TEXT; v_net NUMERIC; v_code TEXT; v_cur TEXT; v_cname TEXT; v_cid BIGINT; v_vat SMALLINT;
  v_dt DATE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Brak kontekstu użytkownika' USING ERRCODE = 'P0001'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'Brak danych do importu' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(p_rows) > 1000 THEN RAISE EXCEPTION 'Zbyt wiele wierszy (max 1000)' USING ERRCODE = 'P0001'; END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    err := NULL; v_vat := NULL; v_cid := NULL; v_dt := NULL;
    BEGIN
      v_type  := trim(coalesce(r->>'type', ''));
      v_date  := trim(coalesce(r->>'operation_date', ''));
      v_code  := trim(coalesce(r->>'stawka', '23'));
      v_cur   := upper(trim(coalesce(r->>'waluta', 'PLN')));
      v_cname := trim(coalesce(r->>'contractor', ''));
      BEGIN v_net := replace(coalesce(r->>'amount_net',''), ',', '.')::numeric;
      EXCEPTION WHEN others THEN v_net := NULL; END;

      -- data: format RRRR-MM-DD oraz rzeczywista poprawność kalendarzowa
      IF v_date ~ '^\d{4}-\d{2}-\d{2}$' THEN
        BEGIN v_dt := v_date::date; EXCEPTION WHEN others THEN v_dt := NULL; END;
      END IF;

      IF v_type NOT IN ('przychod','koszt') THEN err := 'typ musi być przychod/koszt';
      ELSIF v_dt IS NULL THEN err := 'nieprawidłowa data (RRRR-MM-DD)';
      ELSIF v_net IS NULL OR v_net < 0 THEN err := 'nieprawidłowa kwota netto';
      ELSIF v_cur !~ '^[A-Z]{3}$' THEN err := 'nieprawidłowy kod waluty';
      ELSE
        SELECT id INTO v_vat FROM vat_rates WHERE code = v_code;
        IF v_vat IS NULL THEN err := 'nieprawidłowa stawka VAT'; END IF;
      END IF;

      IF err IS NULL THEN
        IF v_cname <> '' THEN
          SELECT id INTO v_cid FROM contractors WHERE user_id = v_uid AND lower(name) = lower(v_cname) LIMIT 1;
        END IF;
        INSERT INTO operations (user_id, contractor_id, type, operation_date, category, description,
                                currency, vat_rate_id, amount_net, source)
        VALUES (v_uid, v_cid, v_type::operation_type, v_dt,
                nullif(trim(coalesce(r->>'category','')),''), nullif(trim(coalesce(r->>'description','')),''),
                v_cur, v_vat, v_net, 'csv');
        imported := imported + 1;
      ELSE
        errs := errs || jsonb_build_object('index', i, 'error', err);
      END IF;
    EXCEPTION WHEN others THEN
      errs := errs || jsonb_build_object('index', i, 'error', 'wiersz odrzucony: ' || SQLERRM);
    END;
    i := i + 1;
  END LOOP;

  INSERT INTO import_batches (user_id, source, file_name, rows_total, rows_imported)
  VALUES (v_uid, 'csv', nullif(p_filename, ''), i, imported);

  RETURN jsonb_build_object('imported', imported, 'total', i, 'errors', errs);
END; $$;


-- 4b) FUNKCJE LISTUJĄCE (odczyt list i szczegółów jako JSON) ----------------

-- Lista operacji z filtrowaniem per kolumna i sortowaniem (WF-16). Filtry w jsonb.
CREATE OR REPLACE FUNCTION f_operations_list(p JSONB)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY
      (CASE WHEN p->>'sort'='amount'     AND coalesce(p->>'dir','desc')='asc'  THEN t.amount_gross END) ASC,
      (CASE WHEN p->>'sort'='amount'     AND coalesce(p->>'dir','desc')<>'asc' THEN t.amount_gross END) DESC,
      (CASE WHEN p->>'sort'='contractor' AND coalesce(p->>'dir','desc')='asc'  THEN t.contractor_name END) ASC,
      (CASE WHEN p->>'sort'='contractor' AND coalesce(p->>'dir','desc')<>'asc' THEN t.contractor_name END) DESC,
      (CASE WHEN p->>'sort'='category'   AND coalesce(p->>'dir','desc')='asc'  THEN t.category END) ASC,
      (CASE WHEN p->>'sort'='category'   AND coalesce(p->>'dir','desc')<>'asc' THEN t.category END) DESC,
      (CASE WHEN coalesce(p->>'sort','date')='date' AND coalesce(p->>'dir','desc')='asc'  THEN t.operation_date END) ASC,
      (CASE WHEN coalesce(p->>'sort','date')='date' AND coalesce(p->>'dir','desc')<>'asc' THEN t.operation_date END) DESC,
      t.id DESC
    ), '[]'::jsonb)
  FROM (
    SELECT o.id, o.type, to_char(o.operation_date,'YYYY-MM-DD') operation_date,
           o.category, o.description, o.currency, o.vat_rate_id, vr.code vat_code,
           o.contractor_id, c.name contractor_name, o.amount_net, o.amount_vat, o.amount_gross
    FROM operations o
    JOIN vat_rates vr ON vr.id = o.vat_rate_id
    LEFT JOIN contractors c ON c.id = o.contractor_id
    WHERE o.user_id = f_current_uid()
      AND (nullif(p->>'type','')      IS NULL OR o.type = (p->>'type')::operation_type)
      AND (nullif(p->>'dq','')        IS NULL OR to_char(o.operation_date,'YYYY-MM-DD') ILIKE '%'||(p->>'dq')||'%')
      AND (nullif(p->>'contractor','')IS NULL OR c.name ILIKE '%'||(p->>'contractor')||'%')
      AND (nullif(p->>'opis','')      IS NULL OR o.description ILIKE '%'||(p->>'opis')||'%')
      AND (nullif(p->>'kategoria','') IS NULL OR o.category ILIKE '%'||(p->>'kategoria')||'%')
      AND (nullif(p->>'stawka','')    IS NULL OR vr.code = p->>'stawka')
      AND (nullif(p->>'waluta','')    IS NULL OR o.currency = upper(p->>'waluta'))
      AND (nullif(p->>'netMin','')    IS NULL OR o.amount_net   >= (p->>'netMin')::numeric)
      AND (nullif(p->>'vatMin','')    IS NULL OR o.amount_vat   >= (p->>'vatMin')::numeric)
      AND (nullif(p->>'grossMin','')  IS NULL OR o.amount_gross >= (p->>'grossMin')::numeric)
  ) t;
$$;

CREATE OR REPLACE FUNCTION f_contractors_list()
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.name), '[]'::jsonb)
  FROM (
    SELECT id, name, nip, street, postal_code, city, country
    FROM contractors WHERE user_id = f_current_uid()
  ) t;
$$;

CREATE OR REPLACE FUNCTION f_invoices_list(p_status TEXT, p_direction TEXT)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.isd DESC NULLS LAST, t.id DESC), '[]'::jsonb)
  FROM (
    SELECT i.id, i.direction, i.invoice_number,
           to_char(i.issue_date,'YYYY-MM-DD') issue_date,
           to_char(i.payment_due_date,'YYYY-MM-DD') payment_due_date,
           i.payment_state, i.currency, i.total_net, i.total_vat, i.total_gross,
           c.name contractor_name, i.issue_date isd
    FROM invoices i LEFT JOIN contractors c ON c.id = i.contractor_id
    WHERE i.user_id = f_current_uid()
      AND (nullif(p_status,'')    IS NULL OR i.payment_state = p_status::payment_status)
      AND (nullif(p_direction,'') IS NULL OR i.direction = p_direction::invoice_direction)
  ) t;
$$;

CREATE OR REPLACE FUNCTION f_invoice_get(p_id BIGINT)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN i.id IS NULL THEN NULL ELSE
    jsonb_build_object(
      'id', i.id, 'direction', i.direction, 'invoice_number', i.invoice_number,
      'issue_date', to_char(i.issue_date,'YYYY-MM-DD'),
      'sale_date', to_char(i.sale_date,'YYYY-MM-DD'),
      'payment_due_date', to_char(i.payment_due_date,'YYYY-MM-DD'),
      'payment_state', i.payment_state, 'currency', i.currency, 'notes', i.notes,
      'contractor_id', i.contractor_id, 'contractor_name', c.name, 'contractor_nip', c.nip,
      'total_net', i.total_net, 'total_vat', i.total_vat, 'total_gross', i.total_gross,
      'items', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', it.id, 'name', it.name, 'quantity', it.quantity,
                 'unit_price_net', it.unit_price_net, 'vat_rate_id', it.vat_rate_id,
                 'vat_code', vr.code, 'line_net', it.line_net, 'line_vat', it.line_vat, 'line_gross', it.line_gross)
               ORDER BY it.id)
        FROM invoice_items it JOIN vat_rates vr ON vr.id = it.vat_rate_id
        WHERE it.invoice_id = i.id), '[]'::jsonb)
    )
  END
  FROM invoices i LEFT JOIN contractors c ON c.id = i.contractor_id
  WHERE i.id = p_id AND i.user_id = f_current_uid();
$$;


-- 5) AKTYWACJA RLS: rola aplikacyjna + uprawnienia --------------------------
-- Aplikacja łączy się rolą jdg_app (nie-właściciel → podlega RLS) i na każdym
-- żądaniu wykonuje: SELECT set_config('app.current_user_id', '<id>', false);
-- ZMIEŃ hasło poniżej i wpisz je w DATABASE_URL w pliku .env.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jdg_app') THEN
    CREATE ROLE jdg_app LOGIN PASSWORD 'jdg_app_zmien_mnie' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- Tabela sesji dla connect-pg-simple (express-session w PostgreSQL).
-- Sesje przeżywają restart serwera (ważne na hostingu usypiającym instancję).
-- Bez RLS — zarządza nią warstwa sesji aplikacji.
CREATE TABLE IF NOT EXISTS session (
  sid    VARCHAR PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

GRANT USAGE ON SCHEMA public TO jdg_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jdg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jdg_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO jdg_app;

-- Przyszłe obiekty (gdyby skrypt rozszerzać) również dostępne dla roli.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jdg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO jdg_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO jdg_app;

-- ########################################################################
-- ##  schema_features.sql
-- ########################################################################

-- ============================================================================
--  JDGo — rozszerzenia dziedzinowe (ewidencje podatkowe JDG)
--  Uruchom PO: schema.sql, schema_advanced.sql, schema_refactor.sql
--     psql -U postgres -d dyplomdb -f schema_features.sql
--
--  Zawiera (grupa B — dziedzina JDG), generowane w bazie i filtrowane per
--  użytkownik (f_current_uid, zgodnie z RLS):
--   1) f_kpir()         — Podatkowa Księga Przychodów i Rozchodów (uproszczona)
--   2) f_vat_register() — Rejestr VAT sprzedaży i zakupów
--  Skrypt jest idempotentny (CREATE OR REPLACE).
-- ============================================================================


-- 1) KPiR — uproszczona Księga Przychodów i Rozchodów (WF rozszerzenie) -------
-- Mapowanie na kolumny KPiR (uproszczenie):
--   przychód netto  -> kol. 7/9 (wartość sprzedaży / razem przychód)
--   koszt netto     -> kol. 14/15 (pozostałe wydatki / razem wydatki)
CREATE OR REPLACE FUNCTION f_kpir(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  ops AS (
    SELECT row_number() OVER (ORDER BY o.operation_date, o.id) AS lp,
           to_char(o.operation_date,'YYYY-MM-DD')              AS data,
           coalesce(inv.invoice_number, '—')                  AS nr_dowodu,
           coalesce(c.name, '—')                              AS kontrahent,
           coalesce(nullif(o.description,''), o.category, '—') AS opis,
           CASE WHEN o.type='przychod' THEN o.amount_net ELSE 0 END AS przychod,
           CASE WHEN o.type='koszt'    THEN o.amount_net ELSE 0 END AS koszt
    FROM operations o
    LEFT JOIN contractors c ON c.id = o.contractor_id
    LEFT JOIN invoices inv  ON inv.id = o.invoice_id, u
    WHERE o.user_id = u.id AND o.operation_date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.lp) FROM ops o), '[]'::jsonb),
    'sum_przychod', coalesce((SELECT sum(przychod) FROM ops), 0),
    'sum_koszt',    coalesce((SELECT sum(koszt) FROM ops), 0),
    'dochod',       coalesce((SELECT sum(przychod) - sum(koszt) FROM ops), 0)
  );
$$;
COMMENT ON FUNCTION f_kpir IS 'Uproszczona KPiR za okres (przychody/koszty netto wg zapisów).';


-- 2) Rejestr VAT — sprzedaży i zakupów za okres ------------------------------
CREATE OR REPLACE FUNCTION f_vat_register(p_from DATE, p_to DATE)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  reg AS (
    SELECT o.type,
           to_char(o.operation_date,'YYYY-MM-DD') AS data,
           coalesce(c.name, '—')                  AS kontrahent,
           coalesce(c.nip, '—')                   AS nip,
           coalesce(inv.invoice_number, '—')      AS dokument,
           vr.code                                AS stawka,
           o.amount_net AS netto, o.amount_vat AS vat, o.amount_gross AS brutto
    FROM operations o
    JOIN vat_rates vr ON vr.id = o.vat_rate_id
    LEFT JOIN contractors c ON c.id = o.contractor_id
    LEFT JOIN invoices inv  ON inv.id = o.invoice_id, u
    WHERE o.user_id = u.id AND o.operation_date BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'sales',      coalesce((SELECT jsonb_agg(to_jsonb(r) - 'type' ORDER BY r.data) FROM reg r WHERE r.type='przychod'), '[]'::jsonb),
    'purchases',  coalesce((SELECT jsonb_agg(to_jsonb(r) - 'type' ORDER BY r.data) FROM reg r WHERE r.type='koszt'),    '[]'::jsonb),
    'sales_vat',     coalesce((SELECT sum(vat) FROM reg WHERE type='przychod'), 0),
    'purchases_vat', coalesce((SELECT sum(vat) FROM reg WHERE type='koszt'), 0)
  );
$$;
COMMENT ON FUNCTION f_vat_register IS 'Rejestr VAT sprzedaży i zakupów za okres (WF-15 rozszerzenie).';


-- Uprawnienia dla roli aplikacyjnej (funkcje ewidencji).
GRANT EXECUTE ON FUNCTION f_kpir(DATE, DATE)         TO jdg_app;
GRANT EXECUTE ON FUNCTION f_vat_register(DATE, DATE) TO jdg_app;


-- 3) AUDYT TEMPORALNY — wspólny dziennik zmian (operacje/faktury/kontrahenci) -
-- Operacje mają już własny dziennik (operations_audit). Faktury i kontrahentów
-- rejestruje wspólna tabela change_log; strona „Historia zmian” łączy oba źródła.

CREATE TABLE IF NOT EXISTS change_log (
    id         BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL,
    entity     TEXT        NOT NULL,                         -- nazwa tabeli (contractors/invoices)
    entity_id  BIGINT,
    action     VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_data   JSONB,
    new_data   JSONB
);
CREATE INDEX IF NOT EXISTS idx_change_log_user ON change_log(user_id, changed_at DESC);

CREATE OR REPLACE FUNCTION trg_audit_row() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO change_log(user_id, entity, entity_id, action, old_data)
      VALUES (OLD.user_id, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Pomijamy zapis, gdy faktura zmieniła się tylko przez przeliczenie sum (trigger).
    IF TG_TABLE_NAME = 'invoices'
       AND (to_jsonb(OLD) - 'total_net' - 'total_vat' - 'total_gross' - 'updated_at')
         = (to_jsonb(NEW) - 'total_net' - 'total_vat' - 'total_gross' - 'updated_at') THEN
      RETURN NEW;
    END IF;
    INSERT INTO change_log(user_id, entity, entity_id, action, old_data, new_data)
      VALUES (NEW.user_id, TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO change_log(user_id, entity, entity_id, action, new_data)
      VALUES (NEW.user_id, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  END IF;
END; $$;

DROP TRIGGER IF EXISTS audit_contractors ON contractors;
CREATE TRIGGER audit_contractors AFTER INSERT OR UPDATE OR DELETE ON contractors
  FOR EACH ROW EXECUTE FUNCTION trg_audit_row();
DROP TRIGGER IF EXISTS audit_invoices ON invoices;
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_audit_row();

-- RLS dla dzienników audytu (izolacja jak dla danych).
ALTER TABLE change_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_change_log_isolation ON change_log;
CREATE POLICY p_change_log_isolation ON change_log
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::bigint);
DROP POLICY IF EXISTS p_operations_audit_isolation ON operations_audit;
CREATE POLICY p_operations_audit_isolation ON operations_audit
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::bigint);

-- Historia zmian (ostatnie wpisy) — łączy operations_audit + change_log.
CREATE OR REPLACE FUNCTION f_history(p_limit INT DEFAULT 100)
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  feed AS (
    SELECT 'operacja' AS entity, a.operation_id AS entity_id, a.action, a.changed_at,
           coalesce(a.new_data->>'description', a.old_data->>'description',
                    a.new_data->>'category',    a.old_data->>'category', '—') AS label
    FROM operations_audit a, u WHERE a.user_id = u.id
    UNION ALL
    SELECT cl.entity, cl.entity_id, cl.action, cl.changed_at,
           coalesce(cl.new_data->>'name',           cl.old_data->>'name',
                    cl.new_data->>'invoice_number', cl.old_data->>'invoice_number', '—') AS label
    FROM change_log cl, u WHERE cl.user_id = u.id
  )
  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT entity, entity_id, action, to_char(changed_at,'YYYY-MM-DD HH24:MI') AS changed_at, label
    FROM feed ORDER BY changed_at DESC LIMIT p_limit
  ) t;
$$;
COMMENT ON FUNCTION f_history IS 'Dziennik zmian użytkownika (operacje/faktury/kontrahenci).';

GRANT SELECT, INSERT ON change_log TO jdg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jdg_app;
GRANT EXECUTE ON FUNCTION f_history(INT) TO jdg_app;


-- 4) WIEKOWANIE NALEŻNOŚCI (aging) — nieopłacone faktury sprzedaży wg przedziałów
CREATE OR REPLACE FUNCTION f_aging()
RETURNS JSONB LANGUAGE sql STABLE AS $$
  WITH u AS (SELECT f_current_uid() id),
  inv AS (
    SELECT i.total_gross,
      CASE
        WHEN i.payment_due_date IS NULL OR i.payment_due_date >= CURRENT_DATE THEN 'current'
        WHEN CURRENT_DATE - i.payment_due_date BETWEEN 1 AND 30  THEN 'd30'
        WHEN CURRENT_DATE - i.payment_due_date BETWEEN 31 AND 60 THEN 'd60'
        ELSE 'd60plus'
      END AS bucket
    FROM invoices i, u
    WHERE i.user_id = u.id AND i.direction = 'sprzedaz' AND i.payment_state = 'nieoplacona'
  )
  SELECT jsonb_build_object(
    'current', jsonb_build_object('count', count(*) FILTER (WHERE bucket='current'),  'sum', coalesce(sum(total_gross) FILTER (WHERE bucket='current'),0)),
    'd30',     jsonb_build_object('count', count(*) FILTER (WHERE bucket='d30'),      'sum', coalesce(sum(total_gross) FILTER (WHERE bucket='d30'),0)),
    'd60',     jsonb_build_object('count', count(*) FILTER (WHERE bucket='d60'),      'sum', coalesce(sum(total_gross) FILTER (WHERE bucket='d60'),0)),
    'd60plus', jsonb_build_object('count', count(*) FILTER (WHERE bucket='d60plus'),  'sum', coalesce(sum(total_gross) FILTER (WHERE bucket='d60plus'),0)),
    'total',   coalesce(sum(total_gross), 0)
  ) FROM inv;
$$;
COMMENT ON FUNCTION f_aging IS 'Wiekowanie należności: nieopłacone faktury sprzedaży wg przedziałów przeterminowania.';

GRANT EXECUTE ON FUNCTION f_aging() TO jdg_app;


-- 5) SZABLONY OPERACJI (powtarzalne przychody/koszty) -----------------------
CREATE TABLE IF NOT EXISTS operation_templates (
    id            BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id       BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          VARCHAR(120)  NOT NULL,
    type          operation_type NOT NULL DEFAULT 'koszt',
    contractor_id BIGINT        REFERENCES contractors(id) ON DELETE SET NULL,
    category      VARCHAR(120),
    description   TEXT,
    currency      currency_code NOT NULL DEFAULT 'PLN',
    vat_rate_id   SMALLINT      NOT NULL REFERENCES vat_rates(id) ON DELETE RESTRICT,
    amount_net    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_net >= 0),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON operation_templates(user_id);

ALTER TABLE operation_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_templates_isolation ON operation_templates;
CREATE POLICY p_templates_isolation ON operation_templates
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::bigint);

CREATE OR REPLACE FUNCTION f_template_save(
  p_id BIGINT, p_name TEXT, p_type TEXT, p_contractor BIGINT,
  p_category TEXT, p_description TEXT, p_currency TEXT,
  p_vat_rate_id SMALLINT, p_net NUMERIC)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE v_uid BIGINT := f_current_uid(); v_cur CHAR(3); v_id BIGINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Brak kontekstu użytkownika' USING ERRCODE = 'P0001'; END IF;
  IF coalesce(trim(p_name),'') = '' THEN RAISE EXCEPTION 'Podaj nazwę szablonu' USING ERRCODE = 'P0001'; END IF;
  IF p_type NOT IN ('przychod','koszt') THEN RAISE EXCEPTION 'Nieprawidłowy typ operacji' USING ERRCODE = 'P0001'; END IF;
  IF p_net IS NULL OR p_net < 0 THEN RAISE EXCEPTION 'Nieprawidłowa kwota netto' USING ERRCODE = 'P0001'; END IF;
  v_cur := upper(coalesce(p_currency,'PLN'));
  IF v_cur !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Nieprawidłowy kod waluty (ISO 4217)' USING ERRCODE = 'P0001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM vat_rates WHERE id = p_vat_rate_id) THEN RAISE EXCEPTION 'Nieprawidłowa stawka VAT' USING ERRCODE = 'P0001'; END IF;
  IF p_contractor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM contractors WHERE id = p_contractor AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Nieprawidłowy kontrahent' USING ERRCODE = 'P0001';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO operation_templates (user_id, name, type, contractor_id, category, description, currency, vat_rate_id, amount_net)
    VALUES (v_uid, trim(p_name), p_type::operation_type, p_contractor, nullif(p_category,''), nullif(p_description,''), v_cur, p_vat_rate_id, p_net)
    RETURNING id INTO v_id;
  ELSE
    UPDATE operation_templates SET name = trim(p_name), type = p_type::operation_type, contractor_id = p_contractor,
           category = nullif(p_category,''), description = nullif(p_description,''), currency = v_cur,
           vat_rate_id = p_vat_rate_id, amount_net = p_net
    WHERE id = p_id AND user_id = v_uid RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Nie znaleziono szablonu' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION f_template_delete(p_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  DELETE FROM operation_templates WHERE id = p_id AND user_id = f_current_uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Nie znaleziono szablonu' USING ERRCODE = 'P0001'; END IF;
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION f_templates_list()
RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.name), '[]'::jsonb)
  FROM (
    SELECT tpl.id, tpl.name, tpl.type, tpl.contractor_id, c.name AS contractor_name,
           tpl.category, tpl.description, tpl.currency, tpl.vat_rate_id, vr.code AS vat_code, tpl.amount_net
    FROM operation_templates tpl
    JOIN vat_rates vr ON vr.id = tpl.vat_rate_id
    LEFT JOIN contractors c ON c.id = tpl.contractor_id
    WHERE tpl.user_id = f_current_uid()
  ) t;
$$;

-- Utworzenie operacji z szablonu (reużywa walidację f_operation_save).
CREATE OR REPLACE FUNCTION f_template_use(p_id BIGINT, p_date DATE)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE t operation_templates;
BEGIN
  SELECT * INTO t FROM operation_templates WHERE id = p_id AND user_id = f_current_uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Nie znaleziono szablonu' USING ERRCODE = 'P0001'; END IF;
  RETURN f_operation_save(NULL, t.type::text, coalesce(p_date, CURRENT_DATE), t.contractor_id,
                          t.category, t.description, t.currency, t.vat_rate_id, t.amount_net);
END; $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON operation_templates TO jdg_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jdg_app;
GRANT EXECUTE ON FUNCTION f_template_save(BIGINT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, SMALLINT, NUMERIC) TO jdg_app;
GRANT EXECUTE ON FUNCTION f_template_delete(BIGINT) TO jdg_app;
GRANT EXECUTE ON FUNCTION f_templates_list() TO jdg_app;
GRANT EXECUTE ON FUNCTION f_template_use(BIGINT, DATE) TO jdg_app;


-- 6) KURSY WALUT (cache kursów średnich NBP, tabela A) -----------------------
-- Dane globalne (nie per-użytkownik) — bez RLS. Aplikacja uzupełnia z api.nbp.pl.
CREATE TABLE IF NOT EXISTS exchange_rates (
    currency   CHAR(3)       NOT NULL,          -- ISO 4217 (np. EUR); PLN = 1 (nie przechowywane)
    rate_date  DATE          NOT NULL,          -- data, dla której obowiązuje kurs
    rate       NUMERIC(12,6) NOT NULL CHECK (rate > 0),
    fetched_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
    PRIMARY KEY (currency, rate_date)
);
COMMENT ON TABLE exchange_rates IS 'Cache kursów średnich NBP (tabela A) pobieranych z api.nbp.pl.';

GRANT SELECT, INSERT, UPDATE ON exchange_rates TO jdg_app;
