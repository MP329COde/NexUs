// Client HTTP minimal vers le backend. Le frontend ne parle jamais directement
// aux services d'infrastructure : tout transite par /api (cf. consigne de sécurité).

// Notifications globales (toasts) sur les vraies pannes — réseau injoignable,
// erreurs serveur 5xx — pas sur les 4xx : ce sont pour la plupart des états
// attendus (ex. intégration "non configurée" → 409) déjà rendus par chaque
// page ; les remonter en toast créerait un bruit permanent au polling.
let globalErrorHandler = null;
export function setGlobalErrorHandler(fn) {
  globalErrorHandler = fn;
}

let lastNotified = { message: null, at: 0 };
function notifyGlobalError(message) {
  if (!globalErrorHandler) return;
  const now = Date.now();
  if (message === lastNotified.message && now - lastNotified.at < 8000) return;
  lastNotified = { message, at: now };
  globalErrorHandler(message);
}

// Double-submit CSRF (voir backend/src/middleware/auth.js#csrfProtection) :
// le cookie nexus_csrf n'est pas httpOnly, on le relit ici pour le renvoyer
// tel quel en en-tête sur toute requête mutative.
function readCsrfCookie() {
  const match = document.cookie.match(/(?:^|; )nexus_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function request(path, options = {}) {
  let res;
  try {
    const method = options.method || 'GET';
    const csrfToken = MUTATING_METHODS.has(method) ? readCsrfCookie() : null;
    res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(options.headers || {})
      },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    const message = 'Impossible de joindre le serveur — vérifiez votre connexion.';
    notifyGlobalError(message);
    throw new Error(message);
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    const message = data?.error || `Erreur ${res.status}`;
    if (res.status >= 500) notifyGlobalError(message);
    const err = new Error(message);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' })
};
