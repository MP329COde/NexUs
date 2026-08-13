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

export function createVaultEntry({ tier, label, username, secret, notes, actor, projectId, url }) {
  const entries = readStore('vault') || [];
  const entry = {
    id: uuid(),
    tier,
    projectId: tier === 'project' ? projectId : null,
    label,
    username: username || '',
    url: url || '',
    notes: notes || '',
    secretEncrypted: encryptSecret(secret),
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
export function updateVaultEntry(id, { label, username, url, notes }) {
  const entries = readStore('vault') || [];
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  entries[idx] = {
    ...entries[idx],
    ...(label !== undefined ? { label } : {}),
    ...(username !== undefined ? { username } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(notes !== undefined ? { notes } : {})
  };
  writeStore('vault', entries);
  return toMeta(entries[idx]);
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
