// Kursy walut NBP — tabela bieżących kursów + przelicznik na PLN. Użycie: initRates().
(function () {
  const T = (s) => (window.t ? window.t(s) : s);
  const fmt = (n, dp) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: dp || 2, maximumFractionDigits: dp || 2 }).format(Number(n) || 0);
  const EXT_IC = '<svg class="ext-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>';
  const tvUrl = (code) => 'https://www.tradingview.com/symbols/' + code + 'PLN/';

  window.initRates = async function () {
    const app = document.getElementById('app');
    app.innerHTML =
      '<h1 class="page-title">Kursy walut</h1>' +
      '<p class="page-sub">Średnie kursy NBP (tabela A).</p>' +
      '<div class="kurs-grid">' +
        '<div class="dash-card"><h2><span class="card-h">Bieżące kursy</span></h2>' +
          '<div id="rtWrap"><div class="loading"><span class="spinner"></span>' + T('Wczytywanie…') + '</div></div>' +
          '<p class="kurs-note"><a class="ext-link-text" href="https://nbp.pl/en/statistic-and-financial-reporting/rates/table-a/" target="_blank" rel="noopener noreferrer">Pełna tabela NBP ' + EXT_IC + '</a></p>' +
        '</div>' +
        '<div class="dash-card"><h2><span class="card-h">Przelicznik</span></h2>' +
          '<div class="op-grid">' +
          '<label>Kwota<input type="number" step="0.01" min="0" id="cvAmount" value="100"></label>' +
          '<label>Waluta<select id="cvCur"><option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option><option>PLN</option></select></label>' +
          '</div>' +
          '<div class="op-actions" style="margin-top:14px"><button class="btn" id="cvGo" style="min-width:auto">Przelicz</button></div>' +
          '<div id="cvResult" class="op-calc"></div>' +
        '</div>' +
      '</div>' +
      '<p id="rtMsg" class="msg"></p>';

    const wrap = document.getElementById('rtWrap');
    const msg = document.getElementById('rtMsg');

    try {
      const rows = await api('/rates/table');
      const body = rows.map((r) =>
        '<tr><td>' + r.code + '</td><td class="num">' + (r.rate != null ? fmt(r.rate, 4) : '—') + '</td>' +
        '<td>' + (r.rate_date || '—') + '</td>' +
        '<td class="num"><a class="ext-link" href="' + tvUrl(r.code) + '" target="_blank" rel="noopener noreferrer" title="' + T('Otwórz wykres') + ' (TradingView)">' + EXT_IC + '</a></td></tr>').join('');
      wrap.innerHTML = '<table class="data-table"><thead><tr>' +
        '<th>Waluta</th><th class="num">Kurs (PLN)</th><th>Data</th><th></th></tr></thead><tbody>' + body + '</tbody></table>';
    } catch (e) { wrap.innerHTML = '<div class="table-empty">Nie udało się pobrać kursów.</div>'; }

    document.getElementById('cvGo').addEventListener('click', async () => {
      msg.className = 'msg';
      const out = document.getElementById('cvResult');
      const amount = Number(document.getElementById('cvAmount').value) || 0;
      const cur = document.getElementById('cvCur').value;
      try {
        const r = await api('/rates?currency=' + cur);
        const pln = Math.round(amount * r.rate * 100) / 100;
        out.innerHTML = fmt(amount) + ' ' + cur + ' = <b>' + fmt(pln) + ' PLN</b>' +
          (cur !== 'PLN' ? ' <span class="dash-sub">· ' + T('kurs') + ' ' + fmt(r.rate, 4) + ' · ' + r.rate_date + '</span>' : '');
      } catch (e) { out.textContent = ''; msg.textContent = e.message; }
    });
  };
})();
