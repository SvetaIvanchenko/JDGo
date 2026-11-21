// Wysyłka e-maili transakcyjnych przez Resend (https://resend.com).
// Tryb dev: bez RESEND_API_KEY nic nie wysyła — loguje treść (link/kod) do konsoli.
// Konfiguracja: RESEND_API_KEY, MAIL_FROM, APP_URL.

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.MAIL_FROM || 'JDGo <onboarding@resend.dev>';
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Szablon z przyciskiem-linkiem.
function linkLayout(title, intro, btnText, url, note) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f6;font-family:Arial,Helvetica,sans-serif;color:#15181b">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-size:22px;font-weight:700;color:#15663b;margin-bottom:20px">JDGo</div>
    <div style="background:#fff;border:1px solid #e4e7ea;border-radius:8px;padding:28px">
      <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#3a4047">${intro}</p>
      <a href="${url}" style="display:inline-block;background:#15663b;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px">${btnText}</a>
      <p style="font-size:12px;line-height:1.6;color:#6b7177;margin:20px 0 0">${note}</p>
      <p style="font-size:12px;line-height:1.5;color:#9aa0a6;margin:14px 0 0;word-break:break-all">${url}</p>
    </div>
    <p style="font-size:11px;color:#9aa0a6;margin:16px 0 0">Wiadomość automatyczna z aplikacji JDGo. Jeśli to nie Ty — zignoruj ten e-mail.</p>
  </div></body></html>`;
}

// Szablon z kodem jednorazowym.
function codeLayout(title, intro, code, note) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f6;font-family:Arial,Helvetica,sans-serif;color:#15181b">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-size:22px;font-weight:700;color:#15663b;margin-bottom:20px">JDGo</div>
    <div style="background:#fff;border:1px solid #e4e7ea;border-radius:8px;padding:28px">
      <h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 18px;color:#3a4047">${intro}</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:8px;color:#15663b;background:#f4f5f6;border:1px solid #e4e7ea;border-radius:8px;padding:16px;text-align:center">${code}</div>
      <p style="font-size:12px;line-height:1.6;color:#6b7177;margin:18px 0 0">${note}</p>
    </div>
    <p style="font-size:11px;color:#9aa0a6;margin:16px 0 0">Wiadomość automatyczna z aplikacji JDGo. Jeśli to nie Ty — zignoruj ten e-mail.</p>
  </div></body></html>`;
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
      'Zaloguj się', url, 'Link jest ważny 60 minut. Jeśli to nie Ty — zignoruj ten e-mail.'),
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
