// Wykresy przychodów i kosztów (WF-R2). Wymaga Chart.js (CDN). Użycie: initCharts().
// Część wykresów korzysta z widoków analitycznych bazy (funkcje okna): saldo narastające
// (SUM OVER) oraz ranking kontrahentów (v_top_contractors, RANK OVER).
(function () {
  const MONTHS = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
  const PALETTE = ['#15803d', '#2563eb', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d', '#9333ea', '#ea580c', '#0d9488'];
  const GREEN = '#15803d', RED = '#d1493f';
  const money = (v) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0) + ' zł';
  const charts = {};
  const draw = (key, ctxId, cfg) => {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(document.getElementById(ctxId), cfg);
  };

  const T = (s) => (window.t ? window.t(s) : s);

  window.initCharts = async function () {
    const now = new Date();
    const app = document.getElementById('app');
    let opts = '';
    for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) {
      opts += '<option' + (y === now.getFullYear() ? ' selected' : '') + '>' + y + '</option>';
    }
    app.innerHTML =
      '<div class="page-head"><h1 class="page-title">Wykresy</h1>' +
      '<label class="filters" style="margin:0">Rok <select id="wYear">' + opts + '</select></label></div>' +
      '<p class="page-sub">Analiza przychodów, kosztów i kontrahentów.</p>' +

      '<div class="form-title">Przychody i koszty miesięcznie</div>' +
      '<div class="panel" style="min-height:0;padding:18px"><canvas id="barC" height="120"></canvas></div>' +

      '<div class="form-title">Wynik (dochód) miesięcznie</div>' +
      '<div class="panel" style="min-height:0;padding:18px"><canvas id="wynikC" height="120"></canvas></div>' +

      '<div class="dash-grid" style="margin-top:22px">' +
      '<div class="dash-card"><h2>Struktura przychodów wg kategorii</h2><canvas id="incC" height="220"></canvas>' +
      '<div id="incEmpty" class="dash-empty" style="display:none">Brak przychodów w tym roku.</div></div>' +
      '<div class="dash-card"><h2>Struktura kosztów wg kategorii</h2><canvas id="dC" height="220"></canvas>' +
      '<div id="costEmpty" class="dash-empty" style="display:none">Brak kosztów w tym roku.</div></div>' +
      '</div>' +

      '<div class="form-title">Saldo narastające (cały okres)</div>' +
      '<div class="panel" style="min-height:0;padding:18px"><canvas id="saldoC" height="120"></canvas>' +
      '<div id="saldoEmpty" class="dash-empty" style="display:none">Brak operacji.</div></div>' +

      '<div class="form-title">Top kontrahenci wg obrotu (cały okres)</div>' +
      '<div class="panel" style="min-height:0;padding:18px;max-width:640px"><canvas id="topC" height="200"></canvas>' +
      '<div id="topEmpty" class="dash-empty" style="display:none">Brak kontrahentów z obrotem.</div></div>' +

      '<p id="wMsg" class="msg"></p>';

    const msg = document.getElementById('wMsg');
    if (typeof Chart === 'undefined') { msg.textContent = 'Nie udało się załadować biblioteki wykresów (Chart.js).'; return; }
    const pct = { plugins: { legend: { position: 'right' } } };

    // Wykresy zależne od roku (przeładowanie po zmianie roku).
    async function loadYear() {
      msg.className = 'msg';
      let data;
      try { data = await api('/reports/monthly?year=' + document.getElementById('wYear').value); }
      catch (e) { msg.textContent = e.message; return; }

      const przy = data.months.map((m) => Number(m.przychod));
      const kosz = data.months.map((m) => Number(m.koszt));
      draw('bar', 'barC', {
        type: 'bar',
        data: { labels: MONTHS.map(T), datasets: [
          { label: T('Przychody'), data: przy, backgroundColor: GREEN },
          { label: T('Koszty'), data: kosz, backgroundColor: RED }
        ] },
        options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: true } } }
      });

      // Wynik miesięczny (dochód), ujemne słupki na czerwono.
      const wynik = przy.map((v, i) => Math.round((v - kosz[i]) * 100) / 100);
      draw('wynik', 'wynikC', {
        type: 'bar',
        data: { labels: MONTHS.map(T), datasets: [
          { label: T('Wynik'), data: wynik, backgroundColor: wynik.map((v) => (v < 0 ? RED : GREEN)) }
        ] },
        options: {
          responsive: true, plugins: { legend: { display: false },
            tooltip: { callbacks: { label: (c) => money(c.raw) } } },
          scales: { y: { beginAtZero: true } }
        }
      });

      // Doughnut przychodów i kosztów wg kategorii.
      renderDoughnut('inc', 'incC', 'incEmpty', data.byCategory.filter((r) => r.type === 'przychod'));
      renderDoughnut('cost', 'dC', 'costEmpty', data.byCategory.filter((r) => r.type === 'koszt'));
    }

    function renderDoughnut(key, ctxId, emptyId, cats) {
      const empty = document.getElementById(emptyId);
      const canvas = document.getElementById(ctxId);
      if (charts[key]) charts[key].destroy();
      if (!cats.length) { canvas.style.display = 'none'; empty.style.display = 'block'; return; }
      canvas.style.display = 'block'; empty.style.display = 'none';
      charts[key] = new Chart(canvas, {
        type: 'doughnut',
        data: { labels: cats.map((c) => c.cat), datasets: [{ data: cats.map((c) => Number(c.net)), backgroundColor: PALETTE }] },
        options: { responsive: true, ...pct }
      });
    }

    // Wykresy dla całego okresu (widoki analityczne) — ładowane raz.
    async function loadAnalytics() {
      let a;
      try { a = await api('/reports/analytics'); } catch (e) { msg.textContent = e.message; return; }

      const saldoEmpty = document.getElementById('saldoEmpty');
      if (!a.runningBalance.length) {
        document.getElementById('saldoC').style.display = 'none'; saldoEmpty.style.display = 'block';
      } else {
        draw('saldo', 'saldoC', {
          type: 'line',
          data: { labels: a.runningBalance.map((r) => r.date), datasets: [
            { label: T('Saldo'), data: a.runningBalance.map((r) => Number(r.saldo)),
              borderColor: GREEN, backgroundColor: 'rgba(21,128,61,0.12)', fill: true, tension: 0.25, pointRadius: 2 }
          ] },
          options: {
            responsive: true, plugins: { legend: { display: false },
              tooltip: { callbacks: { label: (c) => money(c.raw) } } },
            scales: { y: { beginAtZero: false } }
          }
        });
      }

      const topEmpty = document.getElementById('topEmpty');
      if (!a.topContractors.length) {
        document.getElementById('topC').style.display = 'none'; topEmpty.style.display = 'block';
      } else {
        draw('top', 'topC', {
          type: 'bar',
          data: { labels: a.topContractors.map((c) => c.contractor_name), datasets: [
            { label: T('Obrót'), data: a.topContractors.map((c) => Number(c.obrot)), backgroundColor: '#2563eb' }
          ] },
          options: {
            indexAxis: 'y', responsive: true,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => money(c.raw) } } },
            scales: { x: { beginAtZero: true } }
          }
        });
      }
    }

    document.getElementById('wYear').addEventListener('change', loadYear);
    loadYear();
    loadAnalytics();
  };
})();
