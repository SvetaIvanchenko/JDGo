// Import: operacje z CSV (WF-14) oraz faktura z XML KSeF FA(3) (WF-R1). Użycie: initImport().
(function () {
  const T = (s) => (window.t ? window.t(s) : s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const VAT_BY_CODE = { '23': 1, '8': 2, '5': 3, '0': 4, 'zw': 5 };
  const STAWKI = ['23', '8', '5', '0', 'zw'];
  function toast(t) { let e = document.querySelector('.toast'); if (!e) { e = document.createElement('div'); e.className = 'toast'; document.body.appendChild(e); } e.textContent = t; requestAnimationFrame(() => e.classList.add('show')); clearTimeout(e._h); e._h = setTimeout(() => e.classList.remove('show'), 1800); }

  // --- CSV ---
  function parseCSV(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) return { header: [], rows: [] };
    const delim = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
    const parseLine = (line) => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else { if (ch === '"') q = true; else if (ch === delim) { out.push(cur); cur = ''; } else cur += ch; }
      }
      out.push(cur); return out;
    };
    const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map(parseLine);
    return { header, rows };
  }

  window.initImport = async function () {
    const app = document.getElementById('app');
    app.innerHTML =
      '<h1 class="page-title">Import</h1>' +
      '<p class="page-sub">Zaimportuj operacje z pliku CSV lub fakturę ze struktury KSeF (XML FA(3)).</p>' +

      '<div class="op-form"><div class="form-title">Import operacji z CSV</div>' +
      '<p class="page-sub" style="margin:0 0 10px">Kolumny: <code>typ, data, kontrahent, kategoria, opis, stawka, waluta, kwota_netto</code>. ' +
      '<a href="#" id="csvTemplate">Pobierz szablon</a></p>' +
      '<input type="file" id="csvFile" accept=".csv,text/csv">' +
      '<div id="csvPreview" style="margin-top:12px"></div>' +
      '<p id="csvMsg" class="msg"></p></div>' +

      '<div class="op-form"><div class="form-title">Import faktury z KSeF (XML FA(3))</div>' +
      '<input type="file" id="xmlFile" accept=".xml,text/xml,application/xml">' +
      '<div id="xmlPreview" style="margin-top:12px"></div>' +
      '<p id="xmlMsg" class="msg"></p></div>';

    let contractors = [];
    try { contractors = await api('/contractors'); } catch (e) { return; }

    // Szablon CSV do pobrania
    document.getElementById('csvTemplate').addEventListener('click', (e) => {
      e.preventDefault();
      const sample = 'typ,data,kontrahent,kategoria,opis,stawka,waluta,kwota_netto\n' +
        'przychod,2026-06-01,Acme Sp. z o.o.,Usługi IT,Projekt X,23,PLN,1000\n' +
        'koszt,2026-06-03,,Paliwo,Tankowanie,23,PLN,200\n';
      const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv' }));
      const a = document.createElement('a'); a.href = url; a.download = 'szablon_import.csv'; a.click();
      URL.revokeObjectURL(url);
    });

    // ---- CSV: wczytanie + podgląd + zapis ----
    const csvPreview = document.getElementById('csvPreview');
    const csvMsg = document.getElementById('csvMsg');
    let csvRows = [];

    document.getElementById('csvFile').addEventListener('change', (e) => {
      csvMsg.className = 'msg'; csvMsg.textContent = '';
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const { header, rows } = parseCSV(reader.result);
        const idx = (name) => header.indexOf(name);
        const cols = ['typ', 'data', 'kontrahent', 'kategoria', 'opis', 'stawka', 'waluta', 'kwota_netto'];
        csvRows = rows.map((r) => ({
          type: r[idx('typ')] || '', operation_date: r[idx('data')] || '', contractor: r[idx('kontrahent')] || '',
          category: r[idx('kategoria')] || '', description: r[idx('opis')] || '',
          stawka: (r[idx('stawka')] || '23').trim(), waluta: (r[idx('waluta')] || 'PLN').trim(), amount_net: r[idx('kwota_netto')] || ''
        }));
        renderCsvPreview();
      };
      reader.readAsText(file, 'UTF-8');
    });

    function validDate(s) {
      s = String(s || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }
    function rowValid(r) {
      if (r.type !== 'przychod' && r.type !== 'koszt') return false;
      if (!validDate(r.operation_date)) return false;
      if (!(STAWKI.indexOf(r.stawka) >= 0)) return false;
      const n = Number(String(r.amount_net).replace(',', '.'));
      return Number.isFinite(n) && n >= 0;
    }

    function renderCsvPreview() {
      if (!csvRows.length) { csvPreview.innerHTML = '<div class="table-empty">Pusty plik.</div>'; return; }
      const okCount = csvRows.filter(rowValid).length;
      const body = csvRows.map((r) => {
        const ok = rowValid(r);
        return '<tr style="' + (ok ? '' : 'background:#fdecea') + '">' +
          '<td>' + (ok ? '✓' : '✕') + '</td><td>' + esc(r.type) + '</td><td>' + esc(r.operation_date) + '</td>' +
          '<td>' + esc(r.contractor || '—') + '</td><td>' + esc(r.category) + '</td><td>' + esc(r.description) + '</td>' +
          '<td>' + esc(r.stawka) + '</td><td>' + esc(r.waluta) + '</td><td class="num">' + esc(r.amount_net) + '</td></tr>';
      }).join('');
      csvPreview.innerHTML = '<div class="table-wrap"><table class="data-table"><thead><tr><th></th><th>Typ</th><th>Data</th>' +
        '<th>Kontrahent</th><th>Kategoria</th><th>Opis</th><th>Stawka</th><th>Waluta</th><th class="num">Netto</th></tr></thead>' +
        '<tbody>' + body + '</tbody></table></div>' +
        '<div style="margin-top:10px"><button class="btn" id="csvSave" style="min-width:auto">' + T('Zapisz') + ' ' + okCount + ' ' + T('poprawnych z') + ' ' + csvRows.length + '</button></div>';
      document.getElementById('csvSave').addEventListener('click', saveCsv);
    }

    async function saveCsv() {
      csvMsg.className = 'msg';
      try {
        const r = await api('/import/operations', 'POST', { rows: csvRows, file_name: 'import.csv' });
        csvMsg.className = 'msg ok';
        let txt = T('Zaimportowano') + ' ' + r.imported + ' / ' + r.total + '.';
        if (r.errors.length) txt += ' ' + T('Pominięto wiersze:') + ' ' + r.errors.map((e) => (e.index + 1) + ' (' + e.error + ')').join(', ');
        csvMsg.textContent = txt;
        toast(T('Zaimportowano') + ' ' + r.imported);
        csvRows = []; csvPreview.innerHTML = ''; document.getElementById('csvFile').value = '';
      } catch (err) { csvMsg.textContent = err.message; }
    }

    // ---- XML KSeF FA(3): parsowanie + podgląd + zapis ----
    const xmlPreview = document.getElementById('xmlPreview');
    const xmlMsg = document.getElementById('xmlMsg');

    const localFind = (root, name) => {
      const walk = (el) => {
        for (const ch of el.children) {
          if (ch.localName === name) return ch;
          const r = walk(ch); if (r) return r;
        }
        return null;
      };
      return walk(root);
    };
    const localFindAll = (root, name) => {
      const res = [];
      const walk = (el) => { for (const ch of el.children) { if (ch.localName === name) res.push(ch); walk(ch); } };
      walk(root); return res;
    };
    const txt = (el, name) => { const e = el ? localFind(el, name) : null; return e ? e.textContent.trim() : ''; };

    document.getElementById('xmlFile').addEventListener('change', (e) => {
      xmlMsg.className = 'msg'; xmlMsg.textContent = '';
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let doc;
        try { doc = new DOMParser().parseFromString(reader.result, 'application/xml'); } catch (err) { xmlMsg.textContent = 'Nie udało się odczytać XML'; return; }
        if (doc.getElementsByTagName('parsererror').length) { xmlMsg.textContent = 'Plik XML jest nieprawidłowy'; return; }
        const root = doc.documentElement;
        const fa = localFind(root, 'Fa') || root;
        const numer = txt(fa, 'P_2');
        const data = txt(fa, 'P_1');
        const sprzedawca = localFind(root, 'Podmiot1');
        const nazwa = txt(sprzedawca, 'Nazwa') || txt(sprzedawca, 'PelnaNazwa');
        const nip = txt(sprzedawca, 'NIP');
        const items = localFindAll(fa, 'FaWiersz').map((w) => ({
          name: txt(w, 'P_7'), quantity: Number((txt(w, 'P_8B') || '1').replace(',', '.')) || 1,
          unit_price_net: Number((txt(w, 'P_9A') || '0').replace(',', '.')) || 0,
          stawka: (txt(w, 'P_12') || '23').trim()
        }));
        renderXmlPreview({ numer, data, nazwa, nip, items });
      };
      reader.readAsText(file, 'UTF-8');
    });

    function renderXmlPreview(inv) {
      if (!inv.items.length) { xmlPreview.innerHTML = '<div class="table-empty">Nie znaleziono pozycji w pliku.</div>'; return; }
      const matched = contractors.find((c) => c.nip && inv.nip && c.nip === inv.nip);
      const contrOpts = '<option value="">— brak —</option>' +
        contractors.map((c) => '<option value="' + c.id + '"' + (matched && matched.id === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');
      const itemsRows = inv.items.map((it) => {
        const net = Math.round(it.quantity * it.unit_price_net * 100) / 100;
        return '<tr><td>' + esc(it.name) + '</td><td class="num">' + fmt(it.quantity) + '</td>' +
          '<td class="num">' + fmt(it.unit_price_net) + '</td><td>' + (it.stawka === 'zw' ? 'zw.' : it.stawka + '%') + '</td>' +
          '<td class="num">' + fmt(net) + '</td></tr>';
      }).join('');
      xmlPreview.innerHTML =
        '<p class="page-sub" style="margin:0 0 8px">Numer: <b>' + esc(inv.numer || '—') + '</b> · Data: ' + esc(inv.data || '—') +
        ' · Sprzedawca: <b>' + esc(inv.nazwa || '—') + '</b>' + (inv.nip ? ' (NIP ' + esc(inv.nip) + ')' : '') + '</p>' +
        '<div class="op-grid" style="max-width:520px">' +
        '<label>Rodzaj<select id="xDir"><option value="zakup">Zakup</option><option value="sprzedaz">Sprzedaż</option></select></label>' +
        '<label>Kontrahent<select id="xContr">' + contrOpts + '</select></label></div>' +
        '<div class="table-wrap" style="margin-top:10px"><table class="data-table"><thead><tr><th>Nazwa</th><th class="num">Ilość</th>' +
        '<th class="num">Cena netto</th><th>VAT</th><th class="num">Netto</th></tr></thead><tbody>' + itemsRows + '</tbody></table></div>' +
        '<div style="margin-top:10px"><button class="btn" id="xmlSave" style="min-width:auto">Zapisz fakturę</button></div>';

      document.getElementById('xmlSave').addEventListener('click', () => saveXml(inv));
    }

    async function saveXml(inv) {
      xmlMsg.className = 'msg';
      const items = inv.items.map((it) => ({
        name: it.name, quantity: it.quantity, unit_price_net: it.unit_price_net,
        vat_rate_id: VAT_BY_CODE[it.stawka] || 1
      }));
      const body = {
        direction: document.getElementById('xDir').value,
        contractor_id: document.getElementById('xContr').value || null,
        invoice_number: inv.numer || null,
        issue_date: /^\d{4}-\d{2}-\d{2}$/.test(inv.data) ? inv.data : null,
        currency: 'PLN', payment_state: 'nieoplacona', items
      };
      try {
        await api('/invoices', 'POST', body);
        xmlMsg.className = 'msg ok';
        xmlMsg.textContent = 'Faktura zaimportowana. Zobacz w zakładce Faktury.';
        toast('Zaimportowano fakturę');
        xmlPreview.innerHTML = ''; document.getElementById('xmlFile').value = '';
      } catch (err) { xmlMsg.textContent = err.message; }
    }
  };
})();
