import { readStore, writeStore } from './jsonStore.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

// Déclare, pour chaque intégration, les champs sensibles à chiffrer au repos
// et à ne JAMAIS renvoyer en clair au frontend.
export const SECRET_FIELDS = {
  kubernetes: ['token', 'caCert'],
  argocd: ['token'],
  haproxy: ['password'],
  gitlab: ['token'],
  github: ['token'],
  githubPlatform: ['token'],
  gitea: ['token'],
  proxmox: ['tokenSecret'],
  traefik: ['password'],
  certManager: [],
  grafana: ['apiKey'],
  wazuh: ['password'],
  registry: ['password'],
  notificationsWebhook: ['url'],
  ovh: ['appSecret', 'consumerKey'],
  duckdns: ['token'],
  gitBackup: ['token'],
  // Traces distribuées (Priorité 5, Lot 56-nav) : Tempo ou Jaeger, seul le
  // token est sensible (Tempo public sans auth par défaut, Jaeger idem —
  // le champ reste optionnel selon le déploiement).
  tracing: ['token']
};

export const INTEGRATION_KEYS = Object.keys(SECRET_FIELDS);

function assertKnown(key) {
  if (!INTEGRATION_KEYS.includes(key)) throw Object.assign(new Error(`Intégration inconnue: ${key}`), { status: 400 });
}

export function getRawIntegration(key) {
  assertKnown(key);
  const all = readStore('integrations');
  const entry = all[key] || {};
  const secretFields = SECRET_FIELDS[key];
  const decrypted = { ...entry };
  for (const field of secretFields) {
    if (entry[field]) decrypted[field] = decryptSecret(entry[field]);
  }
  return decrypted;
}

// Version sûre pour le frontend: les secrets sont remplacés par un booléen "configured".
export function getRedactedIntegration(key) {
  assertKnown(key);
  const all = readStore('integrations');
  const entry = all[key] || {};
  const secretFields = SECRET_FIELDS[key];
  const redacted = { ...entry };
  for (const field of secretFields) {
    redacted[field] = undefined;
    redacted[`${field}Set`] = Boolean(entry[field]);
  }
  redacted.configured = isConfigured(key, entry);
  return redacted;
}

export function getAllRedacted() {
  return Object.fromEntries(INTEGRATION_KEYS.map((k) => [k, getRedactedIntegration(k)]));
}

export function saveIntegration(key, payload) {
  assertKnown(key);
  const all = readStore('integrations');
  const existing = all[key] || {};
  const secretFields = SECRET_FIELDS[key];
  const next = { ...existing, ...payload, enabled: payload.enabled ?? existing.enabled ?? true };
  for (const field of secretFields) {
    // Une valeur vide/absente conserve le secret déjà stocké (évite de l'écraser
    // à chaque sauvegarde de formulaire depuis le frontend, qui ne la renvoie jamais).
    if (payload[field]) next[field] = encryptSecret(payload[field]);
    else next[field] = existing[field] ?? null;
  }
  all[key] = next;
  writeStore('integrations', all);
  return getRedactedIntegration(key);
}

function isConfigured(key, entry) {
  const required = {
    kubernetes: ['apiServer'],
    argocd: ['baseUrl'],
    haproxy: ['dataPlaneUrl'],
    gitlab: ['baseUrl'],
    github: ['token'],
    githubPlatform: ['organization', 'token'],
    gitea: ['baseUrl'],
    proxmox: ['baseUrl'],
    traefik: ['apiUrl'],
    certManager: [],
    grafana: ['baseUrl'],
    wazuh: ['baseUrl'],
    registry: ['baseUrl'],
    notificationsWebhook: ['url'],
    ovh: ['appKey', 'appSecret', 'consumerKey'],
    duckdns: ['token'],
    gitBackup: ['remoteUrl', 'token'],
    tracing: ['baseUrl', 'type']
  }[key] || [];
  return required.every((f) => Boolean(entry[f]));
}
