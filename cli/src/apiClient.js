// Client HTTP minimal, sans dépendance : réutilise l'API déjà réelle de la
// console (routes/*.js), authentifié soit par le JWT de session réémis en
// Bearer (après `nexus login`), soit par un jeton de Service Account
// (nxs_sa_..., voir middleware/serviceAuth.js) — les deux acceptent
// Authorization: Bearer, csrfProtection les exempte déjà du double-submit
// (réservé aux requêtes authentifiées par cookie navigateur).
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export function createClient({ baseUrl, token }) {
  async function request(method, path, body) {
    const res = await fetch(`${baseUrl}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { /* réponse vide (ex. 204) */ }
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    del: (path) => request('DELETE', path)
  };
}

// Login : distinct des autres appels car la session émise arrive en
// Set-Cookie (issueSessionCookies côté serveur), jamais dans le corps JSON —
// on récupère le JWT directement depuis l'en-tête pour le réutiliser ensuite
// en Bearer, sans avoir à gérer de pot de cookies côté CLI.
export async function login(baseUrl, identifier, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);

  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  const sessionCookie = cookies.find((c) => c.startsWith('nexus_session='));
  if (!sessionCookie) throw new Error('Connexion réussie mais aucun cookie de session reçu — réponse inattendue du serveur.');
  const token = sessionCookie.split(';')[0].split('=')[1];
  return { token, user: data.user };
}
