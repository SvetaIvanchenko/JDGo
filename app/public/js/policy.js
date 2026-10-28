// Modalne okno z polityka prywatnosci. Doaczane na kazdej stronie.
// Dowolny element z klasa "js-policy" otwiera modal po kliknieciu.
(function () {
  const POLICY_HTML = `
    <h2>Polityka prywatności i informacja RODO — JDGo</h2>
    <p class="note"><strong>Uwaga:</strong> JDGo jest projektem o charakterze edukacyjnym,
      stworzonym w ramach pracy dyplomowej w Akademii Finansów i Biznesu Vistula.
      Aplikacja nie prowadzi działalności komercyjnej ani nie czerpie z tego tytułu
      żadnych korzyści. Niniejsza polityka ma charakter wyłącznie informacyjny (poglądowy).</p>

    <h3>1. Postanowienia ogólne</h3>
    <p>JDGo to aplikacja webowa wspomagająca prowadzenie ewidencji przychodów, kosztów
      i faktur w jednoosobowej działalności gospodarczej. Administratorem danych jest
      <strong>Svitlana Ivanchenko</strong>, Akademia Finansów i Biznesu Vistula.
      W razie pytań prosimy o kontakt: <strong>svsivanchenko@gmail.com</strong>.</p>

    <h3>2. Jakie dane przetwarzamy</h3>
    <p>Przetwarzane są wyłącznie dane niezbędne do świadczenia usługi (zasada
      minimalizacji danych, art. 5 ust. 1 lit. c RODO):</p>
    <ul>
      <li>dane konta: adres e-mail, hasło (przechowywane wyłącznie w postaci skrótu),
        sekret dwuetapowego uwierzytelniania (2FA), informacja i data akceptacji zgody;</li>
      <li>dane ewidencji wprowadzane przez użytkownika: przychody, koszty, faktury
        (kwoty, stawki VAT, opis, kategoria, waluta) oraz dane kontrahentów (nazwa, NIP, adres);</li>
      <li>dane techniczne: niezbędne pliki cookie sesji oraz adres IP i informacje
        o przeglądarce na potrzeby bezpieczeństwa.</li>
    </ul>
    <p>Aplikacja nie zbiera danych w celach marketingowych, nie profiluje użytkowników
      i nie podejmuje wobec nich zautomatyzowanych decyzji.</p>

    <h3>3. Cele i podstawy prawne przetwarzania</h3>
    <ul>
      <li><strong>Założenie i prowadzenie konta oraz świadczenie usługi</strong> —
        art. 6 ust. 1 lit. b RODO (niezbędność do wykonania umowy);</li>
      <li><strong>Uwierzytelnianie i zabezpieczenie konta</strong> (hasło, 2FA, dane sesji)
        — art. 6 ust. 1 lit. f RODO (prawnie uzasadniony interes — bezpieczeństwo);</li>
      <li><strong>Potwierdzenie akceptacji regulaminu i polityki prywatności</strong> —
        art. 6 ust. 1 lit. a oraz art. 7 RODO (zgoda i jej rozliczalność).</li>
    </ul>

    <h3>4. Okres przechowywania danych</h3>
    <p>Dane są przechowywane przez okres posiadania konta. Użytkownik może w każdej
      chwili trwale usunąć konto wraz ze wszystkimi powiązanymi danymi (art. 17 RODO).
      Usunięcie jest nieodwracalne.</p>

    <h3>5. Odbiorcy danych</h3>
    <p>Dane nie są udostępniane podmiotom trzecim w celach komercyjnych ani przekazywane
      poza Europejski Obszar Gospodarczy.</p>

    <h3>6. Prawa użytkownika</h3>
    <p>Użytkownikowi przysługują prawa: dostępu do danych (art. 15), sprostowania
      (art. 16), usunięcia (art. 17), ograniczenia przetwarzania (art. 18), przenoszenia
      danych (art. 20), sprzeciwu (art. 21) oraz cofnięcia zgody (art. 7 ust. 3).
      Przysługuje również prawo wniesienia skargi do Prezesa Urzędu Ochrony Danych
      Osobowych (PUODO), ul. Stawki 2, 00-193 Warszawa.</p>

    <h3>7. Bezpieczeństwo danych</h3>
    <p>Stosowane są środki odpowiednie do ryzyka (art. 32 RODO): hasła w postaci skrótów,
      dwuetapowe uwierzytelnianie, zabezpieczenie sekretu 2FA, połączenie szyfrowane
      (HTTPS/TLS), ciasteczka z atrybutami httpOnly, Secure i SameSite, izolacja danych
      użytkowników na poziomie bazy oraz ograniczanie prób logowania.</p>

    <h3>8. Pliki cookie</h3>
    <p>Aplikacja wykorzystuje wyłącznie niezbędne pliki cookie służące do utrzymania
      sesji zalogowanego użytkownika. Nie używa cookies analitycznych ani reklamowych.</p>

    <h3>9. Zgody</h3>
    <p>Podczas rejestracji użytkownik potwierdza zapoznanie się z regulaminem oraz
      polityką prywatności. Akceptacja jest dobrowolna, lecz niezbędna do założenia konta.
      Fakt i data zgody są zapisywane (zasada rozliczalności, art. 7 RODO).</p>

    <h3>10. Kontakt</h3>
    <p>W razie pytań prosimy o kontakt: <strong>svsivanchenko@gmail.com</strong>.</p>
  `;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal" role="dialog" aria-modal="true" aria-label="Polityka prywatnosci">' +
      '<button class="modal-close" aria-label="Zamknij">&times;</button>' +
      '<div class="modal-body">' + POLICY_HTML + '</div>' +
    '</div>';

  function ready() {
    document.body.appendChild(overlay);
    const open = () => { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; };
    const close = () => { overlay.classList.remove('open'); document.body.style.overflow = ''; };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.modal-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    document.addEventListener('click', (e) => {
      const link = e.target.closest('.js-policy');
      if (link) { e.preventDefault(); open(); }
    });

    window.openPolicy = open;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
