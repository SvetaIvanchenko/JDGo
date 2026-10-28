// Wspólny moduł ewidencji operacji (Przychody / Koszty).
// Zaznaczanie wierszy + pasek akcji (Edytuj/Kopiuj/Usuń) z edycją wielu wierszy naraz
// (styl arkusza / Data Extensions) + filtrowanie per kolumna + sortowanie. Użycie: initOperations('przychod').
(function () {
  const VAT_OPTIONS = [
    { id: 1, code: '23', label: '23%' }, { id: 2, code: '8', label: '8%' },
    { id: 3, code: '5', label: '5%' }, { id: 4, code: '0', label: '0%' }, { id: 5, code: 'zw', label: 'zw.' }
  ];
  const CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF'];
  const rateOf = (label) => (label === 'zw.' ? 0 : parseFloat(label) / 100);
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const fmt = (n) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const vatLabel = (code) => (code === 'zw' ? 'zw.' : code + '%');
  const today = () => new Date().toISOString().slice(0, 10);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const T = (s) => (window.t ? window.t(s) : s);
  const debounce = (fn, ms) => { let h; return () => { clearTimeout(h); h = setTimeout(fn, ms); }; };
  const loadingRow = () => '<tr><td colspan="10"><div class="loading"><span class="spinner"></span>' + T('Wczytywanie…') + '</div></td></tr>';
  function toast(text) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = text; requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800);
  }

  window.initOperations = async function (type) {
    const income = type === 'przychod';
    const L = income
      ? { title: 'Przychody', add: '+ Dodaj przychód', empty: 'Brak przychodów.' }
      : { title: 'Koszty', add: '+ Dodaj koszt', empty: 'Brak kosztów.' };

    const app = document.getElementById('app');
    app.innerHTML =
      '<div class="page-head"><h1 class="page-title">' + L.title + '</h1>' +
      '<button class="btn" id="opAdd" style="min-width:auto">' + L.add + '</button></div>' +
      '<p class="page-sub">Zaznacz wiersze i użyj paska akcji; filtruj i sortuj w nagłówkach kolumn.</p>' +
      '<div id="opToolbar" class="table-toolbar"></div>' +
      '<div id="opTableWrap" class="table-wrap"></div>' +
      '<p id="opMsg" class="msg"></p>';

    const tableWrap = document.getElementById('opTableWrap');
    const msg = document.getElementById('opMsg');

    let profile = {}, contractors = [], rows = [];
    let mode = null;                 // null | 'edit' | 'copy' | 'add'
    let drafts = new Map();          // klucz -> wersja robocza (id dla edycji, 'newN' dla kopii/dodania)
    let newSeq = 0;
    let sortCol = 'date', sortDir = 'desc';
    const selected = new Set();

    try { [profile, contractors] = await Promise.all([api('/profile'), api('/contractors')]); }
    catch (e) { return; }

    document.getElementById('opAdd').addEventListener('click', () => {
      if (mode) return;
      mode = 'add'; drafts = new Map([['new' + (++newSeq), newDraft()]]); selected.clear();
      renderBody(); focusFirstEdit();
    });

    const newDraft = () => ({
      operation_date: today(), contractor_id: '', category: '', description: '',
      vat_rate_id: profile.default_vat_rate_id || 1, currency: profile.default_currency || 'PLN', amount_net: ''
    });
    const draftFromRow = (o) => ({
      operation_date: o.operation_date, contractor_id: o.contractor_id || '',
      category: o.category || '', description: o.description || '',
      vat_rate_id: o.vat_rate_id, currency: o.currency, amount_net: o.amount_net
    });
    function compute(net, vatId) {
      const opt = VAT_OPTIONS.find((v) => v.id === Number(vatId)) || { label: '0%' };
      const n = round2(Number(net) || 0);
      const vat = round2(n * rateOf(opt.label));
      return { vat, gross: round2(n + vat) };
    }
    function focusFirstEdit() {
      const first = document.querySelector('#opBody .edit-row input'); if (first) { first.focus(); first.scrollIntoView({ block: 'center' }); }
    }

    const vatSelect = (sel) => '<select class="cell-input" data-f="vat_rate_id">' +
      VAT_OPTIONS.map((v) => '<option value="' + v.id + '"' + (v.id === Number(sel) ? ' selected' : '') + '>' + v.label + '</option>').join('') + '</select>';
    const contrSelect = (sel) => '<select class="cell-input" data-f="contractor_id"><option value="">— brak —</option>' +
      contractors.map((c) => '<option value="' + c.id + '"' + (String(c.id) === String(sel) ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select>';
    const curSelect = (sel) => '<select class="cell-input" data-f="currency">' +
      CURRENCIES.map((c) => '<option' + (c === sel ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';

    function editRow(d, key) {
      const c = compute(d.amount_net, d.vat_rate_id);
      return '<tr class="edit-row" data-key="' + key + '">' +
        '<td class="sel"></td>' +
        '<td><input class="cell-input" type="date" data-f="operation_date" value="' + esc(d.operation_date) + '"></td>' +
        '<td>' + contrSelect(d.contractor_id) + '</td>' +
        '<td><input class="cell-input" data-f="description" value="' + esc(d.description) + '"></td>' +
        '<td><input class="cell-input" data-f="category" value="' + esc(d.category) + '"></td>' +
        '<td>' + vatSelect(d.vat_rate_id) + '</td>' +
        '<td>' + curSelect(d.currency) + '</td>' +
        '<td><input class="cell-input num" type="number" step="0.01" min="0" data-f="amount_net" value="' + esc(d.amount_net) + '"></td>' +
        '<td class="num" data-c="vat">' + fmt(c.vat) + '</td>' +
        '<td class="num" data-c="gross">' + fmt(c.gross) + '</td></tr>';
    }
    function viewRow(o) {
      const chk = selected.has(String(o.id)) ? ' checked' : '';
      return '<tr data-id="' + o.id + '" class="' + (chk ? 'selected' : '') + '">' +
        '<td class="sel"><input type="checkbox" class="row-check" data-id="' + o.id + '"' + chk + (mode ? ' disabled' : '') + '></td>' +
        '<td>' + o.operation_date + '</td>' +
        '<td>' + esc(o.contractor_name || '—') + '</td>' +
        '<td class="wrap">' + esc(o.description) + '</td>' +
        '<td>' + esc(o.category) + '</td>' +
        '<td>' + vatLabel(o.vat_code) + '</td>' +
        '<td>' + o.currency + '</td>' +
        '<td class="num">' + fmt(Number(o.amount_net)) + '</td>' +
        '<td class="num">' + fmt(Number(o.amount_vat)) + '</td>' +
        '<td class="num">' + fmt(Number(o.amount_gross)) + '</td></tr>';
    }

    const arrowSpan = (c) => '<span class="sort-arrow" data-for="' + c + '">' + (sortCol === c ? (sortDir === 'asc' ? '▲' : '▼') : '') + '</span>';
    const thS = (label, c, cls) => '<th class="sortable ' + (cls || '') + '" data-sort="' + c + '">' + label + ' ' + arrowSpan(c) + '</th>';

    function buildShell() {
      const stawkaOpts = '<option value="">wszystkie</option>' + VAT_OPTIONS.map((v) => '<option value="' + v.code + '">' + v.label + '</option>').join('');
      const curOpts = '<option value="">wszystkie</option>' + CURRENCIES.map((c) => '<option>' + c + '</option>').join('');
      const head = '<tr><th class="sel"><input type="checkbox" class="row-check" id="selAll" aria-label="Zaznacz wszystkie"></th>' +
        thS('Data', 'date') + thS('Kontrahent', 'contractor') + '<th>Opis</th>' +
        thS('Kategoria', 'category') + '<th>Stawka</th><th>Waluta</th>' +
        '<th class="num">Netto</th><th class="num">VAT</th>' + thS('Brutto', 'amount', 'num') + '</tr>';
      const filterRow = '<tr class="filter-row"><td class="sel"></td>' +
        '<td><input class="cell-input" id="fDate" placeholder="RRRR-MM"></td>' +
        '<td><input class="cell-input" id="fContr" placeholder="filtruj"></td>' +
        '<td><input class="cell-input" id="fOpis" placeholder="filtruj"></td>' +
        '<td><input class="cell-input" id="fKat" placeholder="filtruj"></td>' +
        '<td><select class="cell-input" id="fStawka">' + stawkaOpts + '</select></td>' +
        '<td><select class="cell-input" id="fWaluta">' + curOpts + '</select></td>' +
        '<td><input class="cell-input num" type="number" id="fNet" placeholder="min"></td>' +
        '<td><input class="cell-input num" type="number" id="fVat" placeholder="min"></td>' +
        '<td><input class="cell-input num" type="number" id="fGross" placeholder="min"></td></tr>';
      tableWrap.innerHTML = '<table class="data-table op-table"><thead>' + head + filterRow +
        '</thead><tbody id="opBody"></tbody></table>';

      tableWrap.querySelectorAll('th[data-sort]').forEach((th) => {
        th.addEventListener('click', () => {
          if (mode) return;
          const c = th.dataset.sort;
          if (sortCol === c) sortDir = (sortDir === 'asc' ? 'desc' : 'asc');
          else { sortCol = c; sortDir = 'asc'; }
          tableWrap.querySelectorAll('.sort-arrow').forEach((s) => { s.textContent = (s.dataset.for === sortCol) ? (sortDir === 'asc' ? '▲' : '▼') : ''; });
          reload();
        });
      });
      ['fDate', 'fContr', 'fOpis', 'fKat', 'fNet', 'fVat', 'fGross'].forEach((id) =>
        document.getElementById(id).addEventListener('input', debounce(reload, 300)));
      ['fStawka', 'fWaluta'].forEach((id) => document.getElementById(id).addEventListener('change', reload));
      document.getElementById('selAll').addEventListener('change', (e) => {
        if (mode) { e.target.checked = false; return; }
        const on = e.target.checked;
        rows.forEach((o) => { if (on) selected.add(String(o.id)); else selected.delete(String(o.id)); });
        document.querySelectorAll('#opBody .row-check').forEach((c) => { c.checked = on; c.closest('tr').classList.toggle('selected', on); });
        renderToolbar();
      });
    }

    function clearFilters() {
      ['fDate', 'fContr', 'fOpis', 'fKat', 'fNet', 'fVat', 'fGross', 'fStawka', 'fWaluta'].forEach((id) => { document.getElementById(id).value = ''; });
      reload();
    }

    function query() {
      const p = new URLSearchParams(); p.set('type', type);
      const g = (id) => document.getElementById(id).value.trim();
      const set = (k, v) => { if (v) p.set(k, v); };
      set('dq', g('fDate')); set('contractor', g('fContr')); set('opis', g('fOpis')); set('kategoria', g('fKat'));
      set('stawka', g('fStawka')); set('waluta', g('fWaluta'));
      set('netMin', g('fNet')); set('vatMin', g('fVat')); set('grossMin', g('fGross'));
      p.set('sort', sortCol); p.set('dir', sortDir);
      return '?' + p.toString();
    }

    function renderBody() {
      const body = document.getElementById('opBody');
      let html = rows.map((o) => (mode === 'edit' && drafts.has(String(o.id))) ? editRow(drafts.get(String(o.id)), String(o.id)) : viewRow(o)).join('');
      if (mode === 'copy' || mode === 'add') {
        drafts.forEach((d, k) => { if (k.indexOf('new') === 0) html += editRow(d, k); });
      }
      if (!rows.length && mode !== 'copy' && mode !== 'add') {
        html = '<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:22px">' + L.empty + '</td></tr>';
      }
      body.innerHTML = html;
      document.getElementById('opAdd').disabled = (mode !== null);
      const sa = document.getElementById('selAll'); if (sa) sa.disabled = (mode !== null);
      renderToolbar();
      wireBody();
      syncSelAll();
    }

    function renderToolbar() {
      const tb = document.getElementById('opToolbar');
      if (mode) {
        const label = (mode === 'edit') ? (T('Edytujesz') + ': ' + drafts.size) : (T('Nowe wpisy') + ': ' + drafts.size);
        tb.innerHTML =
          '<div class="tb-actions"><button class="btn" id="tbSave" style="min-width:auto">Zapisz</button>' +
          '<button class="btn btn-outline" id="tbCancel" style="min-width:auto">Anuluj</button></div>' +
          '<span class="tb-count">' + label + '</span>';
        document.getElementById('tbSave').addEventListener('click', saveAll);
        document.getElementById('tbCancel').addEventListener('click', () => { mode = null; drafts.clear(); msg.textContent = ''; renderBody(); });
      } else {
        const n = selected.size; const dis = n === 0 ? ' disabled' : '';
        tb.innerHTML =
          '<div class="tb-actions">' +
          '<button class="btn btn-outline" id="tbEdit"' + dis + '>Edytuj</button>' +
          '<button class="btn btn-outline" id="tbCopy"' + dis + '>Kopiuj</button>' +
          '<button class="btn btn-outline danger" id="tbDel"' + dis + '>Usuń</button></div>' +
          '<span class="tb-count">' + (n ? (T('Zaznaczono') + ': ' + n) : '') + '</span>' +
          '<span class="spacer"></span><button class="btn-link" id="tbClear">Wyczyść filtry</button>';
        if (n) {
          document.getElementById('tbEdit').addEventListener('click', startEdit);
          document.getElementById('tbCopy').addEventListener('click', startCopy);
          document.getElementById('tbDel').addEventListener('click', bulkDelete);
        }
        document.getElementById('tbClear').addEventListener('click', clearFilters);
      }
    }

    function startEdit() {
      mode = 'edit'; drafts = new Map();
      selected.forEach((id) => { const o = rows.find((r) => String(r.id) === id); if (o) drafts.set(id, draftFromRow(o)); });
      renderBody(); focusFirstEdit();
    }
    function startCopy() {
      mode = 'copy'; drafts = new Map();
      selected.forEach((id) => { const o = rows.find((r) => String(r.id) === id); if (o) { const d = draftFromRow(o); d.operation_date = today(); drafts.set('new' + (++newSeq), d); } });
      renderBody(); focusFirstEdit();
    }

    async function reload() {
      selected.clear();
      const b = document.getElementById('opBody'); if (b) b.innerHTML = loadingRow();
      rows = await api('/operations' + query());
      renderBody();
    }

    function syncSelAll() {
      const sa = document.getElementById('selAll'); if (!sa) return;
      const total = rows.length;
      const sel = rows.filter((o) => selected.has(String(o.id))).length;
      sa.checked = total > 0 && sel === total;
      sa.indeterminate = sel > 0 && sel < total;
    }

    const gather = (tr) => { const d = {}; tr.querySelectorAll('[data-f]').forEach((el) => { d[el.dataset.f] = el.value; }); return d; };

    async function saveAll() {
      msg.className = 'msg';
      const items = [];
      for (const tr of document.querySelectorAll('#opBody .edit-row')) {
        const d = gather(tr);
        if (!d.operation_date) { msg.textContent = 'Podaj datę'; return; }
        if (d.amount_net === '' || !(Number(d.amount_net) >= 0)) { msg.textContent = 'Podaj poprawną kwotę netto'; return; }
        items.push({
          key: tr.dataset.key, body: {
            type: type, operation_date: d.operation_date, contractor_id: d.contractor_id || null,
            category: d.category, description: d.description, vat_rate_id: Number(d.vat_rate_id),
            currency: d.currency, amount_net: Number(d.amount_net)
          }
        });
      }
      const wasEdit = (mode === 'edit');
      try {
        for (const it of items) {
          if (wasEdit) await api('/operations/' + it.key, 'PUT', it.body);
          else await api('/operations', 'POST', it.body);
        }
        mode = null; drafts.clear(); selected.clear();
        await reload();
        toast(wasEdit ? 'Zapisano' : 'Dodano');
      } catch (err) { msg.textContent = err.message; }
    }

    async function bulkDelete() {
      if (!selected.size) return;
      if (!confirm(T('Usunąć zaznaczone operacje?') + ' (' + selected.size + ')')) return;
      msg.className = 'msg';
      try {
        for (const id of Array.from(selected)) { await api('/operations/' + id, 'DELETE'); }
        toast(T('Usunięto'));
        await reload();
      } catch (err) { msg.textContent = err.message; }
    }

    function onEditInput(e) {
      const tr = e.target.closest('.edit-row'); if (!tr) return;
      const d = gather(tr); const c = compute(d.amount_net, d.vat_rate_id);
      const v = tr.querySelector('[data-c=vat]'); const g = tr.querySelector('[data-c=gross]');
      if (v) v.textContent = fmt(c.vat); if (g) g.textContent = fmt(c.gross);
    }

    function wireBody() {
      const body = document.getElementById('opBody');
      body.addEventListener('input', onEditInput);
      body.addEventListener('change', onEditInput);
      body.querySelectorAll('.row-check').forEach((chk) => {
        if (mode) return;
        chk.addEventListener('change', () => {
          const id = chk.dataset.id;
          if (chk.checked) selected.add(id); else selected.delete(id);
          chk.closest('tr').classList.toggle('selected', chk.checked);
          renderToolbar(); syncSelAll();
        });
      });
    }

    function highlightRow() {
      const id = new URLSearchParams(location.search).get('highlight');
      if (!id) return;
      const tr = tableWrap.querySelector('#opBody tr[data-id="' + id + '"]');
      if (tr) { tr.classList.add('row-highlight'); tr.scrollIntoView({ block: 'center' }); }
    }

    buildShell();
    document.getElementById('opBody').innerHTML = loadingRow();
    rows = await api('/operations' + query());
    renderBody();
    highlightRow();
  };
})();
