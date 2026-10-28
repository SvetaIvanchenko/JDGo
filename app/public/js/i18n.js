// Warstwa tłumaczeń interfejsu (PL/EN). Dane użytkownika pozostają bez zmian —
// tłumaczony jest tylko interfejs (etykiety, przyciski, nagłówki, komunikaty).
// Mechanizm: słownik PL→EN stosowany do węzłów tekstowych i wybranych atrybutów,
// z MutationObserver dla treści budowanej dynamicznie przez skrypty stron.
// Ciągi spoza DOM (etykiety wykresów, PDF, CSV) tłumaczy się przez window.t().
(function () {
  var LANG = localStorage.getItem('jdgo_lang') || 'pl';

  // Motyw (jasny/ciemny) — zastosuj zapisany jak najwcześniej.
  var THEME = localStorage.getItem('jdgo_theme') || 'light';
  document.documentElement.setAttribute('data-theme', THEME);

  var DICT = {
    // — Nawigacja / layout —
    'Pulpit': 'Dashboard',
    'Ewidencja': 'Records',
    'Przychody': 'Income',
    'Koszty': 'Costs',
    'Faktury': 'Invoices',
    'Kontrahenci': 'Contractors',
    'Analiza': 'Analysis',
    'Zestawienia': 'Reports',
    'Wykresy': 'Charts',
    'Historia zmian': 'Change history',
    'Dziennik zmian danych (operacje, faktury, kontrahenci) — rejestrowany w bazie.':
      'Data change log (operations, invoices, contractors) — recorded in the database.',
    'Brak zarejestrowanych zmian.': 'No recorded changes.',
    'Data i godzina': 'Date and time',
    'Obiekt': 'Object',
    'Typ zmiany': 'Change type',
    'Operacja': 'Operation',
    'Faktura': 'Invoice',
    'Zmieniono': 'Changed',
    'Narzędzia': 'Tools',
    'Import': 'Import',
    'Eksport': 'Export',
    'Szablony': 'Templates',
    'Kursy walut': 'Exchange rates',
    'Średnie kursy NBP (tabela A).': 'NBP mid rates (table A).',
    'Nie udało się pobrać kursów.': 'Failed to fetch rates.',
    'Kurs (PLN)': 'Rate (PLN)',
    'Bieżące kursy': 'Current rates',
    'Pełna tabela NBP': 'Full NBP table',
    'Otwórz wykres': 'Open chart',
    'Przelicznik': 'Converter',
    'Kwota': 'Amount',
    'Data (opcjonalnie)': 'Date (optional)',
    'Przelicz': 'Convert',
    'kurs': 'rate',
    '+ Dodaj szablon': '+ Add template',
    'Powtarzalne przychody/koszty — jednym kliknięciem tworzysz operację z szablonu.':
      'Recurring income/costs — create an operation from a template in one click.',
    'Brak szablonów.': 'No templates.',
    'Nazwa szablonu': 'Template name',
    'Kwota netto': 'Net amount',
    'Użyj': 'Use',
    'Utworzono operację': 'Operation created',
    'Usunąć szablon?': 'Delete template?',
    'Profil': 'Profile',
    'Wyloguj się': 'Log out',
    'Polityka prywatności': 'Privacy policy',
    'Polityka prywatnosci': 'Privacy policy',
    'Szukaj operacji, kontrahentów, faktur…': 'Search operations, contractors, invoices…',
    'Menu': 'Menu',
    'Zamknij': 'Close',
    'Ciemny motyw': 'Dark theme',
    'Jasny motyw': 'Light theme',
    'Operacje': 'Operations',
    'Brak wyników': 'No results',

    // — Strony logowania / rejestracji —
    'Witamy w JDGo!': 'Welcome to JDGo!',
    'Ewidencja przychodów, kosztów i faktur dla JDG': 'Income, cost and invoice records for sole proprietors',
    'Prosty system do prowadzenia działalności — operacje, kontrahenci, faktury i rozliczenia w jednym miejscu.':
      'A simple system to run your business — operations, contractors, invoices and settlements in one place.',
    'Przychody i koszty w jednym miejscu': 'Income and costs in one place',
    'Zestawienia VAT i zaliczka PIT': 'VAT reports and PIT advance',
    'Import CSV i faktur KSeF (XML)': 'CSV import and KSeF invoices (XML)',
    'Bezpieczeństwo: 2FA, szyfrowanie, RODO': 'Security: 2FA, encryption, GDPR',
    'Zaloguj się': 'Log in',
    'Zarejestruj się': 'Sign up',
    'Logowanie': 'Login',
    'Zaloguj się do swojego konta.': 'Log in to your account.',
    'Adres e-mail': 'E-mail address',
    'Hasło': 'Password',
    'Nie masz konta? Zarejestruj się': "Don't have an account? Sign up",
    'Rejestracja': 'Registration',
    'Załóż konto, aby prowadzić ewidencję.': 'Create an account to keep records.',
    'min. 10 znaków': 'min. 10 characters',
    'Zapoznałam/-em się i akceptuję': 'I have read and accept',
    'Politykę prywatności': 'the Privacy policy',
    'Masz już konto? Zaloguj się': 'Already have an account? Log in',
    'Konfiguracja 2FA': '2FA setup',
    'Zeskanuj kod QR aplikacją uwierzytelniającą (np. Google\n        Authenticator), a następnie wpisz wygenerowany kod, aby dokończyć rejestrację.':
      'Scan the QR code with an authenticator app (e.g. Google Authenticator), then enter the generated code to finish registration.',
    'Kod QR do przywiązania aplikacji 2FA': 'QR code to link the 2FA app',
    'Kod z aplikacji': 'Code from the app',
    '6 cyfr': '6 digits',
    'Potwierdź i zakończ': 'Confirm and finish',
    'Gotowe! Możesz się zalogować.': 'Done! You can log in now.',
    'Weryfikacja 2FA': '2FA verification',
    'Wpisz 6-cyfrowy kod z aplikacji uwierzytelniającej.': 'Enter the 6-digit code from your authenticator app.',
    'Kod': 'Code',
    'Potwierdź': 'Confirm',

    // — Profil —
    'Zarządzaj danymi konta i ustawieniami działalności.': 'Manage your account data and business settings.',
    'Konto aktywne': 'Account active',
    'Dane podstawowe': 'Basic details',
    'Nie można zmienić': "Can't be changed",
    'Dane działalności': 'Business details',
    'Ustawienia finansowe': 'Financial settings',
    'Podsumowanie ustawień': 'Settings summary',
    'Kategoria usług (PKD/PKWiU)': 'Service category (PKD/PKWiU)',
    'Stawka VAT': 'VAT rate',
    'Ostatnia aktualizacja:': 'Last update:',
    'Bezpieczeństwo': 'Security',
    'Zmień hasło i zarządzaj bezpieczeństwem konta.': 'Change your password and manage account security.',
    'Uwierzytelnianie dwuetapowe jest aktywne.': 'Two-factor authentication is active.',
    'Uwierzytelnianie dwuetapowe nie jest aktywne.': 'Two-factor authentication is not active.',
    'Ostatnia zmiana hasła': 'Last password change',
    'Poziom bezpieczeństwa': 'Security level',
    'Dobry': 'Good',
    'Podstawowy': 'Basic',
    'Twoje konto jest odpowiednio chronione.': 'Your account is adequately protected.',
    'Włącz 2FA, aby zwiększyć bezpieczeństwo.': 'Enable 2FA to improve security.',
    'Uwierzytelnianie dwuetapowe (2FA):': 'Two-factor authentication (2FA):',
    'włączone.': 'enabled.',
    'wyłączone.': 'disabled.',
    'Włączone': 'Enabled',
    'Wyłączone': 'Disabled',
    'Trwale usuń swoje konto i wszystkie powiązane dane.': 'Permanently delete your account and all associated data.',
    'Dane profilu': 'Profile details',
    'Nazwa wyświetlana': 'Display name',
    'np. Jan Kowalski': 'e.g. John Smith',
    'Kategoria świadczonych usług (PKD/PKWiU)': 'Category of services provided (PKD/PKWiU)',
    'np. 62.01 — programowanie': 'e.g. 62.01 — programming',
    'Domyślna stawka VAT': 'Default VAT rate',
    'zw.': 'exempt',
    'Forma opodatkowania': 'Taxation form',
    'Skala podatkowa (12% / 32%)': 'Tax scale (12% / 32%)',
    'Podatek liniowy (19%)': 'Flat tax (19%)',
    'Domyślna waluta': 'Default currency',
    'Zapisz zmiany': 'Save changes',
    'Stare hasło': 'Old password',
    'Nowe hasło': 'New password',
    'Potwierdź nowe hasło': 'Confirm new password',
    'Konto': 'Account',
    'Pobierz moje dane (RODO)': 'Download my data (RODO)',
    'Usuń konto': 'Delete account',
    'Uwierzytelnianie dwuetapowe (2FA): włączone.': 'Two-factor authentication (2FA): enabled.',
    'Uwierzytelnianie dwuetapowe (2FA): wyłączone.': 'Two-factor authentication (2FA): disabled.',
    'Zapisano.': 'Saved.',
    'Zapisano': 'Saved',
    'Dodano': 'Added',
    'Usunięto': 'Deleted',
    'Nowe hasła nie są takie same': 'New passwords do not match',
    'Hasło zmienione.': 'Password changed.',
    'Nowe hasło nie spełnia wymagań (min. 10 znaków, wielka litera, cyfra, znak specjalny)':
      'New password does not meet the requirements (min. 10 characters, uppercase letter, digit, special character)',
    'Hasło nie spełnia wymagań (min. 10 znaków, wielka litera, cyfra, znak specjalny)':
      'Password does not meet the requirements (min. 10 characters, uppercase letter, digit, special character)',
    'Na pewno trwale usunąć konto i wszystkie dane?': 'Permanently delete the account and all data?',

    // — Siła hasła —
    'Pokaż': 'Show',
    'Ukryj': 'Hide',
    'Min. 10 znaków': 'Min. 10 characters',
    'Wielka litera': 'Uppercase letter',
    'Cyfra': 'Digit',
    'Znak specjalny (! ? * - …)': 'Special character (! ? * - …)',
    'Bardzo słabe': 'Very weak',
    'Słabe': 'Weak',
    'Średnie': 'Medium',
    'Dobre': 'Good',
    'Silne': 'Strong',

    // — Operacje (przychody / koszty) —
    '+ Dodaj przychód': '+ Add income',
    '+ Dodaj koszt': '+ Add cost',
    'Brak przychodów.': 'No income.',
    'Brak kosztów.': 'No costs.',
    'Filtruj w nagłówkach kolumn, sortuj klikając nazwę kolumny.': 'Filter in the column headers, sort by clicking a column name.',
    'Typ': 'Type',
    'Data': 'Date',
    'Kontrahent': 'Contractor',
    'Kategoria': 'Category',
    'Opis': 'Description',
    'Stawka': 'Rate',
    'Waluta': 'Currency',
    'Netto': 'Net',
    'Brutto': 'Gross',
    'Przychód': 'Income',
    'Koszt': 'Cost',
    'Zapisz': 'Save',
    'Anuluj': 'Cancel',
    'Edytuj': 'Edit',
    'Usuń': 'Delete',
    'Usunąć?': 'Delete?',
    'Tak': 'Yes',
    'Nie': 'No',
    'Podaj datę': 'Enter a date',
    'Wyczyść': 'Clear',
    'Wczytywanie…': 'Loading…',
    'Zaznaczono': 'Selected',
    'Usuń zaznaczone': 'Delete selected',
    'Usunąć zaznaczone operacje?': 'Delete selected operations?',
    'Zaznacz wszystkie': 'Select all',
    'Zaznacz wiersze i użyj paska akcji; filtruj i sortuj w nagłówkach kolumn.':
      'Select rows and use the action bar; filter and sort in the column headers.',
    'Edytujesz': 'Editing',
    'Nowe wpisy': 'New entries',
    'Wyczyść filtry': 'Clear filters',
    'filtruj': 'filter',
    'RRRR-MM': 'YYYY-MM',
    'min': 'min',
    '— brak —': '— none —',
    'wszystkie': 'all',

    // — Kontrahenci —
    'Baza kontrahentów — kliknij „Edytuj”, aby zmienić wiersz.': 'Contractor database — click "Edit" to change a row.',
    '+ Dodaj kontrahenta': '+ Add contractor',
    'Brak kontrahentów.': 'No contractors.',
    'Podaj nazwę kontrahenta': 'Enter a contractor name',
    'Nazwa': 'Name',
    'Ulica': 'Street',
    'Kod': 'Postal code',
    'Miasto': 'City',
    'Kraj': 'Country',

    // — Faktury —
    '+ Dodaj fakturę': '+ Add invoice',
    'Brak faktur.': 'No invoices.',
    'Nie udało się wczytać faktur.': 'Failed to load invoices.',
    'Usunąć fakturę?': 'Delete invoice?',
    'Usunąć kontrahenta?': 'Delete contractor?',
    'Rodzaj': 'Type',
    'Status': 'Status',
    'Numer': 'Number',
    'Data wystawienia': 'Issue date',
    'Data sprzedaży': 'Sale date',
    'Termin płatności': 'Payment due date',
    'Uwagi': 'Notes',
    'sprzedaż': 'sale',
    'zakup': 'purchase',
    'Sprzedaż': 'Sale',
    'Zakup': 'Purchase',
    'nieopłacone': 'unpaid',
    'opłacone': 'paid',
    'nieopłacona': 'unpaid',
    'opłacona': 'paid',
    'Pozycje': 'Items',
    '+ Dodaj pozycję': '+ Add item',
    'Ilość': 'Quantity',
    'Cena netto': 'Net price',
    'Podgląd': 'Preview',
    'Kopiuj': 'Copy',
    'Pobierz PDF': 'Download PDF',
    'Wystawca': 'Issuer',
    'Nabywca': 'Buyer',
    'Skopiowano — zapisz jako nową': 'Copied — save as new',
    'Dane do wystawienia faktury w KSeF. Nadawanie numeru i wysyłka pozostają poza zakresem systemu.':
      "Data for issuing an invoice in KSeF. Number assignment and sending remain outside the system's scope.",
    '(bez numeru)': '(no number)',

    // — Zestawienia —
    'Podsumowanie za wybrany okres.': 'Summary for the selected period.',
    'Od': 'From',
    'Do': 'To',
    'Przychody (netto)': 'Income (net)',
    'Koszty (netto)': 'Costs (net)',
    'Wynik (dochód)': 'Result (income)',
    'VAT należny': 'Output VAT',
    'VAT naliczony': 'Input VAT',
    'VAT do zapłaty': 'VAT payable',
    'Zaliczka PIT': 'PIT advance',
    'Zaliczka PIT (uproszczona)': 'PIT advance (simplified)',
    'Sumy wg stawek VAT': 'Totals by VAT rate',
    'Brak operacji w wybranym okresie.': 'No operations in the selected period.',
    'Zaliczka PIT liczona uproszczoną metodą wg formy opodatkowania z profilu.':
      'PIT advance calculated using a simplified method based on the taxation form from the profile.',

    // — Pulpit —
    'Faktury do zapłaty': 'Invoices to pay',
    'Ostatnie operacje': 'Recent operations',
    'Terminy podatkowe': 'Tax deadlines',
    'Wiekowanie należności': 'Receivables aging',
    'Nieprzeterminowane': 'Not overdue',
    '1–30 dni': '1–30 days',
    '31–60 dni': '31–60 days',
    '60+ dni': '60+ days',
    'Brak należności.': 'No receivables.',
    'dni': 'days',
    'Ten miesiąc': 'This month',
    'Poprzedni miesiąc': 'Previous month',
    'Kwartał': 'Quarter',
    'vs poprzedni miesiąc': 'vs previous month',
    'Zobacz wszystkie': 'See all',
    '+ Przychód': '+ Income',
    '+ Koszt': '+ Cost',
    '+ Faktura': '+ Invoice',
    'Brak nieopłaconych faktur.': 'No unpaid invoices.',
    'po terminie': 'overdue',
    'Wszystko opłacone 🎉': 'All paid 🎉',
    'Brak operacji.': 'No operations.',
    'nieopłac. na': 'unpaid, worth',
    'Witaj': 'Hi',
    'Przegląd bieżącego miesiąca': 'Overview of the current month',
    'Przychody i koszty': 'Income and costs',
    'Przychody i koszty —': 'Income and costs —',
    // miesiące (skrót małą literą — pulpit)
    'sty': 'Jan', 'lut': 'Feb', 'mar': 'Mar', 'kwi': 'Apr', 'maj': 'May', 'cze': 'Jun',
    'lip': 'Jul', 'sie': 'Aug', 'wrz': 'Sep', 'paź': 'Oct', 'lis': 'Nov', 'gru': 'Dec',

    // — Eksport —
    'Wygeneruj zestawienie za okres do PDF lub pobierz listę operacji do arkusza (CSV).':
      'Generate a report for the period as a PDF or download the list of operations as a spreadsheet (CSV).',
    'Pobierz PDF (zestawienie)': 'Download PDF (report)',
    'Pobierz CSV (operacje)': 'Download CSV (operations)',
    'Pobierz KPiR (CSV)': 'Download KPiR (CSV)',
    'Rejestr VAT (CSV)': 'VAT register (CSV)',
    'Nr dowodu': 'Document no.',
    'Dokument': 'Document',
    'Przychód (netto)': 'Income (net)',
    'Koszt (netto)': 'Cost (net)',
    'Wybierz okres i pobierz plik.': 'Select a period and download a file.',
    'Podgląd okresu': 'Period preview',
    'Operacje w okresie': 'Operations in the period',
    'Zestawienie przychodów i kosztów': 'Income and costs report',
    'Okres': 'Period',
    'JDGo — wygenerowano': 'JDGo — generated',

    // — Import —
    'Zaimportuj operacje z pliku CSV lub fakturę ze struktury KSeF (XML FA(3)).':
      'Import operations from a CSV file or an invoice from the KSeF structure (XML FA(3)).',
    'Import operacji z CSV': 'Import operations from CSV',
    'Import faktury z KSeF (XML FA(3))': 'Import an invoice from KSeF (XML FA(3))',
    'Pobierz szablon': 'Download template',
    'Zapisz fakturę': 'Save invoice',
    'Pusty plik.': 'Empty file.',
    'Nie znaleziono pozycji w pliku.': 'No items found in the file.',
    'Nie udało się odczytać XML': 'Failed to read the XML',
    'Plik XML jest nieprawidłowy': 'The XML file is invalid',
    'Zaimportowano fakturę': 'Invoice imported',
    'Faktura zaimportowana. Zobacz w zakładce Faktury.': 'Invoice imported. See it in the Invoices tab.',
    'Zaimportowano': 'Imported',
    'poprawnych z': 'valid out of',
    'Pominięto wiersze:': 'Skipped rows:',
    'operacji': 'operations',

    // — Wykresy —
    'Analiza przychodów, kosztów i kontrahentów.': 'Analysis of income, costs and contractors.',
    'Rok': 'Year',
    'Przychody i koszty miesięcznie': 'Monthly income and costs',
    'Wynik (dochód) miesięcznie': 'Monthly result (income)',
    'Struktura przychodów wg kategorii': 'Income structure by category',
    'Struktura kosztów wg kategorii': 'Cost structure by category',
    'Saldo narastające (cały okres)': 'Cumulative balance (entire period)',
    'Top kontrahenci wg obrotu (cały okres)': 'Top contractors by turnover (entire period)',
    'Brak przychodów w tym roku.': 'No income this year.',
    'Brak kosztów w tym roku.': 'No costs this year.',
    'Brak kontrahentów z obrotem.': 'No contractors with turnover.',
    'Nie udało się załadować biblioteki wykresów (Chart.js).': 'Failed to load the chart library (Chart.js).',
    'Wynik': 'Result',
    'Obrót': 'Turnover',
    'Saldo': 'Balance',
    // miesiące (skrót — wykresy)
    'Sty': 'Jan', 'Lut': 'Feb', 'Mar': 'Mar', 'Kwi': 'Apr', 'Maj': 'May', 'Cze': 'Jun',
    'Lip': 'Jul', 'Sie': 'Aug', 'Wrz': 'Sep', 'Paź': 'Oct', 'Lis': 'Nov', 'Gru': 'Dec',
    // miesiące (dopełniacz — pulpit)
    'stycznia': 'January', 'lutego': 'February', 'marca': 'March', 'kwietnia': 'April',
    'maja': 'May', 'czerwca': 'June', 'lipca': 'July', 'sierpnia': 'August',
    'września': 'September', 'października': 'October', 'listopada': 'November', 'grudnia': 'December',

    // — Wspólne komunikaty —
    'Wystapil blad': 'An error occurred',
    'Zmieniono status': 'Status changed',
    'Razem netto': 'Total net',
    'Razem': 'Total'
  };

  window.t = function (pl) {
    if (LANG !== 'en' || pl == null) return pl;
    var key = String(pl).trim();
    return (DICT[key] != null) ? DICT[key] : pl;
  };
  window.I18N = { get lang() { return LANG; } };

  var ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];

  function trStr(s) {
    if (!s) return s;
    var key = s.trim();
    if (!key) return s;
    var en = DICT[key];
    return (en != null) ? s.replace(key, en) : s;
  }

  function trAttrs(node) {
    if (!node || node.nodeType !== 1 || !node.hasAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (node.hasAttribute(a)) {
        var v = node.getAttribute(a), nv = trStr(v);
        if (nv !== v) node.setAttribute(a, nv);
      }
    }
  }

  function trTextNode(tn) {
    var nv = trStr(tn.nodeValue);
    if (nv !== tn.nodeValue) tn.nodeValue = nv;
  }

  function translate(root) {
    if (LANG !== 'en' || !root) return;
    if (root.nodeType === 3) { trTextNode(root); return; }
    if (root.nodeType !== 1) return;
    trAttrs(root);
    var els = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < els.length; i++) trAttrs(els[i]);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = tw.nextNode())) nodes.push(n);
    for (var j = 0; j < nodes.length; j++) trTextNode(nodes[j]);
  }

  function setLang(l) {
    localStorage.setItem('jdgo_lang', l);
    location.reload();
  }
  window.setLang = setLang;

  function injectToggle() {
    var host = document.querySelector('.header-right') || document.querySelector('.app-header') || document.querySelector('.topbar');
    if (!host || host.querySelector('.lang-switch')) return;
    var btn = document.createElement('button');
    btn.className = 'lang-switch';
    btn.type = 'button';
    btn.textContent = (LANG === 'en') ? 'PL' : 'EN';
    btn.title = (LANG === 'en') ? 'Przełącz na polski' : 'Switch to English';
    btn.addEventListener('click', function () { setLang(LANG === 'en' ? 'pl' : 'en'); });
    // W nagłówku aplikacji język ma być na lewo od menu użytkownika.
    if (host.classList.contains('header-right')) host.insertBefore(btn, host.firstChild);
    else host.appendChild(btn);
  }

  function themeSvg(dark) {
    var inner = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
      : '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }
  function injectTheme() {
    var host = document.querySelector('.header-right') || document.querySelector('.topbar');
    if (!host || host.querySelector('.theme-switch')) return;
    var btn = document.createElement('button');
    btn.className = 'theme-switch';
    btn.type = 'button';
    btn.innerHTML = themeSvg(THEME === 'dark');
    btn.title = (THEME === 'dark') ? 'Jasny motyw' : 'Ciemny motyw';
    btn.setAttribute('aria-label', btn.title);
    btn.addEventListener('click', function () {
      THEME = (THEME === 'dark') ? 'light' : 'dark';
      localStorage.setItem('jdgo_theme', THEME);
      document.documentElement.setAttribute('data-theme', THEME);
      btn.innerHTML = themeSvg(THEME === 'dark');
      btn.title = (THEME === 'dark') ? 'Jasny motyw' : 'Ciemny motyw';
      btn.setAttribute('aria-label', btn.title);
    });
    if (host.classList.contains('header-right')) host.insertBefore(btn, host.firstChild);
    else host.appendChild(btn);
  }

  function init() {
    if (document.body && !document.querySelector('.route-progress')) {
      var rp = document.createElement('div'); rp.className = 'route-progress'; document.body.appendChild(rp);
    }
    injectToggle();
    injectTheme();
    if (LANG !== 'en') { setTimeout(function () { injectToggle(); injectTheme(); }, 0); return; }
    document.documentElement.lang = 'en';
    translate(document.body);
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData') { trTextNode(m.target); continue; }
        for (var j = 0; j < m.addedNodes.length; j++) translate(m.addedNodes[j]);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    // nagłówek/sidebar mogą powstać tuż po tym (layout.js) — spróbuj ponownie wstrzyknąć przełączniki
    setTimeout(function () { injectToggle(); injectTheme(); }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
