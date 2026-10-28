// Eksport zestawień do PDF (WF-R3) oraz operacji do CSV. Użycie: initExport().
// PDF generowany po stronie klienta (pdfmake — czcionka Roboto obsługuje polskie znaki).
(function () {
  const T = (s) => (window.t ? window.t(s) : s);
  const money = (v, cur) => new Intl.NumberFormat('pl-PL',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0) + (cur ? ' ' + cur : ' zł');
  const typeLabel = (t) => (t === 'przychod' ? T('Przychód') : T('Koszt'));
  const vatLabel = (code) => (code === 'zw' ? T('zw.') : code + '%');

  function monthRange() {
    const d = new Date();
    const from = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1));
    const to = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0));
    const f = (x) => x.toISOString().slice(0, 10);
    return [f(from), f(to)];
  }
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

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // --- CSV operacji (średnik + przecinek dziesiętny + BOM → zgodne z Excel PL) ---
  function toCsv(rows) {
    const head = ['Data', 'Rodzaj', 'Kontrahent', 'Kategoria', 'Opis', 'Stawka', 'Waluta', 'Netto', 'VAT', 'Brutto'].map(T);
    const cell = (v) => {
      let s = v == null ? '' : String(v);
      if (/[";\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const num = (v) => Number(v || 0).toFixed(2).replace('.', ',');
    const lines = [head.join(';')];
    rows.forEach((r) => lines.push([
      r.operation_date, typeLabel(r.type), r.contractor_name || '', r.category || '', r.description || '',
      vatLabel(r.vat_code), r.currency, num(r.amount_net), num(r.amount_vat), num(r.amount_gross)
    ].map(cell).join(';')));
    return '﻿' + lines.join('\r\n');
  }

  // --- Uniwersalny CSV (średnik + BOM) ---
  const csvNum = (v) => Number(v || 0).toFixed(2).replace('.', ',');
  function makeCsv(head, rows) {
    const cell = (v) => { let s = v == null ? '' : String(v); if (/[";\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'; return s; };
    const lines = [head.map(cell).join(';')];
    rows.forEach((r) => lines.push(r.map(cell).join(';')));
    return '﻿' + lines.join('\r\n');
  }

  // --- PDF zestawienia (pdfmake) ---
  function buildPdf(s, from, to) {
    const th = (t, right) => ({ text: t, style: 'th', alignment: right ? 'right' : 'left' });
    const money0 = (v) => money(v, '');

    const rateBody = [[th(T('Rodzaj')), th(T('Stawka')), th(T('Netto'), 1), th(T('VAT'), 1), th(T('Brutto'), 1)]];
    if (s.byRate.length) {
      s.byRate.forEach((r) => rateBody.push([
        typeLabel(r.type), vatLabel(r.vat_code),
        { text: money0(r.net), alignment: 'right' },
        { text: money0(r.vat), alignment: 'right' },
        { text: money0(r.gross), alignment: 'right' }
      ]));
    }

    const dd = {
      pageMargins: [40, 50, 40, 40],
      content: [
        { text: T('Zestawienie przychodów i kosztów'), style: 'h1' },
        { text: T('Okres') + ': ' + from + ' – ' + to, margin: [0, 0, 0, 14], color: '#555' },
        {
          table: {
            widths: ['*', 'auto'],
            body: [
              [T('Przychody (netto)'), { text: money0(s.income.net), alignment: 'right' }],
              [T('Koszty (netto)'), { text: money0(s.cost.net), alignment: 'right' }],
              [{ text: T('Wynik (dochód)'), bold: true }, { text: money0(s.wynik_net), alignment: 'right', bold: true }],
              [T('VAT należny'), { text: money0(s.vat.vat_nalezny), alignment: 'right' }],
              [T('VAT naliczony'), { text: money0(s.vat.vat_naliczony), alignment: 'right' }],
              [T('VAT do zapłaty'), { text: money0(s.vat.do_zaplaty), alignment: 'right' }],
              [T('Zaliczka PIT (uproszczona)'), { text: money0(s.pit), alignment: 'right' }]
            ]
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 18]
        },
        { text: T('Sumy wg stawek VAT'), style: 'h2' },
        s.byRate.length
          ? { table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto'], body: rateBody }, layout: 'lightHorizontalLines' }
          : { text: T('Brak operacji w wybranym okresie.'), italics: true, color: '#777' },
        { text: T('JDGo — wygenerowano') + ' ' + new Date().toLocaleString('pl-PL'), style: 'foot', margin: [0, 24, 0, 0] }
      ],
      styles: {
        h1: { fontSize: 16, bold: true, color: '#15803d', margin: [0, 0, 0, 4] },
        h2: { fontSize: 12, bold: true, margin: [0, 0, 0, 6] },
        th: { bold: true, color: '#15803d' },
        foot: { fontSize: 8, color: '#999' }
      },
      defaultStyle: { fontSize: 10 }
    };
    pdfMake.createPdf(dd).download('zestawienie_' + from + '_' + to + '.pdf');
  }

  window.initExport = function () {
    const [df, dt] = monthRange();
    const app = document.getElementById('app');
    app.innerHTML =
      '<h1 class="page-title">Eksport</h1>' +
      '<p class="page-sub">Wygeneruj zestawienie za okres do PDF lub pobierz listę operacji do arkusza (CSV).</p>' +
      '<div class="filters">' +
      '<label>Od <input type="date" id="eFrom" value="' + df + '"></label>' +
      '<label>Do <input type="date" id="eTo" value="' + dt + '"></label>' +
      '</div>' + presetsHtml() +
      '<div class="quick-actions">' +
      '<button class="btn" id="btnPdf">Pobierz PDF (zestawienie)</button>' +
      '<button class="btn btn-outline" id="btnCsv">Pobierz CSV (operacje)</button>' +
      '<button class="btn btn-outline" id="btnKpir">Pobierz KPiR (CSV)</button>' +
      '<button class="btn btn-outline" id="btnVat">Rejestr VAT (CSV)</button>' +
      '</div>' +
      '<div class="dash-card" id="preview" style="max-width:520px"><div class="dash-empty">Wybierz okres i pobierz plik.</div></div>' +
      '<p id="eMsg" class="msg"></p>';

    const msg = document.getElementById('eMsg');
    const preview = document.getElementById('preview');
    const range = () => [document.getElementById('eFrom').value, document.getElementById('eTo').value];
    const err = (m) => { msg.className = 'msg err'; msg.textContent = m; };
    const clear = () => { msg.className = 'msg'; msg.textContent = ''; };

    async function refreshPreview() {
      clear();
      const [from, to] = range();
      try {
        const [s, ops] = await Promise.all([
          api('/reports/summary?from=' + from + '&to=' + to),
          api('/reports/period-operations?from=' + from + '&to=' + to)
        ]);
        preview.innerHTML =
          '<h2>Podgląd okresu</h2>' +
          '<ul class="dash-list">' +
          '<li>Operacje w okresie <span class="dash-amount">' + ops.rows.length + '</span></li>' +
          '<li>Przychody (netto) <span class="dash-amount pos">' + money(s.income.net) + '</span></li>' +
          '<li>Koszty (netto) <span class="dash-amount neg">' + money(s.cost.net) + '</span></li>' +
          '<li>Wynik (dochód) <span class="dash-amount">' + money(s.wynik_net) + '</span></li>' +
          '<li>VAT do zapłaty <span class="dash-amount">' + money(s.vat.do_zaplaty) + '</span></li>' +
          '</ul>';
        return { s, ops };
      } catch (e) { err(e.message); return null; }
    }

    document.getElementById('btnPdf').addEventListener('click', async () => {
      clear();
      const [from, to] = range();
      try {
        const s = await api('/reports/summary?from=' + from + '&to=' + to);
        buildPdf(s, from, to);
      } catch (e) { err(e.message); }
    });

    document.getElementById('btnCsv').addEventListener('click', async () => {
      clear();
      const [from, to] = range();
      try {
        const d = await api('/reports/period-operations?from=' + from + '&to=' + to);
        if (!d.rows.length) { err('Brak operacji w wybranym okresie.'); return; }
        download('operacje_' + from + '_' + to + '.csv', toCsv(d.rows), 'text/csv;charset=utf-8');
      } catch (e) { err(e.message); }
    });

    // KPiR (CSV)
    document.getElementById('btnKpir').addEventListener('click', async () => {
      clear();
      const [from, to] = range();
      try {
        const d = await api('/reports/kpir?from=' + from + '&to=' + to);
        if (!d.rows.length) { err('Brak operacji w wybranym okresie.'); return; }
        const head = ['Lp', 'Data', 'Nr dowodu', 'Kontrahent', 'Opis', 'Przychód (netto)', 'Koszt (netto)'].map(T);
        const rows = d.rows.map((r) => [r.lp, r.data, r.nr_dowodu, r.kontrahent, r.opis, csvNum(r.przychod), csvNum(r.koszt)]);
        rows.push(['', '', '', '', T('Razem'), csvNum(d.sum_przychod), csvNum(d.sum_koszt)]);
        download('kpir_' + from + '_' + to + '.csv', makeCsv(head, rows), 'text/csv;charset=utf-8');
      } catch (e) { err(e.message); }
    });

    // Rejestr VAT (CSV) — sprzedaż + zakup
    document.getElementById('btnVat').addEventListener('click', async () => {
      clear();
      const [from, to] = range();
      try {
        const d = await api('/reports/vat-register?from=' + from + '&to=' + to);
        if (!d.sales.length && !d.purchases.length) { err('Brak operacji w wybranym okresie.'); return; }
        const head = ['Rodzaj', 'Data', 'Dokument', 'Kontrahent', 'NIP', 'Stawka', 'Netto', 'VAT', 'Brutto'].map(T);
        const line = (kind, r) => [T(kind), r.data, r.dokument, r.kontrahent, r.nip, vatLabel(r.stawka), csvNum(r.netto), csvNum(r.vat), csvNum(r.brutto)];
        const rows = d.sales.map((r) => line('Sprzedaż', r)).concat(d.purchases.map((r) => line('Zakup', r)));
        download('rejestr_vat_' + from + '_' + to + '.csv', makeCsv(head, rows), 'text/csv;charset=utf-8');
      } catch (e) { err(e.message); }
    });

    document.getElementById('eFrom').addEventListener('change', refreshPreview);
    document.getElementById('eTo').addEventListener('change', refreshPreview);
    document.querySelectorAll('.period-presets .chip').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('.period-presets .chip').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      const [f, t] = presetRange(b.dataset.p);
      document.getElementById('eFrom').value = f; document.getElementById('eTo').value = t; refreshPreview();
    }));
    refreshPreview();
  };
})();
