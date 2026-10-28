// Ewidencja faktur (WF-10, WF-19): lista z filtrem, formularz z pozycjami, podgląd. Użycie: initInvoices().
(function () {
  const VAT_OPTIONS = [
    { id: 1, label: '23%' }, { id: 2, label: '8%' }, { id: 3, label: '5%' },
    { id: 4, label: '0%' }, { id: 5, label: 'zw.' }
  ];
  const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF'];
  const rateOf = (label) => (label === 'zw.' ? 0 : parseFloat(label) / 100);
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = (s) => (window.t ? window.t(s) : s);
  const today = () => new Date().toISOString().slice(0, 10);
  const dir = (d) => (d === 'sprzedaz' ? 'Sprzedaż' : 'Zakup');
  const vatCode = (id) => { const o = VAT_OPTIONS.find((v) => v.id === Number(id)); return o ? o.label : ''; };
  function toast(t) { let e = document.querySelector('.toast'); if (!e) { e = document.createElement('div'); e.className = 'toast'; document.body.appendChild(e); } e.textContent = t; requestAnimationFrame(() => e.classList.add('show')); clearTimeout(e._h); e._h = setTimeout(() => e.classList.remove('show'), 1800); }

  const MENU_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  let _fm = null, _fmDoc = null;
  function closeRowMenu() {
    if (!_fm) return;
    _fm.remove(); _fm = null;
    document.removeEventListener('click', _fmDoc, true);
    window.removeEventListener('scroll', closeRowMenu, true);
    window.removeEventListener('resize', closeRowMenu);
  }
  function openRowMenu(btn, actions) {
    closeRowMenu();
    const m = document.createElement('div'); m.className = 'float-menu';
    m.innerHTML = actions.map((a, i) => '<button data-i="' + i + '"' + (a.danger ? ' class="danger"' : '') + '>' + esc(a.label) + '</button>').join('');
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect();
    let left = r.right - m.offsetWidth; if (left < 8) left = 8;
    let top = r.bottom + 4; if (top + m.offsetHeight > window.innerHeight - 8) top = r.top - m.offsetHeight - 4;
    m.style.left = left + 'px'; m.style.top = top + 'px';
    m.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const a = actions[Number(b.dataset.i)]; closeRowMenu(); a.onClick(); }));
    _fm = m;
    _fmDoc = (e) => { if (_fm && !_fm.contains(e.target) && e.target !== btn) closeRowMenu(); };
    setTimeout(() => document.addEventListener('click', _fmDoc, true), 0);
    window.addEventListener('scroll', closeRowMenu, true);
    window.addEventListener('resize', closeRowMenu);
  }

  window.initInvoices = async function () {
    const app = document.getElementById('app');
    app.innerHTML =
      '<div class="page-head"><h1 class="page-title">Faktury</h1>' +
      '<button class="btn" id="invAdd" style="min-width:auto">+ Dodaj fakturę</button></div>' +
      '<div class="filters">' +
      '<label>Status <select id="fStatus"><option value="">wszystkie</option><option value="nieoplacona">nieopłacone</option><option value="oplacona">opłacone</option></select></label>' +
      '<label>Rodzaj <select id="fDir"><option value="">wszystkie</option><option value="sprzedaz">sprzedaż</option><option value="zakup">zakup</option></select></label>' +
      '</div>' +
      '<div id="invForm"></div>' +
      '<div id="invWrap" class="table-wrap"></div><p id="invMsg" class="msg"></p>';

    const wrap = document.getElementById('invWrap');
    const formWrap = document.getElementById('invForm');
    const msg = document.getElementById('invMsg');
    let contractors = [], confirmId = null, sellerName = '';

    try { contractors = await api('/contractors'); } catch (e) { return; }
    try { const p = await api('/profile'); sellerName = p.display_name || p.email || ''; } catch (e) { /* bez wystawcy */ }

    // Faktura do PDF (pdfmake) — dokument z danych faktury.
    function buildInvoicePdf(i) {
      const m = (v) => fmt(v) + ' ' + i.currency;
      const th = (t, r) => ({ text: t, bold: true, fillColor: '#eef3ef', alignment: r ? 'right' : 'left' });
      const vl = (code) => (code === 'zw' ? 'zw.' : code + '%');
      const body = [[th('Nazwa'), th('Ilość', 1), th('Cena netto', 1), th('VAT'), th('Netto', 1), th('Brutto', 1)]];
      i.items.forEach((it) => body.push([
        it.name, { text: fmt(it.quantity), alignment: 'right' }, { text: fmt(it.unit_price_net), alignment: 'right' },
        { text: vl(it.vat_code), alignment: 'center' }, { text: fmt(it.line_net), alignment: 'right' }, { text: fmt(it.line_gross), alignment: 'right' }
      ]));
      const dd = {
        pageMargins: [40, 50, 40, 40],
        content: [
          { columns: [
            { text: T('Faktura') + ' ' + (i.invoice_number || '—'), style: 'h1' },
            { text: (i.direction === 'sprzedaz' ? T('Sprzedaż') : T('Zakup')), alignment: 'right', margin: [0, 6, 0, 0], color: '#555' }
          ] },
          { columns: [
            { width: '*', stack: [{ text: T('Wystawca'), style: 'lbl' }, { text: sellerName || '—' }] },
            { width: '*', stack: [{ text: T('Nabywca'), style: 'lbl' }, { text: i.contractor_name || '—' },
              i.contractor_nip ? { text: 'NIP ' + i.contractor_nip, color: '#555', fontSize: 9 } : {}] }
          ], columnGap: 20, margin: [0, 14, 0, 10] },
          { text: T('Data wystawienia') + ': ' + (i.issue_date || '—') + '    ' + T('Data sprzedaży') + ': ' + (i.sale_date || '—') +
                  '    ' + T('Termin płatności') + ': ' + (i.payment_due_date || '—'), fontSize: 9, color: '#555', margin: [0, 0, 0, 12] },
          { table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'], body }, layout: 'lightHorizontalLines' },
          { columns: [{ width: '*', text: '' }, { width: 'auto', table: { body: [
            [T('Razem netto'), { text: m(i.total_net), alignment: 'right' }],
            ['VAT', { text: m(i.total_vat), alignment: 'right' }],
            [{ text: T('Razem') + ' brutto', bold: true }, { text: m(i.total_gross), alignment: 'right', bold: true }]
          ] }, layout: 'noBorders' }], margin: [0, 12, 0, 0] },
          { text: (i.payment_state === 'oplacona' ? T('opłacona') : T('nieopłacona')), bold: true,
            color: (i.payment_state === 'oplacona' ? '#15803d' : '#b91c1c'), margin: [0, 10, 0, 0] },
          { text: 'JDGo — ' + T('Dane do wystawienia faktury w KSeF. Nadawanie numeru i wysyłka pozostają poza zakresem systemu.'),
            style: 'foot', margin: [0, 18, 0, 0] }
        ],
        styles: { h1: { fontSize: 16, bold: true, color: '#15803d' }, lbl: { fontSize: 9, color: '#888', bold: true }, foot: { fontSize: 8, color: '#999' } },
        defaultStyle: { fontSize: 10 }
      };
      pdfMake.createPdf(dd).download('faktura_' + String(i.invoice_number || i.id).replace(/[\\/]/g, '-') + '.pdf');
    }

    function q(sel) { return document.querySelector(sel); }
    const filters = () => {
      const s = q('#fStatus').value, d = q('#fDir').value;
      return (s ? '&status=' + s : '') + (d ? '&direction=' + d : '');
    };

    async function loadList() {
      try {
        const rows = await api('/invoices?x=1' + filters());
        if (!rows.length) { wrap.innerHTML = '<div class="table-empty">Brak faktur.</div>'; return; }
        const head = '<tr><th>Numer</th><th>Rodzaj</th><th>Kontrahent</th><th>Wystawiona</th><th>Termin</th>' +
          '<th>Status</th><th class="num">Brutto</th><th></th></tr>';
        const body = rows.map((i) => {
          const badge = i.payment_state === 'oplacona'
            ? '<span class="badge paid" data-pay="' + i.id + '">opłacona</span>'
            : '<span class="badge unpaid" data-pay="' + i.id + '">nieopłacona</span>';
          const acts = '<button class="row-menu-btn" data-id="' + i.id + '" aria-label="Akcje">' + MENU_ICON + '</button>';
          return '<tr data-id="' + i.id + '"><td>' + esc(i.invoice_number || '—') + '</td><td>' + dir(i.direction) + '</td>' +
            '<td>' + esc(i.contractor_name || '—') + '</td><td>' + (i.issue_date || '—') + '</td>' +
            '<td>' + (i.payment_due_date || '—') + '</td><td>' + badge + '</td>' +
            '<td class="num">' + fmt(i.total_gross) + ' ' + i.currency + '</td><td class="acts">' + acts + '</td></tr>';
        }).join('');
        wrap.innerHTML = '<table class="data-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
        wireList();
      } catch (e) { wrap.innerHTML = '<div class="table-empty">Nie udało się wczytać faktur.</div>'; }
    }

    const vatSel = (sel) => VAT_OPTIONS.map((v) => '<option value="' + v.id + '"' + (v.id === Number(sel) ? ' selected' : '') + '>' + v.label + '</option>').join('');

    function itemRow(it) {
      it = it || { name: '', quantity: 1, unit_price_net: '', vat_rate_id: 1 };
      return '<tr class="item-row">' +
        '<td><input data-k="name" value="' + esc(it.name) + '"></td>' +
        '<td><input type="number" step="0.001" min="0" data-k="quantity" value="' + esc(it.quantity) + '"></td>' +
        '<td><input type="number" step="0.01" min="0" data-k="unit_price_net" value="' + esc(it.unit_price_net) + '"></td>' +
        '<td><select data-k="vat_rate_id">' + vatSel(it.vat_rate_id) + '</select></td>' +
        '<td class="num" data-c="net">0,00</td><td class="num" data-c="gross">0,00</td>' +
        '<td><button type="button" class="icon-btn danger rmItem">✕</button></td></tr>';
    }

    async function openForm(inv, asNew) {
      const contrOpts = '<option value="">— brak —</option>' +
        contractors.map((c) => '<option value="' + c.id + '"' + (inv && String(inv.contractor_id) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
      const curOpts = CURRENCIES.map((c) => '<option' + (inv && inv.currency === c ? ' selected' : '') + '>' + c + '</option>').join('');
      const val = (f) => (inv && inv[f] != null ? esc(inv[f]) : '');
      formWrap.innerHTML =
        '<div class="op-form"><div class="op-grid">' +
        '<label>Rodzaj<select data-h="direction"><option value="sprzedaz"' + (!inv || inv.direction === 'sprzedaz' ? ' selected' : '') + '>Sprzedaż</option><option value="zakup"' + (inv && inv.direction === 'zakup' ? ' selected' : '') + '>Zakup</option></select></label>' +
        '<label>Kontrahent<select data-h="contractor_id">' + contrOpts + '</select></label>' +
        '<label>Numer<input data-h="invoice_number" value="' + val('invoice_number') + '"></label>' +
        '<label>Data wystawienia<input type="date" data-h="issue_date" value="' + val('issue_date') + '"></label>' +
        '<label>Data sprzedaży<input type="date" data-h="sale_date" value="' + val('sale_date') + '"></label>' +
        '<label>Termin płatności<input type="date" data-h="payment_due_date" value="' + val('payment_due_date') + '"></label>' +
        '<label>Status<select data-h="payment_state"><option value="nieoplacona"' + (!inv || inv.payment_state === 'nieoplacona' ? ' selected' : '') + '>nieopłacona</option><option value="oplacona"' + (inv && inv.payment_state === 'oplacona' ? ' selected' : '') + '>opłacona</option></select></label>' +
        '<label>Waluta<select data-h="currency">' + curOpts + '</select></label>' +
        '</div>' +
        '<div class="form-title">Pozycje</div>' +
        '<table class="items-table"><thead><tr><th>Nazwa</th><th>Ilość</th><th>Cena netto</th><th>VAT</th>' +
        '<th class="num">Netto</th><th class="num">Brutto</th><th></th></tr></thead><tbody id="itemsBody"></tbody></table>' +
        '<button type="button" class="icon-btn" id="addItem">+ Dodaj pozycję</button>' +
        '<div class="op-calc">Razem — Netto: <b id="tNet">0,00</b> &middot; VAT: <b id="tVat">0,00</b> &middot; Brutto: <b id="tGross">0,00</b></div>' +
        '<label>Uwagi<input data-h="notes" value="' + val('notes') + '"></label>' +
        '<div class="op-actions" style="margin-top:12px"><button class="btn" id="invSave" style="min-width:auto">Zapisz</button>' +
        '<button class="btn btn-outline" id="invCancel" style="min-width:auto">Anuluj</button></div><p id="fMsg" class="msg"></p></div>';

      const body = document.getElementById('itemsBody');
      const items = (inv && inv.items && inv.items.length) ? inv.items : [null];
      items.forEach((it) => body.insertAdjacentHTML('beforeend', itemRow(it)));
      const formEl = formWrap.querySelector('.op-form');

      function recalc() {
        let tn = 0, tv = 0, tg = 0;
        body.querySelectorAll('.item-row').forEach((tr) => {
          const g = (k) => tr.querySelector('[data-k=' + k + ']').value;
          const net = round2((Number(g('quantity')) || 0) * (Number(g('unit_price_net')) || 0));
          const vat = round2(net * rateOf(vatCode(g('vat_rate_id'))));
          tr.querySelector('[data-c=net]').textContent = fmt(net);
          tr.querySelector('[data-c=gross]').textContent = fmt(round2(net + vat));
          tn += net; tv += vat; tg += round2(net + vat);
        });
        document.getElementById('tNet').textContent = fmt(round2(tn));
        document.getElementById('tVat').textContent = fmt(round2(tv));
        document.getElementById('tGross').textContent = fmt(round2(tg));
      }
      formEl.addEventListener('input', recalc);
      formEl.addEventListener('change', recalc);
      document.getElementById('addItem').addEventListener('click', () => { body.insertAdjacentHTML('beforeend', itemRow()); recalc(); });
      body.addEventListener('click', (e) => { if (e.target.classList.contains('rmItem')) { if (body.querySelectorAll('.item-row').length > 1) e.target.closest('tr').remove(); recalc(); } });
      recalc();

      document.getElementById('invCancel').addEventListener('click', () => { formWrap.innerHTML = ''; });
      document.getElementById('invSave').addEventListener('click', () => save(asNew ? 'new' : (inv ? inv.id : 'new')));
    }

    function gatherForm() {
      const h = {};
      formWrap.querySelectorAll('[data-h]').forEach((el) => { h[el.dataset.h] = el.value; });
      h.contractor_id = h.contractor_id || null;
      h.items = [...formWrap.querySelectorAll('.item-row')].map((tr) => {
        const g = (k) => tr.querySelector('[data-k=' + k + ']').value;
        return { name: g('name'), quantity: Number(g('quantity')), unit_price_net: Number(g('unit_price_net')), vat_rate_id: Number(g('vat_rate_id')) };
      });
      return h;
    }
    async function save(id) {
      const fMsg = document.getElementById('fMsg'); fMsg.className = 'msg';
      const body = gatherForm();
      try {
        if (id === 'new') await api('/invoices', 'POST', body);
        else await api('/invoices/' + id, 'PUT', body);
        formWrap.innerHTML = ''; await loadList(); toast(id === 'new' ? 'Dodano' : 'Zapisano');
      } catch (err) { fMsg.textContent = err.message; }
    }

    async function preview(id) {
      const i = await api('/invoices/' + id);
      const items = i.items.map((it) =>
        '<tr><td>' + esc(it.name) + '</td><td class="num">' + fmt(it.quantity) + '</td>' +
        '<td class="num">' + fmt(it.unit_price_net) + '</td><td>' + (it.vat_code === 'zw' ? 'zw.' : it.vat_code + '%') + '</td>' +
        '<td class="num">' + fmt(it.line_net) + '</td><td class="num">' + fmt(it.line_gross) + '</td></tr>').join('');
      const badge = i.payment_state === 'oplacona' ? '<span class="badge paid">opłacona</span>' : '<span class="badge unpaid">nieopłacona</span>';
      const html = '<div class="inv-preview">' +
        '<h2>Faktura ' + esc(i.invoice_number || '(bez numeru)') + '</h2>' +
        '<div class="muted">' + dir(i.direction) + ' &middot; ' + badge + '</div>' +
        '<p class="muted">Kontrahent: <b>' + esc(i.contractor_name || '—') + '</b>' + (i.contractor_nip ? ', NIP ' + esc(i.contractor_nip) : '') + '<br>' +
        'Data wystawienia: ' + (i.issue_date || '—') + ' &middot; Data sprzedaży: ' + (i.sale_date || '—') + ' &middot; Termin: ' + (i.payment_due_date || '—') + '</p>' +
        '<table><thead><tr><th>Nazwa</th><th class="num">Ilość</th><th class="num">Cena netto</th><th>VAT</th><th class="num">Netto</th><th class="num">Brutto</th></tr></thead><tbody>' + items + '</tbody></table>' +
        '<p class="totals">Razem netto: <b>' + fmt(i.total_net) + ' ' + i.currency + '</b><br>VAT: <b>' + fmt(i.total_vat) + ' ' + i.currency + '</b><br>Brutto: <b>' + fmt(i.total_gross) + ' ' + i.currency + '</b></p>' +
        '<p class="muted">Dane do wystawienia faktury w KSeF. Nadawanie numeru i wysyłka pozostają poza zakresem systemu.</p>' +
        '<div class="op-actions" style="margin-top:14px"><button class="btn" id="invPdf" style="min-width:auto">Pobierz PDF</button></div></div>';
      showModal(html);
      document.getElementById('invPdf').addEventListener('click', () => buildInvoicePdf(i));
    }
    function showModal(inner) {
      let ov = document.getElementById('invModal');
      if (!ov) {
        ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'invModal';
        ov.innerHTML = '<div class="modal"><button class="modal-close">&times;</button><div class="modal-body"></div></div>';
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('open'); });
        ov.querySelector('.modal-close').addEventListener('click', () => ov.classList.remove('open'));
      }
      ov.querySelector('.modal-body').innerHTML = inner;
      ov.classList.add('open');
    }

    async function togglePay(id) {
      const rows = await api('/invoices?x=1' + filters());
      const cur = rows.find((r) => String(r.id) === String(id));
      const next = cur && cur.payment_state === 'oplacona' ? 'nieoplacona' : 'oplacona';
      try { await api('/invoices/' + id + '/payment', 'PATCH', { payment_state: next }); await loadList(); toast('Zmieniono status'); }
      catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
    }
    async function remove(id) {
      try { await api('/invoices/' + id, 'DELETE'); confirmId = null; await loadList(); toast('Usunięto'); }
      catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
    }

    function wireList() {
      wrap.querySelectorAll('[data-pay]').forEach((el) => el.addEventListener('click', () => togglePay(el.dataset.pay)));
      wrap.querySelectorAll('.row-menu-btn').forEach((mb) => mb.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = mb.dataset.id;
        openRowMenu(mb, [
          { label: T('Podgląd'), onClick: () => preview(id) },
          { label: T('Edytuj'), onClick: async () => { const i = await api('/invoices/' + id); openForm(i); } },
          { label: T('Kopiuj'), onClick: async () => {
            const i = await api('/invoices/' + id);
            const copy = Object.assign({}, i, { invoice_number: '', issue_date: today(), sale_date: '', payment_due_date: '', payment_state: 'nieoplacona' });
            openForm(copy, true); toast(T('Skopiowano — zapisz jako nową'));
          } },
          { label: T('Usuń'), danger: true, onClick: () => { if (confirm(T('Usunąć fakturę?'))) remove(id); } }
        ]);
      }));
    }

    function highlightRow() {
      const id = new URLSearchParams(location.search).get('highlight');
      if (!id) return;
      const tr = wrap.querySelector('tr[data-id="' + id + '"]');
      if (tr) { tr.classList.add('row-highlight'); tr.scrollIntoView({ block: 'center' }); }
    }

    document.getElementById('invAdd').addEventListener('click', () => openForm(null));
    q('#fStatus').addEventListener('change', loadList);
    q('#fDir').addEventListener('change', loadList);
    await loadList();
    highlightRow();
  };
})();
