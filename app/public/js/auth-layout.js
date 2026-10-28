// Układ stron logowania: baner (hero) po lewej + panel z treścią po prawej.
// Opakowuje istniejącą zawartość <main class="page"> bez zmian w logice stron.
(function () {
  const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const FEATS = [
    'Przychody i koszty w jednym miejscu',
    'Zestawienia VAT i zaliczka PIT',
    'Import CSV i faktur KSeF (XML)',
    'Bezpieczeństwo: 2FA, szyfrowanie, RODO'
  ];

  function build() {
    const main = document.querySelector('main.page');
    if (!main || document.querySelector('.auth-split')) return;
    const topbar = document.querySelector('.topbar');
    const footer = document.querySelector('.footer');

    const content = document.createElement('div');
    content.className = 'auth-content';
    while (main.firstChild) content.appendChild(main.firstChild);

    const split = document.createElement('div');
    split.className = 'auth-split';
    split.innerHTML =
      '<aside class="auth-hero"><div class="auth-hero-inner">' +
        '<a class="brand-side" href="/pages/auth.html">JDG<span>o</span></a>' +
        '<h2 class="auth-hero-title">Ewidencja przychodów, kosztów i faktur dla JDG</h2>' +
        '<p class="auth-hero-sub">Prosty system do prowadzenia działalności — operacje, kontrahenci, faktury i rozliczenia w jednym miejscu.</p>' +
        '<ul class="auth-feats">' +
        FEATS.map((f) => '<li>' + CHECK + '<span>' + f + '</span></li>').join('') +
        '</ul>' +
      '</div></aside>' +
      '<section class="auth-panel">' +
        '<div class="auth-panel-top"><div class="header-right"></div></div>' +
        '<div class="auth-panel-body"></div>' +
      '</section>';

    split.querySelector('.auth-panel-body').appendChild(content);
    main.replaceWith(split);
    if (topbar) topbar.remove();
    if (footer) split.querySelector('.auth-panel').appendChild(footer);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
