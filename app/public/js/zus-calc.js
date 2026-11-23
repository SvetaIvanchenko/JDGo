// Wspólna logika składek ZUS — używana przez kalkulator, pulpit i zestawienia.
// Wartości bazowe 2026 orientacyjne (zweryfikuj na zus.pl); stawki składek stałe.
window.ZUS = (function () {
  const RATE = { emer: 0.1952, rent: 0.08, chor: 0.0245, wyp: 0.0167, fp: 0.0245 };
  const DEF = {
    podstPelny: 5652.00,   // 60% prognozowanego przeciętnego wynagrodzenia 2026 (9420 zł)
    podstPref: 1441.80,    // 30% minimalnego wynagrodzenia 2026 (4806 zł)
    zdrMin: 432.54,        // minimalna składka zdrowotna 2026 (skala/liniowy)
    zdrSkala: 0.09, zdrLiniowy: 0.049,
    zdrRycz1: 498.35, zdrRycz2: 830.58, zdrRycz3: 1495.04  // ryczałt wg progów przychodu 2026
  };

  function zdrowotna(form, income, revenue, def) {
    def = def || DEF;
    if (form === 'ryczalt') {
      const r = Number(revenue) || 0;
      return r <= 60000 ? def.zdrRycz1 : (r <= 300000 ? def.zdrRycz2 : def.zdrRycz3);
    }
    const pct = form === 'liniowy' ? def.zdrLiniowy : def.zdrSkala;
    return Math.max((Number(income) || 0) * pct, def.zdrMin);
  }

  function spoleczne(scheme, chorobowe, def) {
    def = def || DEF;
    if (scheme === 'start' || scheme === 'none' || !scheme) return { total: 0, rows: [], base: 0 };
    const base = scheme === 'pelny' ? def.podstPelny : def.podstPref;
    const emer = base * RATE.emer, rent = base * RATE.rent, wyp = base * RATE.wyp,
          chor = chorobowe ? base * RATE.chor : 0, fp = scheme === 'pelny' ? base * RATE.fp : 0;
    const rows = [['Emerytalna (19,52%)', emer], ['Rentowa (8,00%)', rent]];
    if (chorobowe) rows.push(['Chorobowa (2,45%)', chor]);
    rows.push(['Wypadkowa (1,67%)', wyp]);
    if (fp) rows.push(['Fundusz Pracy (2,45%)', fp]);
    return { total: emer + rent + wyp + chor + fp, rows, base };
  }

  // monthly({scheme, chorobowe, form, income, revenue, def}) -> {spoleczne, zdrowotna, total, rows, configured}
  function monthly(o) {
    o = o || {};
    if (o.scheme === 'none' || !o.scheme) return { spoleczne: 0, zdrowotna: 0, total: 0, rows: [], configured: false };
    const soc = spoleczne(o.scheme, o.chorobowe, o.def);
    const zdr = zdrowotna(o.form, o.income, o.revenue, o.def);
    return { spoleczne: soc.total, zdrowotna: zdr, total: soc.total + zdr, rows: soc.rows, base: soc.base, configured: true };
  }

  return { RATE, DEF, zdrowotna, spoleczne, monthly };
})();
