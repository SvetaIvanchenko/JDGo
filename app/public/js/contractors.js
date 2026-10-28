// Ewidencja kontrahentów z edycją w wierszu (WF-18). Użycie: initContractors().
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function toast(text) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = text; requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800);
  }

  const T = (s) => (window.t ? window.t(s) : s);
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

  window.initContractors = async function () {
    const app = document.getElementById('app');
    app.innerHTML = '<div class="page-head"><h1 class="page-title">Kontrahenci</h1>' +
      '<button class="btn" id="cAdd" style="min-width:auto">+ Dodaj kontrahenta</button></div>' +
      '<p class="page-sub">Baza kontrahentów — kliknij „Edytuj”, aby zmienić wiersz.</p>' +
      '<div id="cWrap" class="table-wrap"></div><p id="cMsg" class="msg"></p>';
    const wrap = document.getElementById('cWrap');
    const msg = document.getElementById('cMsg');
    let rows = [], editingId = null, draft = null, confirmId = null;

    document.getElementById('cAdd').addEventListener('click', () => {
      if (editingId === 'new') return;
      editingId = 'new'; draft = empty(); confirmId = null; render();
      const f = wrap.querySelector('.edit-row input'); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); }
    });

    const empty = () => ({ name: '', nip: '', street: '', postal_code: '', city: '', country: 'PL' });
    const fromRow = (o) => ({ name: o.name || '', nip: o.nip || '', street: o.street || '', postal_code: o.postal_code || '', city: o.city || '', country: o.country || 'PL' });

    function editRow(d, id) {
      return '<tr class="edit-row" data-id="' + id + '">' +
        '<td><input class="cell-input" data-f="name" value="' + esc(d.name) + '"></td>' +
        '<td><input class="cell-input" data-f="nip" maxlength="10" value="' + esc(d.nip) + '"></td>' +
        '<td><input class="cell-input" data-f="street" value="' + esc(d.street) + '"></td>' +
        '<td><input class="cell-input" data-f="postal_code" maxlength="10" value="' + esc(d.postal_code) + '"></td>' +
        '<td><input class="cell-input" data-f="city" value="' + esc(d.city) + '"></td>' +
        '<td><input class="cell-input" data-f="country" maxlength="2" value="' + esc(d.country) + '"></td>' +
        '<td class="acts"><button class="icon-btn save">Zapisz</button><button class="icon-btn danger cancel">Anuluj</button></td></tr>';
    }
    function viewRow(o) {
      return '<tr data-id="' + o.id + '"><td>' + esc(o.name) + '</td><td>' + esc(o.nip || '—') + '</td>' +
        '<td>' + esc(o.street) + '</td><td>' + esc(o.postal_code) + '</td><td>' + esc(o.city) + '</td>' +
        '<td>' + esc(o.country) + '</td>' +
        '<td class="acts"><button class="row-menu-btn" aria-label="Akcje">' + MENU_ICON + '</button></td></tr>';
    }
    function render() {
      const head = '<tr><th>Nazwa</th><th>NIP</th><th>Ulica</th><th>Kod</th><th>Miasto</th><th>Kraj</th><th></th></tr>';
      const newRow = (editingId === 'new') ? editRow(draft, 'new') : '';
      let body = rows.map((o) => (editingId === o.id ? editRow(draft, o.id) : viewRow(o))).join('');
      if (!rows.length && editingId !== 'new') body = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:22px">Brak kontrahentów.</td></tr>';
      wrap.innerHTML = '<table class="data-table op-table"><thead>' + head + '</thead><tbody>' + body + newRow + '</tbody></table>';
      const ab = document.getElementById('cAdd'); if (ab) ab.disabled = (editingId === 'new');
      wire();
    }
    const gather = (tr) => { const d = {}; tr.querySelectorAll('[data-f]').forEach((el) => { d[el.dataset.f] = el.value; }); return d; };

    async function save(tr, id) {
      msg.className = 'msg'; const d = gather(tr);
      if (!d.name.trim()) { msg.textContent = 'Podaj nazwę kontrahenta'; return; }
      try {
        if (id === 'new') await api('/contractors', 'POST', d);
        else await api('/contractors/' + id, 'PUT', d);
        editingId = null; draft = null; rows = await api('/contractors'); render();
        toast(id === 'new' ? 'Dodano' : 'Zapisano');
      } catch (err) { msg.textContent = err.message; }
    }
    async function remove(id) {
      try { await api('/contractors/' + id, 'DELETE'); confirmId = null; rows = await api('/contractors'); render(); toast('Usunięto'); }
      catch (err) { msg.className = 'msg'; msg.textContent = err.message; }
    }
    function wire() {
      const er = wrap.querySelector('.edit-row');
      if (er) {
        er.querySelector('.save').addEventListener('click', () => save(er, er.dataset.id));
        er.querySelector('.cancel').addEventListener('click', () => { editingId = null; draft = null; render(); });
      }
      wrap.querySelectorAll('tr[data-id]').forEach((tr) => {
        if (tr.classList.contains('edit-row')) return;
        const id = tr.dataset.id;
        const mb = tr.querySelector('.row-menu-btn');
        if (mb) mb.addEventListener('click', (e) => {
          e.stopPropagation();
          openRowMenu(mb, [
            { label: T('Edytuj'), onClick: () => { editingId = id; draft = fromRow(rows.find((r) => String(r.id) === id)); render(); const f = wrap.querySelector('.edit-row input'); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); } } },
            { label: T('Usuń'), danger: true, onClick: () => { if (confirm(T('Usunąć kontrahenta?'))) remove(id); } }
          ]);
        });
      });
    }
    function highlightRow() {
      const id = new URLSearchParams(location.search).get('highlight');
      if (!id) return;
      const tr = wrap.querySelector('tr[data-id="' + id + '"]');
      if (tr) { tr.classList.add('row-highlight'); tr.scrollIntoView({ block: 'center' }); }
    }

    try { rows = await api('/contractors'); } catch (e) { return; }
    render();
    highlightRow();
  };
})();
