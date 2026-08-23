import axios from 'axios';
import https from 'node:https';

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

// Construit l'agent HTTPS d'une intégration à partir de sa config brute
// (cfg.allowSelfSigned / cfg.caCertPem). Par défaut (allowSelfSigned absent
// ou false), la vérification TLS reste stricte — on ne désactive jamais la
// vérification sans action explicite de l'utilisateur dans les Paramètres.
// Retourne undefined si rien n'a été configuré : axios/Node utilisent alors
// leur agent HTTPS par défaut (vérification stricte), inchangé.
export function buildHttpsAgentFromConfig(cfg = {}) {
  if (!cfg.allowSelfSigned && !cfg.caCertPem) return undefined;
  return new https.Agent({
    rejectUnauthorized: !cfg.allowSelfSigned,
    ca: cfg.caCertPem || undefined
  });
}

// Codes Node.js renvoyés par OpenSSL/tls quand la chaîne de certificats
// présentée par le serveur distant n'est pas vérifiable (typiquement un
// certificat auto-signé ou une CA interne non reconnue par le système).
const TLS_VERIFY_ERROR_CODES = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED'
]);

export async function request(client, config, errorLabel) {
  let res;
  try {
    res = await client.request(config);
  } catch (err) {
    if (TLS_VERIFY_ERROR_CODES.has(err.code)) {
      throw new IntegrationError(
        `${errorLabel}: certificat non vérifiable (${err.code}) — si c'est un certificat auto-signé de confiance, activez « Ignorer la vérification du certificat » dans les paramètres de cette intégration.`,
        { status: 502, cause: err }
      );
    }
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
