// Wysyłka e-maili transakcyjnych przez Resend (https://resend.com).
// Tryb dev: bez RESEND_API_KEY nic nie wysyła — loguje treść (link/kod) do konsoli.
// Konfiguracja: RESEND_API_KEY, MAIL_FROM, APP_URL.

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'JDGo <onboarding@resend.dev>';
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Wspólny "szkielet" e-maila — układ tabelowy (zgodność z Gmail/Outlook),
// style inline, czcionki systemowe, logo JDGo, stopka. bodyHtml = środek karty.
function shell({ title, intro, bodyHtml, note, preheader }) {
  const font = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f4f5f6;">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all">${preheader || title}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f6;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
      <!-- Logo -->
      <tr><td style="padding:0 4px 18px;font-family:${font};font-size:22px;font-weight:700;letter-spacing:-0.2px;">
        <span style="color:#15663b;">JDG</span><span style="color:#4a9e6f;">o</span>
      </td></tr>
      <!-- Karta -->
      <tr><td style="background:#ffffff;border:1px solid #e4e7ea;border-radius:10px;padding:34px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="font-family:${font};font-size:19px;font-weight:600;color:#15181b;padding:0 0 12px;">${title}</td></tr>
          <tr><td style="font-family:${font};font-size:14px;line-height:1.65;color:#3a4047;padding:0 0 24px;">${intro}</td></tr>
          <tr><td>${bodyHtml}</td></tr>
          <tr><td style="font-family:${font};font-size:12px;line-height:1.6;color:#6b7177;padding:24px 0 0;border-top:1px solid #eef0f2;margin-top:24px;">${note}</td></tr>
        </table>
      </td></tr>
      <!-- Stopka -->
      <tr><td style="font-family:${font};font-size:11px;line-height:1.6;color:#9aa0a6;padding:18px 4px 0;">
        Wiadomość automatyczna z aplikacji <strong style="color:#6b7177;">JDGo</strong>. Jeśli to nie Ty — zignoruj ten e-mail.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Przycisk "bulletproof" (tabelowy — działa też w Outlooku).
function button(text, url) {
  const font = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td align="center" bgcolor="#15663b" style="border-radius:8px;">
      <a href="${url}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${text}</a>
    </td></tr></table>`;
}

// Szablon z przyciskiem-linkiem.
function linkLayout(title, intro, btnText, url, note) {
  const font = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const body = button(btnText, url) +
    `<p style="font-family:${font};font-size:12px;line-height:1.5;color:#9aa0a6;margin:18px 0 0;word-break:break-all;">
      Jeśli przycisk nie działa, skopiuj ten adres do przeglądarki:<br>
      <a href="${url}" target="_blank" style="color:#15663b;">${url}</a></p>`;
  return shell({ title, intro, bodyHtml: body, note });
}

// Szablon z kodem jednorazowym.
function codeLayout(title, intro, code, note) {
  const font = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td align="center" style="background:#f4f6f5;border:1px solid #d9e5df;border-radius:10px;padding:20px 16px;">
      <div style="font-family:${font};font-size:34px;font-weight:700;letter-spacing:10px;color:#15663b;">${code}</div>
    </td></tr></table>`;
  return shell({ title, intro, bodyHtml: body, note, preheader: 'Twój kod logowania: ' + code });
}

async function sendMail({ to, subject, html, devInfo }) {
  if (!KEY) {
    console.log('\n[MAIL dev] ───────────────────────────────');
    console.log('[MAIL dev] do:    ', to);
    console.log('[MAIL dev] temat: ', subject);
    if (devInfo) console.log('[MAIL dev] ' + devInfo);
    console.log('[MAIL dev] ───────────────────────────────\n');
    return { dev: true };
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'JDGo/1.0',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  return res.json();
}

// Odzyskiwanie dostępu — link jednorazowego logowania.
function sendRecovery(to, rawToken) {
  const url = `${APP_URL}/pages/recovery.html?token=${rawToken}`;
  return sendMail({
    to, subject: 'Odzyskiwanie dostępu do JDGo',
    devInfo: 'LINK:  ' + url,
    html: linkLayout('Odzyskiwanie dostępu',
      'Kliknij przycisk, aby jednorazowo zalogować się do JDGo. Po wejściu zmień hasło w ustawieniach konta.',
      'Zaloguj się', url, 'Link jest ważny 15 minut. Jeśli to nie Ty — zignoruj ten e-mail.'),
  });
}

// Druga metoda logowania — jednorazowy 6-cyfrowy kod.
function sendLoginCode(to, code) {
  return sendMail({
    to, subject: 'Kod logowania do JDGo',
    devInfo: 'KOD:   ' + code,
    html: codeLayout('Twój kod logowania',
      'Wpisz poniższy kod w oknie logowania, aby dokończyć logowanie do JDGo:',
      code, 'Kod jest ważny 15 minut. Jeśli to nie Ty próbujesz się zalogować — zignoruj ten e-mail.'),
  });
}

module.exports = { sendMail, sendRecovery, sendLoginCode, APP_URL };
