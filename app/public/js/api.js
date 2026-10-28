// Pomocnik do wywolan REST API. Zwraca dane JSON lub rzuca blad z komunikatem.
async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Wystapil blad');
  }
  return data;
}
