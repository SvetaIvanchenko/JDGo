// Zestawienie za okres (WF-15, WF-22). Użycie: initReports().
(function () {
  const money = (v, cur) => new Intl.NumberFormat('pl-PL',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0) + (cur ? ' ' + cur : ' zł');
  const vatLabel = (code) => (code === 'zw' ? 'zw.' : code + '%');
  const typeLabel = (t) => (t === 'przychod' ? 'Przychód' : 'Koszt');
  let zusCfg = { scheme: 'pelny', chorobowe: true, form: 'skala' };

  function monthRange() {
    const d = new Date();
    const from = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
    const to = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0));
    const f = (x) => x.toISOString().slice(0, 10);
    return [f(from), f(to)];
  }

  // Szybkie zakresy dat.
  const presetsHtml = () =>
    '<div class="period-presets">' +
    '<button type="button" class="chip" data-p="month">Ten miesiąc</button>' +
    '<button type="button" class="chip" data-p="prev">Poprzedni miesiąc</button>' +
    '<button type="button" class="chip" data-p="quarter">Kwartał</button>' +
    '<button type="button" class="chip" data-p="year">Rok</button>' +
    '</div>';
  function presetRange(kind) {
    const d = new Date(), y = d.getUTCFullYear(), m = d.getUTCMonth();
    const f = (x) => x.toISOString().slice(0, 10);
    if (kind === 'prev') return [f(new Date(Date.UTC(y, m - 1, 1))), f(new Date(Date.UTC(y, m, 0)))];
    if (kind === 'quarter') { const q = Math.floor(m / 3); return [f(new Date(Date.UTC(y, q * 3, 1))), f(new Date(Date.UTC(y, q * 3 + 3, 0)))]; }
    if (kind === 'year') return [f(new Date(Date.UTC(y, 0, 1))), f(new Date(Date.UTC(y, 11, 31)))];
    return [f(new Date(Date.UTC(y, m, 1))), f(new Date(Date.UTC(y, m + 1, 0)))];
  }

  window.initReports = async function () {
    const [df, dt] = monthRange();
    const app = document.getElementById('app');
    app.innerHTML =
      '<h1 class="page-title">Zestawienia</h1>' +
      '<p class="page-sub">Podsumowanie za wybrany okres.</p>' +
      '<div class="filters">' +
      '<label>Od <input type="date" id="rFrom" value="' + df + '"></label>' +
      '<label>Do <input type="date" id="rTo" value="' + dt + '"></label>' +
      '<button class="btn" id="rShow" style="min-width:auto">Pokaż</button>' +
      '</div>' + presetsHtml() +
      '<div id="rResult"></div><p id="rMsg" class="msg"></p>';

    const out = document.getElementById('rResult');
    const msg = document.getElementById('rMsg');

    function render(s) {
      const cards =
        '<div class="metrics">' +
        '<div class="metric"><div class="label">Przychody (netto)</div><div class="value">' + money(s.income.net) + '</div></div>' +
        '<div class="metric"><div class="label">Koszty (netto)</div><div class="value">' + money(s.cost.net) + '</div></div>' +
        '<div class="metric"><div class="label">Wynik (dochód)</div><div class="value">' + money(s.wynik_net) + '</div></div>' +
        '</div><div class="metrics">' +
        '<div class="metric"><div class="label">VAT należny</div><div class="value">' + money(s.vat.vat_nalezny) + '</div></div>' +
        '<div class="metric"><div class="label">VAT naliczony</div><div class="value">' + money(s.vat.vat_naliczony) + '</div></div>' +
        '<div class="metric"><div class="label">VAT do zapłaty</div><div class="value">' + money(s.vat.do_zaplaty) + '</div></div>' +
        '<div class="metric"><div class="label">Zaliczka PIT</div><div class="value">' + money(s.pit) + '</div></div>' +
        '</div>' +
        (function () {
          const fv = document.getElementById('rFrom').value, tv = document.getElementById('rTo').value;
          let months = 1;
          if (fv && tv) { const a = new Date(fv), b = new Date(tv); months = Math.max(1, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1); }
          const revenue = (Number(s.income.net) / months) * 12;
          const z = window.ZUS.monthly({ scheme: zusCfg.scheme, chorobowe: zusCfg.chorobowe, form: zusCfg.form, income: Number(s.wynik_net) / months, revenue: revenue });
          const zusPeriod = z.configured ? z.total * months : 0;
          const pit = Number(s.pit);
          const naReke = Number(s.wynik_net) - pit - zusPeriod;
          const baseTot = Math.max(Number(s.wynik_net), 0.01);
          const w = (v) => Math.max(0, Math.min(100, v / baseTot * 100));
          const seg = (cls, v) => v > 0 ? '<div class="seg ' + cls + '" style="width:' + w(v) + '%"></div>' : '';
          const bar = Number(s.wynik_net) > 0 ? '<div class="net-bar">' + seg('zus', zusPeriod) + seg('pit', pit) + seg('net', naReke) + '</div>' : '';
          const zusCard = z.configured ? '<div class="metric"><div class="label">Składki ZUS (' + months + ' mies.)</div><div class="value">' + money(zusPeriod) + '</div></div>' : '';
          return '<div class="metrics">' + zusCard +
            '<div class="metric"><div class="label">Na rękę (szac.)</div><div class="value">' + money(naReke) + '</div></div></div>' +
            '<div class="net-take">' + bar +
              '<div class="net-legend">' +
                (z.configured ? '<span><i class="dot zus"></i>Składki ZUS · ' + money(zusPeriod) + '</span>' : '') +
                '<span><i class="dot pit"></i>Zaliczka PIT · ' + money(pit) + '</span>' +
                '<span><i class="dot net"></i>Na rękę · ' + money(naReke) + '</span>' +
              '</div>' +
              '<p class="page-sub" style="margin-top:8px">Szacunek: dochód − zaliczka PIT − składki ZUS. VAT pominięty (neutralny — pobierany od klienta i odprowadzany do US).</p>' +
            '</div>';
        })();

      let table;
      if (!s.byRate.length) {
        table = '<div class="table-empty">Brak operacji w wybranym okresie.</div>';
      } else {
        const rows = s.byRate.map((r) =>
          '<tr><td>' + typeLabel(r.type) + '</td><td>' + vatLabel(r.vat_code) + '</td>' +
          '<td class="num">' + money(r.net, '') + '</td><td class="num">' + money(r.vat, '') + '</td>' +
          '<td class="num">' + money(r.gross, '') + '</td></tr>').join('');
        table = '<div class="form-title">Sumy wg stawek VAT</div><div class="table-wrap">' +
          '<table class="data-table"><thead><tr><th>Rodzaj</th><th>Stawka</th>' +
          '<th class="num">Netto</th><th class="num">VAT</th><th class="num">Brutto</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table></div>';
      }
      out.innerHTML = cards + table +
        '<p class="page-sub" style="margin-top:14px">Zaliczka PIT liczona uproszczoną metodą wg formy opodatkowania z profilu.</p>';
    }

    async function load() {
      msg.className = 'msg';
      const from = document.getElementById('rFrom').value;
      const to = document.getElementById('rTo').value;
      try {
        const s = await api('/reports/summary?from=' + from + '&to=' + to);
        render(s);
      } catch (err) { msg.textContent = err.message; }
    }

    try {
      const p = await api('/profile');
      zusCfg = { scheme: p.zus_scheme || 'pelny', chorobowe: !!p.zus_chorobowe, form: p.tax_form || 'skala' };
    } catch (e) { /* zostaje domyślny */ }

    document.getElementById('rShow').addEventListener('click', load);
    document.querySelectorAll('.period-presets .chip').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.period-presets .chip').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      const [f, t] = presetRange(b.dataset.p);
      document.getElementById('rFrom').value = f; document.getElementById('rTo').value = t; load();
    }));
    load();
  };
})();
