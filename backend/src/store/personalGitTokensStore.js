import { readStore, writeStore } from './jsonStore.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

// Tokens d'accès personnels stockés par utilisateur, distincts de
// l'intégration d'instance (backend/src/store/settingsStore.js#gitlab,
// réservée aux admins en Paramètres) : chaque utilisateur peut renseigner
// SON propre token GitLab pour agir en son nom propre (approuver une MR,
// committer...) plutôt qu'au nom du compte de service partagé de la
// plateforme. Chiffré au repos avec le même utilitaire que le reste du
// projet (AES-256-GCM, voir utils/crypto.js) — jamais renvoyé en clair par
// l'API, uniquement déchiffré côté serveur au moment de l'appel GitLab.
//
// Base minimale volontaire (Lot A6 du plan) : un seul provider ('gitlab')
// et une seule paire utilisateur/token. Le Lot B2 (vault multi-niveaux)
// prévu au plan approfondira ce mécanisme (rotation, plusieurs providers,
// audit de lecture...) — ne pas dupliquer cette logique ailleurs d'ici là.
const PROVIDERS = ['gitlab'];

function assertProvider(provider) {
  if (!PROVIDERS.includes(provider)) {
    throw Object.assign(new Error(`Provider de token personnel inconnu: ${provider}`), { status: 400 });
  }
}

export function getPersonalToken(userId, provider) {
  assertProvider(provider);
  const entries = readStore('personalGitTokens') || [];
  const entry = entries.find((e) => e.userId === userId && e.provider === provider);
  if (!entry) return null;
  return {
    provider: entry.provider,
    hasToken: true,
    label: entry.label || '',
    updatedAt: entry.updatedAt
  };
}

// Réservé à un appel interne (ex: gitlabService.js résolvant le client à
// utiliser) — ne jamais exposer le résultat de cette fonction via une route
// HTTP telle quelle.
export function revealPersonalToken(userId, provider) {
  assertProvider(provider);
  const entries = readStore('personalGitTokens') || [];
  const entry = entries.find((e) => e.userId === userId && e.provider === provider);
  if (!entry) return null;
  return decryptSecret(entry.tokenEncrypted);
}

export function setPersonalToken(userId, provider, token, { label } = {}) {
  assertProvider(provider);
  if (!token) {
    throw Object.assign(new Error('Token requis'), { status: 400 });
  }
  const entries = readStore('personalGitTokens') || [];
  const idx = entries.findIndex((e) => e.userId === userId && e.provider === provider);
  const entry = {
    userId,
    provider,
    label: label || '',
    tokenEncrypted: encryptSecret(token),
    updatedAt: new Date().toISOString()
  };
  if (idx === -1) entries.push(entry);
  else entries[idx] = entry;
  writeStore('personalGitTokens', entries);
  return getPersonalToken(userId, provider);
}

export function deletePersonalToken(userId, provider) {
  assertProvider(provider);
  const entries = readStore('personalGitTokens') || [];
  const next = entries.filter((e) => !(e.userId === userId && e.provider === provider));
  writeStore('personalGitTokens', next);
  return next.length !== entries.length;
}
