import axios from 'axios';

// Erreur normalisée pour toutes les intégrations: le frontend affiche
// toujours { configured, ok, message } plutôt qu'une stack trace brute.
export class IntegrationError extends Error {
  constructor(message, { status = 502, cause } = {}) {
    super(message);
    this.status = status;
    this.cause = cause;
  }
}

export function buildClient(baseURL, opts = {}) {
  return axios.create({
    baseURL,
    timeout: opts.timeout || 8000,
    headers: opts.headers || {},
    auth: opts.auth,
    httpsAgent: opts.httpsAgent,
    validateStatus: () => true
  });
}

export async function request(client, config, errorLabel) {
  let res;
  try {
    res = await client.request(config);
  } catch (err) {
    throw new IntegrationError(`${errorLabel}: connexion impossible (${err.code || err.message})`, { status: 502, cause: err });
  }
  if (res.status >= 400) {
    const detail = typeof res.data === 'string' ? res.data.slice(0, 300) : JSON.stringify(res.data)?.slice(0, 300);
    throw new IntegrationError(`${errorLabel}: ${res.status} ${detail || ''}`.trim(), { status: res.status === 401 || res.status === 403 ? 401 : 502 });
  }
  return res.data;
}

export function notConfigured(label) {
  return { configured: false, ok: false, message: `${label} n'est pas encore configuré (voir Paramètres).` };
}
