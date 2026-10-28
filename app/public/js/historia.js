// Historia zmian — dziennik audytu (operacje / faktury / kontrahenci). Użycie: initHistory().
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ENTITY = { operacja: 'Operacja', invoices: 'Faktura', contractors: 'Kontrahent' };
  const ACTION = { INSERT: 'Dodano', UPDATE: 'Zmieniono', DELETE: 'Usunięto' };
  const ACTION_CLS = { INSERT: 'ok', UPDATE: '', DELETE: 'warn' };

  window.initHistory = async function () {
    const app = document.getElementById('app');
    app.innerHTML =
      '<h1 class="page-title">Historia zmian</h1>' +
      '<p class="page-sub">Dziennik zmian danych (operacje, faktury, kontrahenci) — rejestrowany w bazie.</p>' +
      '<div id="hWrap" class="table-wrap"></div><p id="hMsg" class="msg"></p>';
    const wrap = document.getElementById('hWrap');
    const msg = document.getElementById('hMsg');

    let rows;
    try { rows = await api('/reports/history?limit=200'); }
    catch (e) { msg.textContent = e.message; return; }

    if (!rows.length) {
      wrap.innerHTML = '<div class="table-empty">Brak zarejestrowanych zmian.</div>';
      return;
    }
    const body = rows.map((r) => {
      const pill = '<span class="pill ' + (ACTION_CLS[r.action] || '') + '">' + (ACTION[r.action] || r.action) + '</span>';
      return '<tr><td>' + r.changed_at + '</td>' +
        '<td>' + (ENTITY[r.entity] || r.entity) + '</td>' +
        '<td class="num">' + (r.entity_id == null ? '—' : r.entity_id) + '</td>' +
        '<td>' + pill + '</td>' +
        '<td class="wrap">' + esc(r.label) + '</td></tr>';
    }).join('');
    wrap.innerHTML =
      '<table class="data-table"><thead><tr>' +
      '<th>Data i godzina</th><th>Obiekt</th><th class="num">ID</th><th>Typ zmiany</th><th>Opis</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>';
  };
})();
