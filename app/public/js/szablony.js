// Szablony operacji (powtarzalne przychody/koszty). Użycie: initTemplates().
(function () {
  const VAT = [{ id: 1, label: '23%' }, { id: 2, label: '8%' }, { id: 3, label: '5%' }, { id: 4, label: '0%' }, { id: 5, label: 'zw.' }];
  const CUR = ['PLN', 'EUR', 'USD', 'GBP', 'CHF'];
  const fmt = (n) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const T = (s) => (window.t ? window.t(s) : s);
  const typeLabel = (t) => (t === 'przychod' ? 'Przychód' : 'Koszt');
  const vl = (code) => (code === 'zw' ? 'zw.' : code + '%');
  function toast(t) { let e = document.querySelector('.toast'); if (!e) { e = document.createElement('div'); e.className = 'toast'; document.body.appendChild(e); } e.textContent = t; requestAnimationFrame(() => e.classList.add('show')); clearTimeout(e._h); e._h = setTimeout(() => e.classList.remove('show'), 1800); }

  window.initTemplates = async function () {
    const app = document.getElementById('app');
    app.innerHTML =
      '<div class="page-head"><h1 class="page-title">Szablony</h1>' +
      '<button class="btn" id="tplAdd" style="min-width:auto">+ Dodaj szablon</button></div>' +
      '<p class="page-sub">Powtarzalne przychody/koszty — jednym kliknięciem tworzysz operację z szablonu.</p>' +
      '<div id="tplForm"></div><div id="tplWrap" class="table-wrap"></div><p id="tplMsg" class="msg"></p>';
    const formWrap = document.getElementById('tplForm');
    const wrap = document.getElementById('tplWrap');
    const msg = document.getElementById('tplMsg');
    let contractors = [], rows = [];

    try { contractors = await api('/contractors'); } catch (e) { return; }

    function openForm(t) {
      const contrOpts = '<option value="">— brak —</option>' +
        contractors.map((c) => '<option value="' + c.id + '"' + (t && String(t.contractor_id) === String(c.id) ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
      const vatOpts = VAT.map((v) => '<option value="' + v.id + '"' + (t && Number(t.vat_rate_id) === v.id ? ' selected' : '') + '>' + v.label + '</option>').join('');
      const curOpts = CUR.map((c) => '<option' + (t && t.currency === c ? ' selected' : '') + '>' + c + '</option>').join('');
      const val = (f) => (t && t[f] != null ? esc(t[f]) : '');
      formWrap.innerHTML =
        '<div class="op-form"><div class="op-grid">' +
        '<label>Nazwa szablonu<input data-h="name" value="' + val('name') + '"></label>' +
        '<label>Typ<select data-h="type"><option value="koszt"' + (!t || t.type === 'koszt' ? ' selected' : '') + '>Koszt</option><option value="przychod"' + (t && t.type === 'przychod' ? ' selected' : '') + '>Przychód</option></select></label>' +
        '<label>Kontrahent<select data-h="contractor_id">' + contrOpts + '</select></label>' +
        '<label>Kategoria<input data-h="category" value="' + val('category') + '"></label>' +
        '<label>Opis<input data-h="description" value="' + val('description') + '"></label>' +
        '<label>Stawka VAT<select data-h="vat_rate_id">' + vatOpts + '</select></label>' +
        '<label>Waluta<select data-h="currency">' + curOpts + '</select></label>' +
        '<label>Kwota netto<input type="number" step="0.01" min="0" data-h="amount_net" value="' + val('amount_net') + '"></label>' +
        '</div><div class="op-actions" style="margin-top:12px">' +
        '<button class="btn" id="tplSave" style="min-width:auto">Zapisz</button>' +
        '<button class="btn btn-outline" id="tplCancel" style="min-width:auto">Anuluj</button></div><p id="tplFMsg" class="msg"></p></div>';
      document.getElementById('tplSave').addEventListener('click', () => save(t ? t.id : 'new'));
      document.getElementById('tplCancel').addEventListener('click', () => { formWrap.innerHTML = ''; });
    }

    function gather() {
      const h = {};
      formWrap.querySelectorAll('[data-h]').forEach((el) => { h[el.dataset.h] = el.value; });
      h.contractor_id = h.contractor_id || null;
      h.vat_rate_id = Number(h.vat_rate_id);
      h.amount_net = Number(h.amount_net);
      return h;
    }
    async function save(id) {
      const m = document.getElementById('tplFMsg'); m.className = 'msg';
      try {
        if (id === 'new') await api('/templates', 'POST', gather());
        else await api('/templates/' + id, 'PUT', gather());
        formWrap.innerHTML = ''; await load(); toast(id === 'new' ? 'Dodano' : 'Zapisano');
      } catch (e) { m.textContent = e.message; }
    }

    function render() {
      if (!rows.length) { wrap.innerHTML = '<div class="table-empty">Brak szablonów.</div>'; return; }
      const head = '<tr><th>Nazwa</th><th>Typ</th><th>Kontrahent</th><th>Kategoria</th><th>Stawka</th>' +
        '<th class="num">Netto</th><th>Użyj</th><th></th></tr>';
      const body = rows.map((t) =>
        '<tr data-id="' + t.id + '"><td>' + esc(t.name) + '</td><td>' + typeLabel(t.type) + '</td>' +
        '<td>' + esc(t.contractor_name || '—') + '</td><td>' + esc(t.category || '—') + '</td>' +
        '<td>' + vl(t.vat_code) + '</td><td class="num">' + fmt(t.amount_net) + ' ' + t.currency + '</td>' +
        '<td class="use-cell"><input type="date" class="cell-input use-date" value="' + today() + '"><button class="icon-btn use">Użyj</button></td>' +
        '<td class="acts"><button class="icon-btn edit">Edytuj</button><button class="icon-btn danger del">Usuń</button></td></tr>').join('');
      wrap.innerHTML = '<table class="data-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
      wrap.querySelectorAll('tr[data-id]').forEach((tr) => {
        const id = tr.dataset.id;
        tr.querySelector('.use').addEventListener('click', async () => {
          const date = tr.querySelector('.use-date').value;
          try { await api('/templates/' + id + '/use', 'POST', { operation_date: date }); toast('Utworzono operację'); }
          catch (e) { msg.className = 'msg'; msg.textContent = e.message; }
        });
        tr.querySelector('.edit').addEventListener('click', () => openForm(rows.find((r) => String(r.id) === id)));
        tr.querySelector('.del').addEventListener('click', async () => {
          if (!confirm(T('Usunąć szablon?'))) return;
          try { await api('/templates/' + id, 'DELETE'); await load(); toast('Usunięto'); }
          catch (e) { msg.className = 'msg'; msg.textContent = e.message; }
        });
      });
    }

    async function load() { rows = await api('/templates'); render(); }

    document.getElementById('tplAdd').addEventListener('click', () => openForm(null));
    await load();
  };
})();
