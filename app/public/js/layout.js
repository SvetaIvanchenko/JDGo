// Wspolny layout stron wewnetrznych: ciemny sidebar (logo + ikony) + naglowek z wyszukiwarka
// i menu uzytkownika. Strona umieszcza tresc w <div id="app">, a ten skrypt buduje szkielet.
// Wymaga wczesniej zaladowanego api.js oraz policy.js.
(function () {
  // Ikony Lucide (MIT) — wstawiane inline jako SVG, bez zewnetrznych zaleznosci.
  const ICONS = {
    home: '<path d="M12.35 21H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v2.35"/><path d="M14.8 12.4A1 1 0 0 0 14 12h-4a1 1 0 0 0-1 1v8"/><path d="M15 18h6"/><path d="M18 15v6"/>',
    records: '<path d="M12 12h.01"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M22 13a18.15 18.15 0 0 1-20 0"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    analytics: '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
    tools: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
    search: '<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    user: '<path d="m14.305 19.53.923-.382"/><path d="m15.228 16.852-.923-.383"/><path d="m16.852 15.228-.383-.923"/><path d="m16.852 20.772-.383.924"/><path d="m19.148 15.228.383-.923"/><path d="m19.53 21.696-.382-.924"/><path d="M2 21a8 8 0 0 1 10.434-7.62"/><path d="m20.772 16.852.924-.383"/><path d="m20.772 19.148.924.383"/><circle cx="10" cy="8" r="5"/><circle cx="18" cy="18" r="3"/>',
    logout: '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>'
  };
  const ic = (name, cls) => '<svg class="' + (cls || 'nav-ic') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';

  const MENU = [
    { label: 'Pulpit', href: '/', icon: 'home' },
    { label: 'Ewidencja', icon: 'records', children: [
      { label: 'Przychody',   href: '/pages/przychody.html' },
      { label: 'Koszty',      href: '/pages/koszty.html' },
      { label: 'Faktury',     href: '/pages/faktury.html' },
      { label: 'Kontrahenci', href: '/pages/kontrahenci.html' },
    ]},
    { label: 'Analiza', icon: 'analytics', children: [
      { label: 'Zestawienia', href: '/pages/zestawienia.html' },
      { label: 'Wykresy',     href: '/pages/wykresy.html' },
      { label: 'Historia zmian', href: '/pages/historia.html' },
    ]},
    { label: 'Narzędzia', icon: 'tools', children: [
      { label: 'Szablony', href: '/pages/szablony.html' },
      { label: 'Kursy walut', href: '/pages/kursy.html' },
      { label: 'Import', href: '/pages/import.html' },
      { label: 'Eksport', href: '/pages/eksport.html' },
    ]},
  ];

  const norm = (p) => (p === '/index.html' ? '/' : p);
  const current = norm(location.pathname);

  function build() {
    const app = document.getElementById('app');
    if (!app) return;

    // ——— Sidebar (ciemny, pełna wysokość) ———
    const aside = document.createElement('aside');
    aside.className = 'sidebar';

    let html = '<a class="brand-side" href="/">JDG<span>o</span></a><ul class="nav">';
    MENU.forEach((item) => {
      if (item.children) {
        const open = item.children.some((c) => norm(c.href) === current);
        html += '<li class="nav-group' + (open ? ' open' : '') + '">';
        html += '<button class="nav-group-btn" type="button">' + ic(item.icon) + '<span>' + item.label + '</span>' +
                '<span class="chev">&#9662;</span></button><ul class="nav-sub">';
        item.children.forEach((c) => {
          const act = norm(c.href) === current ? ' class="active"' : '';
          html += '<li><a' + act + ' href="' + c.href + '">' + c.label + '</a></li>';
        });
        html += '</ul></li>';
      } else {
        const act = norm(item.href) === current ? ' active' : '';
        html += '<li><a class="nav-link' + act + '" href="' + item.href + '">' + ic(item.icon) + '<span>' + item.label + '</span></a></li>';
      }
    });
    html += '</ul>';
    html += '<div class="sidebar-bottom"><span class="policy js-policy">' + ic('shield') + '<span>Polityka prywatności</span></span></div>';
    aside.innerHTML = html;

    // ——— Nagłówek (w kolumnie treści) ———
    const header = document.createElement('header');
    header.className = 'app-header';
    header.innerHTML =
      '<button class="nav-toggle" id="navToggle" aria-label="Menu">&#9776;</button>' +
      '<div class="global-search-wrap">' +
      ic('search', 'search-ic') +
      '<input id="globalSearch" class="global-search" placeholder="Szukaj operacji, kontrahentów, faktur…" autocomplete="off">' +
      '<div id="searchDropdown" class="search-dd"></div></div>' +
      '<div class="header-right">' +
      '<div class="user-menu"><button class="user-btn" id="userBtn" type="button">' +
      '<span class="user-name" id="userName">…</span><span class="chev">&#9662;</span></button>' +
      '<div class="user-dd" id="userDd">' +
      '<a href="/pages/profile.html">' + ic('user', 'dd-ic') + 'Profil</a>' +
      '<button type="button" id="userLogout">' + ic('logout', 'dd-ic') + 'Wyloguj się</button>' +
      '</div></div></div>';

    const overlay = document.createElement('div'); overlay.className = 'nav-overlay';
    const main = document.createElement('main'); main.className = 'content';
    main.appendChild(app);

    document.body.prepend(main);
    document.body.prepend(overlay);
    document.body.prepend(header);
    document.body.prepend(aside);

    // rozwijanie grup (akordeon)
    aside.querySelectorAll('.nav-group-btn').forEach((btn) => {
      btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
    });

    // menu mobilne (gamburger + nakladka)
    const toggle = () => { aside.classList.toggle('open'); overlay.classList.toggle('show'); };
    header.querySelector('#navToggle').addEventListener('click', toggle);
    overlay.addEventListener('click', toggle);
    aside.querySelectorAll('a').forEach((a) =>
      a.addEventListener('click', () => { if (aside.classList.contains('open')) toggle(); }));

    // menu użytkownika (rozwijane)
    const userBtn = header.querySelector('#userBtn');
    const userDd = header.querySelector('#userDd');
    userBtn.addEventListener('click', (e) => { e.stopPropagation(); userDd.classList.toggle('open'); });
    document.addEventListener('click', (e) => { if (!header.querySelector('.user-menu').contains(e.target)) userDd.classList.remove('open'); });
    header.querySelector('#userLogout').addEventListener('click', async () => {
      try { await api('/auth/logout', 'POST'); } catch (e) { /* ignore */ }
      location.href = '/pages/auth.html';
    });

    // globalne wyszukiwanie (styl Jira/Confluence)
    (function setupSearch() {
      const input = header.querySelector('#globalSearch');
      const dd = header.querySelector('#searchDropdown');
      const wrap = header.querySelector('.global-search-wrap');
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const money = (v, cur) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0) + ' ' + (cur || 'PLN');
      const opHref = (o) => (o.type === 'przychod' ? '/pages/przychody.html' : '/pages/koszty.html') + '?highlight=' + o.id;
      let h;

      function render(data) {
        const g = [];
        if (data.operations.length) g.push('<div class="sd-group">Operacje</div>' + data.operations.map((o) =>
          '<a class="sd-item" href="' + opHref(o) + '"><span class="sd-title">' + esc(o.description || o.category || '(operacja)') +
          '</span><span class="sd-sub">' + (o.type === 'przychod' ? 'Przychód' : 'Koszt') + ' · ' + o.date + ' · ' + money(o.amount_gross, o.currency) + '</span></a>').join(''));
        if (data.contractors.length) g.push('<div class="sd-group">Kontrahenci</div>' + data.contractors.map((c) =>
          '<a class="sd-item" href="/pages/kontrahenci.html?highlight=' + c.id + '"><span class="sd-title">' + esc(c.name) +
          '</span><span class="sd-sub">' + esc([c.nip, c.city].filter(Boolean).join(' · ')) + '</span></a>').join(''));
        if (data.invoices.length) g.push('<div class="sd-group">Faktury</div>' + data.invoices.map((i) =>
          '<a class="sd-item" href="/pages/faktury.html?highlight=' + i.id + '"><span class="sd-title">' + esc(i.invoice_number || '(bez numeru)') +
          '</span><span class="sd-sub">' + esc(i.contractor_name || '—') + ' · ' + money(i.total_gross, i.currency) + '</span></a>').join(''));
        dd.innerHTML = g.length ? g.join('') : '<div class="sd-empty">Brak wyników</div>';
        dd.classList.add('open');
      }
      async function run() {
        const q = input.value.trim();
        if (q.length < 2) { dd.classList.remove('open'); return; }
        try { render(await api('/search?q=' + encodeURIComponent(q))); } catch (e) { dd.classList.remove('open'); }
      }
      input.addEventListener('input', () => { clearTimeout(h); h = setTimeout(run, 250); });
      input.addEventListener('focus', () => { if (input.value.trim().length >= 2) run(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') dd.classList.remove('open'); });
      document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) dd.classList.remove('open'); });
    })();

    // ochrona: strona dostepna tylko po zalogowaniu; przy okazji nazwa uzytkownika w menu
    api('/profile')
      .then((p) => { header.querySelector('#userName').textContent = p.display_name || p.email || 'Konto'; })
      .catch(() => { location.href = '/pages/auth.html'; });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
