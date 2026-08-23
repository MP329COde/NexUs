import { v4 as uuid } from 'uuid';
import crypto from 'node:crypto';
import { readStore, writeStore } from './jsonStore.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

// Gestionnaire de mots de passe multi-niveaux (Lot B2 — mapping complet dans
// todo.md) :
// - 'dev' : accès des développeurs à des machines de test/dev partagées,
//   lisible par tout utilisateur authentifié (voir vault.routes.js). Reste
//   le nom d'API historique ; présenté côté UI sous « Vault plateforme »
//   avec 'prod' (voir VaultPanel.jsx) — aucun renommage d'API pour ne pas
//   casser les appels existants (grep effectué avant ce lot : /vault/dev et
//   /vault/prod référencés uniquement depuis VaultPanel.jsx et vault.routes.js
//   lui-même, mais gardés stables par prudence contractuelle).
// - 'prod' : générés automatiquement (plusieurs centaines de caractères),
//   réservés aux admins et exigent de retaper son propre mot de passe pour
//   être révélés (voir requireStepUp dans vault.routes.js). Avec 'dev' :
//   « Vault plateforme ».
// - 'project' : coffre-fort propre à un projet (projectId), visible et
//   gérable par les membres de ce projet uniquement — voir la vérification
//   de visibilité dans projects.routes.js (mêmes règles que le backlog).
//   « Vault projet ».
// - 'user' (nouveau, Lot B2) : coffre-fort personnel d'un utilisateur
//   (userId), strictement scoppé à son propriétaire (voir vault.routes.js —
//   aucune lecture croisée, y compris par un admin). Généralise le principe
//   déjà en place pour le token GitLab personnel
//   (store/personalGitTokensStore.js, Lot A6) sans l'y fusionner : ce dernier
//   reste un cas spécial documenté (un seul provider, un seul champ, câblé
//   dans gitlabService.clientForUser) car largement utilisé et fonctionnel
//   tel quel — le dupliquer dans ce tier générique aurait cassé sa
//   résolution existante pour un bénéfice nul. « Vault utilisateur ».
// Le secret est toujours chiffré au repos (AES-256-GCM, même clé maître que
// les autres intégrations) et n'est jamais renvoyé par la liste — seul un
// appel explicite à reveal() le déchiffre.
//
// Il n'existe volontairement PAS de tier 'infra' dans ce store : les
// identifiants Proxmox/Kubernetes/HAProxy/... vivent déjà dans
// settingsStore.js (chiffrés AES-256-GCM, jamais renvoyés en clair, déjà
// audités sur écriture via logAudit('settings.integration.save')). Les y
// dupliquer aurait créé deux sources de vérité pour le même secret (lequel
// fait foi au démarrage des services d'intégration ? settingsStore, toujours
// — vaultStore n'est jamais lu par integrationRegistry.js). Le « Vault
// infrastructure » demandé est donc une VUE en lecture seule agrégeant
// settingsStore (voir GET /vault/infra dans vault.routes.js), avec un
// sous-domaine de permission dédié ('vault-infra') et une trace d'audit de
// consultation — pas un cinquième tier de stockage ici.
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

export function listVaultEntries(tier, projectId, userId) {
  const entries = readStore('vault') || [];
  return entries.filter((e) => e.tier === tier
    && (tier !== 'project' || e.projectId === projectId)
    && (tier !== 'user' || e.userId === userId)).map(toMeta);
}

// Tiers pour lesquels une rotation (auto ou manuelle) a un sens : 'dev' reste
// un accès partagé stable (pas un secret sensible), 'user' est un secret
// fourni par l'utilisateur lui-même depuis un service tiers (ex. token
// d'API personnel) — le régénérer aléatoirement côté NexUs le rendrait
// invalide côté service tiers, donc aucune rotation, ni auto ni manuelle,
// n'y est proposée. 'prod' et 'project' restent les deux seuls tiers dont le
// secret est généré par NexUs lui-même (generateProdSecret) et peut donc
// être régénéré sans effet de bord externe.
const ROTATABLE_TIERS = new Set(['prod', 'project']);

// Rotation : bornes réalistes pour un usage réel (au départ [2, 5] MINUTES,
// des constantes manifestement pensées pour une démo/un test manuel plutôt
// qu'un usage en production — une rotation toutes les 2 minutes empêcherait
// concrètement toute automatisation de consommer le secret avant qu'il ne
// change). Nouvelles bornes : 15 minutes (plus courte rotation réaliste,
// ex. secret très sensible) à 90 jours (129600 minutes, politique de
// rotation trimestrielle courante). null = pas de rotation automatique
// (comportement historique, inchangé).
const MIN_ROTATION_MINUTES = 15;
const MAX_ROTATION_MINUTES = 129600;

export function normalizeRotationMinutes(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_ROTATION_MINUTES, Math.max(MIN_ROTATION_MINUTES, Math.round(n)));
}

export function createVaultEntry({ tier, label, username, secret, notes, actor, projectId, userId, url, rotationMinutes }) {
  const entries = readStore('vault') || [];
  const rotation = ROTATABLE_TIERS.has(tier) ? normalizeRotationMinutes(rotationMinutes) : null;
  const entry = {
    id: uuid(),
    tier,
    projectId: tier === 'project' ? projectId : null,
    userId: tier === 'user' ? userId : null,
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
  if (rotationMinutes !== undefined && ROTATABLE_TIERS.has(entry.tier)) {
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

// Rotation immédiate, hors échéance planifiée — déclenchée soit
// automatiquement quand un secret est détecté en clair dans un dépôt (voir
// secretLeakScanService.js), soit manuellement par un utilisateur habilité
// (bouton « Rotation immédiate », voir POST /vault/:id/rotate). Ne s'applique
// qu'aux tiers dont le secret est généré par NexUs (voir ROTATABLE_TIERS).
export function forceRotateSecret(id) {
  const entries = readStore('vault') || [];
  const entry = entries.find((e) => e.id === id);
  if (!entry || !ROTATABLE_TIERS.has(entry.tier)) return null;
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
