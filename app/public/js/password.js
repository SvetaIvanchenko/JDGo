// Wzmocnienie pol hasla: podglad (pokaz/ukryj), wskaznik sily i lista wymagan.
// Uzycie: enhancePassword(input, true)  -> z miernikiem sily
//         enhancePassword(input, false) -> tylko przycisk pokaz/ukryj
(function () {
  const SVG = (cls, inner) => '<svg class="' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  const EYE = '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>';
  const EYE_OFF = '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>';
  const REQ_IC = SVG('ri ri-empty', '<circle cx="12" cy="12" r="10"/>') + SVG('ri ri-check', '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>');

  function evaluate(pw) {
    const checks = {
      len:     pw.length >= 10,
      upper:   /[A-Z]/.test(pw),
      digit:   /[0-9]/.test(pw),
      special: /[^A-Za-z0-9]/.test(pw),
    };
    checks.valid = checks.len && checks.upper && checks.digit && checks.special;
    const score = (checks.len ? 1 : 0) + (checks.upper ? 1 : 0) +
                  (checks.digit ? 1 : 0) + (checks.special ? 1 : 0);
    return { checks, score };
  }

  // Globalna walidacja (do uzycia przy wysylce formularza)
  window.passwordValid = (pw) => evaluate(pw).checks.valid;

  window.enhancePassword = function (input, showMeter) {
    if (!input || input.dataset.enhanced) return;
    input.dataset.enhanced = '1';

    // przycisk pokaz/ukryj
    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'pw-toggle';
    toggle.innerHTML = SVG('pw-eye', EYE) + '<span>Pokaż</span>';
    wrap.appendChild(toggle);
    toggle.addEventListener('click', () => {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      toggle.innerHTML = SVG('pw-eye', hidden ? EYE_OFF : EYE) + '<span>' + (hidden ? 'Ukryj' : 'Pokaż') + '</span>';
    });

    if (!showMeter) return;

    const meter = document.createElement('div'); meter.className = 'pw-meter';
    const fill = document.createElement('div'); fill.className = 'pw-meter-fill';
    meter.appendChild(fill);
    const label = document.createElement('div'); label.className = 'pw-strength';
    const reqs = document.createElement('ul'); reqs.className = 'pw-reqs';
    reqs.innerHTML =
      '<li data-k="len">' + REQ_IC + '<span>Min. 10 znaków</span></li>' +
      '<li data-k="upper">' + REQ_IC + '<span>Wielka litera</span></li>' +
      '<li data-k="digit">' + REQ_IC + '<span>Cyfra</span></li>' +
      '<li data-k="special">' + REQ_IC + '<span>Znak specjalny (! ? * - …)</span></li>';

    wrap.insertAdjacentElement('afterend', reqs);
    wrap.insertAdjacentElement('afterend', label);
    wrap.insertAdjacentElement('afterend', meter);

    const colors = ['#b91c1c', '#b91c1c', '#d97706', '#639922', '#15803d'];
    const names  = ['Bardzo słabe', 'Słabe', 'Średnie', 'Dobre', 'Silne'];

    input.addEventListener('input', () => {
      const { checks, score } = evaluate(input.value);
      const pct = input.value ? Math.max(score, 1) / 4 * 100 : 0;
      fill.style.width = Math.min(pct, 100) + '%';
      fill.style.backgroundColor = colors[score];
      label.textContent = input.value ? 'Siła hasła: ' + names[score] : '';
      reqs.querySelectorAll('li').forEach((li) =>
        li.classList.toggle('ok', !!checks[li.dataset.k]));
    });
  };
})();
