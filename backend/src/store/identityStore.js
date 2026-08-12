import { readStore, writeStore } from './jsonStore.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

const SECRET_FIELDS = ['oidcClientSecret', 'ldapBindPassword'];
export const DEFAULT_SESSION_MINUTES = 720; // 12h, aligné sur le comportement historique

// Politique de connexion (durée de session, longueur minimale de mot de
// passe) + configuration SSO. Note importante : le fournisseur OIDC/LDAP est
// enregistré et testable (POST /identity/test-oidc), mais n'est PAS encore un
// second chemin de connexion actif — seul le mot de passe local authentifie
// aujourd'hui. Voir le Manuel pour le détail de cette limite volontaire.
export function getRaw() {
  const data = readStore('identity') || {};
  const decrypted = { ...data };
  for (const field of SECRET_FIELDS) {
    if (data[field]) decrypted[field] = decryptSecret(data[field]);
  }
  return decrypted;
}

export function getRedacted() {
  const data = readStore('identity') || {};
  const redacted = { ...data };
  for (const field of SECRET_FIELDS) {
    redacted[field] = undefined;
    redacted[`${field}Set`] = Boolean(data[field]);
  }
  return redacted;
}

export function save(payload) {
  const existing = readStore('identity') || {};
  const next = { ...existing, ...payload };
  for (const field of SECRET_FIELDS) {
    if (payload[field]) next[field] = encryptSecret(payload[field]);
    else next[field] = existing[field] ?? null;
  }
  writeStore('identity', next);
  return getRedacted();
}

export function getSessionMinutes() {
  const data = readStore('identity') || {};
  const minutes = Number(data.sessionMinutes);
  return Number.isInteger(minutes) && minutes >= 5 && minutes <= 10080 ? minutes : DEFAULT_SESSION_MINUTES;
}

export function getMinPasswordLength() {
  const data = readStore('identity') || {};
  const len = Number(data.minPasswordLength);
  return Number.isInteger(len) && len >= 8 && len <= 128 ? len : 8;
}
