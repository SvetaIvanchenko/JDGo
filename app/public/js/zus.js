// Kalkulator składek ZUS dla JDG (orientacyjny). Użycie: initZus().
// Wartości bazowe 2026 są edytowalne — przepisy i kwoty zmieniają się co roku,
// więc kalkulator liczy ze zmiennych pokazanych na stronie (źródło: zus.pl).
(function () {
  const T = (s) => (window.t ? window.t(s) : s);
  const fmt = (n) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const num = (id) => Number(String(document.getElementById(id).value).replace(',', '.')) || 0;

  // Stawki składek społecznych (% podstawy) — stabilne, ustawowe.
  const RATE = { emer: 0.1952, rent: 0.08, chor: 0.0245, wyp: 0.0167, fp: 0.0245 };

  // Domyślne wartości bazowe 2026 (orientacyjne — zweryfikuj na zus.pl).
  const D = {
    podstPelny: 5652.45,   // 60% prognozowanego przeciętnego wynagrodzenia
    podstPref: 1441.80,    // 30% minimalnego wynagrodzenia (4806 zł)
    zdrMin: 432.54,        // minimalna składka zdrowotna (skala/liniowy)
    zdrSkala: 0.09,        // 9% dochodu
    zdrLiniowy: 0.049,     // 4,9% dochodu
    zdrRycz1: 498.35,      // ryczałt: przychód ≤ 60 000 zł
    zdrRycz2: 830.58,      // ryczałt: 60 000–300 000 zł
    zdrRycz3: 1494.05      // ryczałt: > 300 000 zł
  };

  window.initZus = function () {
    const app = document.getElementById('app');
    app.innerHTML =
      '<h1 class="page-title">Składki ZUS</h1>' +
      '<p class="page-sub">Orientacyjny kalkulator miesięcznych składek przedsiębiorcy (społeczne + zdrowotna). Termin płatności: do 20. dnia następnego miesiąca.</p>' +
      '<div class="kurs-grid">' +
        '<div class="dash-card"><h2><span class="card-h">Parametry</span></h2>' +
          '<div class="op-grid">' +
            '<label>Schemat składek<select id="zScheme">' +
              '<option value="pelny">Pełny ZUS</option>' +
              '<option value="pref">Preferencyjne składki (24 mies.)</option>' +
              '<option value="start">Ulga na start (6 mies.)</option>' +
            '</select></label>' +
            '<label>Forma opodatkowania<select id="zForm">' +
              '<option value="skala">Skala podatkowa</option>' +
              '<option value="liniowy">Podatek liniowy</option>' +
              '<option value="ryczalt">Ryczałt</option>' +
            '</select></label>' +
            '<label id="zIncWrap">Dochód miesięczny (zł)<input type="number" step="0.01" min="0" id="zIncome" value="10000"></label>' +
            '<label id="zRevWrap" style="display:none">Przychód roczny (zł)<input type="number" step="0.01" min="0" id="zRevenue" value="120000"></label>' +
          '</div>' +
          '<label class="zus-check"><input type="checkbox" id="zChor" checked> Dobrowolne ubezpieczenie chorobowe</label>' +
          '<details class="zus-adv"><summary>Parametry bazowe 2026 (edytowalne)</summary>' +
            '<div class="op-grid" style="margin-top:12px">' +
              '<label>Podstawa — pełny ZUS<input type="number" step="0.01" id="zPodPelny" value="' + D.podstPelny + '"></label>' +
              '<label>Podstawa — preferencyjne<input type="number" step="0.01" id="zPodPref" value="' + D.podstPref + '"></label>' +
              '<label>Min. składka zdrowotna<input type="number" step="0.01" id="zZdrMin" value="' + D.zdrMin + '"></label>' +
            '</div>' +
            '<p class="kurs-note">Kwoty orientacyjne na 2026 r. Zweryfikuj aktualne wartości na ' +
              '<a class="ext-link-text" href="https://www.zus.pl" target="_blank" rel="noopener noreferrer">zus.pl</a> lub ' +
              '<a class="ext-link-text" href="https://www.biznes.gov.pl" target="_blank" rel="noopener noreferrer">biznes.gov.pl</a>.</p>' +
          '</details>' +
        '</div>' +
        '<div class="dash-card"><h2><span class="card-h">Składki miesięczne</span></h2>' +
          '<div id="zResult"></div>' +
        '</div>' +
      '</div>';

    const form = document.getElementById('zForm');
    const scheme = document.getElementById('zScheme');

    function syncInputs() {
      const ryczalt = form.value === 'ryczalt';
      document.getElementById('zRevWrap').style.display = ryczalt ? '' : 'none';
      document.getElementById('zIncWrap').style.display = ryczalt ? 'none' : '';
    }

    function zdrowotna() {
      const f = form.value;
      if (f === 'ryczalt') {
        const rev = num('zRevenue');
        if (rev <= 60000) return D.zdrRycz1;
        if (rev <= 300000) return D.zdrRycz2;
        return D.zdrRycz3;
      }
      const base = num('zIncome');
      const pct = f === 'liniowy' ? D.zdrLiniowy : D.zdrSkala;
      return Math.max(base * pct, num('zZdrMin'));
    }

    function compute() {
      syncInputs();
      const s = scheme.value;
      const chor = document.getElementById('zChor').checked;
      // Podstawa i składki społeczne
      let base = 0, rows = [], spoleczne = 0;
      if (s === 'start') {
        rows.push(['Składki społeczne', '— (zwolnienie)']);
      } else {
        base = s === 'pelny' ? num('zPodPelny') : num('zPodPref');
        const emer = base * RATE.emer, rent = base * RATE.rent,
              wyp = base * RATE.wyp, chorS = chor ? base * RATE.chor : 0,
              fp = s === 'pelny' ? base * RATE.fp : 0; // FP tylko przy pełnym ZUS
        spoleczne = emer + rent + wyp + chorS + fp;
        rows.push(['Emerytalna (19,52%)', fmt(emer) + ' zł']);
        rows.push(['Rentowa (8,00%)', fmt(rent) + ' zł']);
        if (chor) rows.push(['Chorobowa (2,45%)', fmt(chorS) + ' zł']);
        rows.push(['Wypadkowa (1,67%)', fmt(wyp) + ' zł']);
        if (fp) rows.push(['Fundusz Pracy (2,45%)', fmt(fp) + ' zł']);
      }
      const zdr = zdrowotna();
      const total = spoleczne + zdr;

      const body = rows.map((r) => '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td></tr>').join('') +
        (s !== 'start' ? '<tr class="zus-sum"><td>Razem społeczne</td><td class="num">' + fmt(spoleczne) + ' zł</td></tr>' : '') +
        '<tr><td>Składka zdrowotna</td><td class="num">' + fmt(zdr) + ' zł</td></tr>';
      document.getElementById('zResult').innerHTML =
        '<table class="data-table"><tbody>' + body +
        '<tr class="zus-total"><td><b>Razem do zapłaty</b></td><td class="num"><b>' + fmt(total) + ' zł</b></td></tr>' +
        '</tbody></table>' +
        '<p class="kurs-note">Termin zapłaty: <b>do 20. dnia</b> następnego miesiąca. ' +
        (s === 'start' ? 'Ulga na start: brak składek społecznych, płacisz tylko zdrowotną.' : '') +
        '</p>';
    }

    app.querySelectorAll('select, input').forEach((el) => {
      el.addEventListener('input', compute);
      el.addEventListener('change', compute);
    });
    compute();
  };
})();
