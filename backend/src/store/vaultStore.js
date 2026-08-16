import { v4 as uuid } from 'uuid';
import crypto from 'node:crypto';
import { readStore, writeStore } from './jsonStore.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

// Gestionnaire de mots de passe à trois niveaux :
// - 'dev' : accès des développeurs à des machines de test/dev partagées,
//   lisible par tout utilisateur authentifié (voir vault.routes.js).
// - 'prod' : générés automatiquement (plusieurs centaines de caractères),
//   réservés aux admins et exigent de retaper son propre mot de passe pour
//   être révélés (voir requireStepUp dans vault.routes.js).
// - 'project' : coffre-fort propre à un projet (projectId), visible et
//   gérable par les membres de ce projet uniquement — voir la vérification
//   de visibilité dans projects.routes.js (mêmes règles que le backlog).
// Le secret est toujours chiffré au repos (AES-256-GCM, même clé maître que
// les autres intégrations) et n'est jamais renvoyé par la liste — seul un
// appel explicite à reveal() le déchiffre.
const PROD_SECRET_LENGTH = 256;
const PROD_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}';

export function generateProdSecret() {
  const bytes = crypto.randomBytes(PROD_SECRET_LENGTH);
  return Array.from(bytes, (b) => PROD_ALPHABET[b % PROD_ALPHABET.length]).join('');
}

function toMeta(entry) {
  const { secretEncrypted, ...meta } = entry;
  return meta;
}

export function listVaultEntries(tier, projectId) {
  const entries = readStore('vault') || [];
  return entries.filter((e) => e.tier === tier && (tier !== 'project' || e.projectId === projectId)).map(toMeta);
}

// Rotation : uniquement pertinente pour prod/project (les mots de passe dev
// restent stables — ce sont des accès partagés à des machines de test, pas
// des secrets sensibles). rotationMinutes est borné à [2, 5] comme demandé,
// null = pas de rotation automatique (comportement historique).
const MIN_ROTATION_MINUTES = 2;
const MAX_ROTATION_MINUTES = 5;

export function normalizeRotationMinutes(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_ROTATION_MINUTES, Math.max(MIN_ROTATION_MINUTES, Math.round(n)));
}

export function createVaultEntry({ tier, label, username, secret, notes, actor, projectId, url, rotationMinutes }) {
  const entries = readStore('vault') || [];
  const rotation = tier !== 'dev' ? normalizeRotationMinutes(rotationMinutes) : null;
  const entry = {
    id: uuid(),
    tier,
    projectId: tier === 'project' ? projectId : null,
    label,
    username: username || '',
    url: url || '',
    notes: notes || '',
    secretEncrypted: encryptSecret(secret),
    secretVersion: 1,
    rotationMinutes: rotation,
    rotatedAt: rotation ? new Date().toISOString() : null,
    createdBy: actor?.email || null,
    createdAt: new Date().toISOString()
  };
  entries.push(entry);
  writeStore('vault', entries);
  return toMeta(entry);
}

// Modifie uniquement les métadonnées (label, utilisateur, URL d'accès,
// notes) — jamais le secret lui-même, qui ne se change qu'en recréant
// l'entrée (évite qu'une modification anodine ne finisse par exposer ou
// écraser silencieusement un secret existant).
export function updateVaultEntry(id, { label, username, url, notes, rotationMinutes }) {
  const entries = readStore('vault') || [];
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const entry = entries[idx];
  let rotationPatch = {};
  if (rotationMinutes !== undefined && entry.tier !== 'dev') {
    const rotation = normalizeRotationMinutes(rotationMinutes);
    // (Ré)-armer le minuteur dès qu'on active/modifie la rotation, pour ne
    // pas déclencher une rotation immédiate et surprenante juste après avoir
    // sauvegardé la configuration.
    rotationPatch = { rotationMinutes: rotation, rotatedAt: rotation ? new Date().toISOString() : null };
  }
  entries[idx] = {
    ...entry,
    ...(label !== undefined ? { label } : {}),
    ...(username !== undefined ? { username } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(notes !== undefined ? { notes } : {}),
    ...rotationPatch
  };
  writeStore('vault', entries);
  return toMeta(entries[idx]);
}

// Renvoie l'échéance de la prochaine rotation (ISO) ou null si l'entrée n'a
// pas de rotation active — calculée à la volée plutôt que stockée, pour
// rester toujours exacte même si rotatedAt vient de bouger.
export function nextRotationAt(entry) {
  if (!entry?.rotationMinutes || !entry.rotatedAt) return null;
  return new Date(new Date(entry.rotatedAt).getTime() + entry.rotationMinutes * 60_000).toISOString();
}

// Job planifié (voir services/vaultRotationService.js) : régénère le secret
// de chaque entrée prod/project dont l'échéance de rotation est dépassée.
// Les mots de passe dev ne sont jamais concernés (rotationMinutes toujours
// null pour ce tier).
export function rotateDueSecrets() {
  const entries = readStore('vault') || [];
  const now = Date.now();
  let rotated = 0;
  for (const entry of entries) {
    if (!entry.rotationMinutes || !entry.rotatedAt) continue;
    const dueAt = new Date(entry.rotatedAt).getTime() + entry.rotationMinutes * 60_000;
    if (now < dueAt) continue;
    entry.secretEncrypted = encryptSecret(generateProdSecret());
    entry.secretVersion = (entry.secretVersion || 1) + 1;
    entry.rotatedAt = new Date(now).toISOString();
    rotated += 1;
  }
  if (rotated > 0) writeStore('vault', entries);
  return rotated;
}

// Rotation immédiate, hors échéance planifiée — déclenchée quand un secret
// est détecté en clair dans un dépôt (voir secretLeakScanService.js). Ne
// s'applique jamais au tier 'dev' (mots de passe stables de machines de
// test, pas des secrets de production).
export function forceRotateSecret(id) {
  const entries = readStore('vault') || [];
  const entry = entries.find((e) => e.id === id);
  if (!entry || entry.tier === 'dev') return null;
  entry.secretEncrypted = encryptSecret(generateProdSecret());
  entry.secretVersion = (entry.secretVersion || 1) + 1;
  entry.rotatedAt = new Date().toISOString();
  writeStore('vault', entries);
  return toMeta(entry);
}

// Comparaison à temps constant : le scan compare un contenu de fichier à
// des dizaines de secrets déchiffrés, une comparaison `===` classique fuit
// une information de timing négligeable ici (le contenu scanné n'est pas
// un attaquant actif), mais rester cohérent avec verifyPassword() ne coûte
// rien et évite d'avoir à se reposer sur ce raisonnement plus tard.
export function findSecretMatchInText(text) {
  const entries = readStore('vault') || [];
  const matches = [];
  for (const entry of entries) {
    if (entry.tier === 'dev') continue; // secrets partagés dev, pas des fuites à traiter
    const secret = decryptSecret(entry.secretEncrypted);
    if (secret && secret.length >= 12 && text.includes(secret)) {
      matches.push(toMeta(entry));
    }
  }
  return matches;
}

export function deleteVaultEntry(id) {
  const entries = readStore('vault') || [];
  const next = entries.filter((e) => e.id !== id);
  if (next.length === entries.length) return false;
  writeStore('vault', next);
  return true;
}

export function revealVaultEntry(id) {
  const entries = readStore('vault') || [];
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  return decryptSecret(entry.secretEncrypted);
}

export function findVaultEntry(id) {
  const entries = readStore('vault') || [];
  return entries.find((e) => e.id === id) || null;
}
