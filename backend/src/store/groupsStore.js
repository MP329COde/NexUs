import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Domaines fonctionnels sur lesquels une permission peut être accordée à un
// groupe. Volontairement plus larges que les pages exactes de la console
// (regrouper Kubernetes/Réseaux/Infrastructure sous "infrastructure" par ex.)
// pour rester lisible dans une matrice de droits.
export const PERMISSION_DOMAINS = [
  'infrastructure', 'network', 'security', 'automation',
  'monitoring', 'terminal', 'identity', 'users', 'settings', 'inventory', 'vault', 'kubernetes',
  'hosts', 'backups', 'audit', 'proxmox', 'plugins'
];
export const PERMISSION_LEVELS = ['none', 'read', 'write', 'admin'];
const LEVEL_RANK = { none: 0, read: 1, write: 2, admin: 3 };

// Sous-domaines : restreignent une sous-fonctionnalité précise d'un domaine
// existant à un niveau distinct, sans dupliquer toute la matrice. Tant
// qu'aucun groupe n'a explicitement défini de valeur pour un sous-domaine,
// son niveau effectif est HÉRITÉ du domaine parent (voir permissionsForUser)
// — c'est ce qui garantit qu'introduire un sous-domaine ne change RIEN au
// comportement des groupes existants (aucune régression au déploiement).
// Exemple concret déjà en place avant ce lot : /vault/prod exigeait déjà
// vault:admin (voir routes/vault.routes.js) — 'vault-prod' rend ce niveau
// réglable indépendamment du reste du domaine 'vault' (ex: dev en écriture
// pour tous les devs, prod réservé à un sous-groupe précis) plutôt que de
// rester câblé en dur sur le niveau 'admin' du domaine parent.
// Lot B2 (vault multi-niveaux) : deux nouveaux sous-domaines, même mécanique
// d'héritage que 'vault-prod' ci-dessus (rien ne change pour les groupes
// existants tant qu'ils ne les définissent pas explicitement).
// - 'vault-user' : coffre-fort personnel (secrets propres à un utilisateur,
//   ex. tokens d'API personnels) — en pratique chaque utilisateur gère déjà
//   ses propres entrées sans avoir besoin d'un octroi (voir vault.routes.js,
//   scoping strict par req.user.id), ce sous-domaine sert surtout à un futur
//   usage admin (support consultant les métadonnées, jamais les secrets en
//   clair) plutôt qu'à restreindre l'accès de chacun à SES PROPRES secrets.
// - 'vault-infra' : lecture des secrets d'intégration d'infrastructure
//   (Proxmox/Kubernetes/HAProxy...) exposée en lecture seule (métadonnées,
//   jamais le secret en clair — ces secrets restent la propriété de
//   settingsStore.js, voir vault.routes.js GET /infra) à un niveau plus fin
//   que le domaine 'settings' complet (qui donne aussi le droit d'écrire).
export const SUBDOMAINS = {
  'vault-prod': 'vault',
  'vault-user': 'vault',
  'vault-infra': 'vault',
  'users-permissions': 'users'
};
export const SUBDOMAIN_KEYS = Object.keys(SUBDOMAINS);

// Préréglages de matrice ("grosses permissions") proposés à la création d'un
// groupe pour éviter de cocher un par un 17 domaines — de purs raccourcis
// UI : le résultat reste une matrice domaine×niveau ordinaire, modifiable
// ensuite comme n'importe quel groupe créé à la main.
export const PERMISSION_PRESETS = {
  'admin-complet': {
    label: 'Administrateur complet',
    description: 'Accès admin sur tous les domaines et sous-domaines (équivalent à un compte admin plateforme, mais révocable comme un groupe).',
    permissions: Object.fromEntries(PERMISSION_DOMAINS.map((d) => [d, 'admin'])),
    subPermissions: Object.fromEntries(SUBDOMAIN_KEYS.map((d) => [d, 'admin']))
  },
  'lecture-seule': {
    label: 'Lecture seule plateforme',
    description: 'Consultation de tous les domaines, aucune écriture ni action admin.',
    permissions: Object.fromEntries(PERMISSION_DOMAINS.map((d) => [d, 'read'])),
    subPermissions: Object.fromEntries(SUBDOMAIN_KEYS.map((d) => [d, 'none']))
  },
  'developpeur': {
    label: 'Développeur',
    description: 'Écriture sur infrastructure/réseaux/automatisation/monitoring/terminal/kubernetes/hôtes/inventaire, lecture ailleurs, coffre-fort dev en écriture (prod exclu).',
    permissions: {
      infrastructure: 'write', network: 'write', security: 'read', automation: 'write',
      monitoring: 'write', terminal: 'write', identity: 'none', users: 'none',
      settings: 'none', inventory: 'write', vault: 'write', kubernetes: 'write',
      hosts: 'write', backups: 'read', audit: 'none', proxmox: 'read', plugins: 'read'
    },
    subPermissions: { 'vault-prod': 'none', 'vault-user': 'none', 'vault-infra': 'none', 'users-permissions': 'none' }
  },
  'support-monitoring': {
    label: 'Support / Monitoring',
    description: 'Lecture sur monitoring, audit, sécurité et inventaire — pour une astreinte qui observe sans pouvoir modifier.',
    permissions: {
      infrastructure: 'read', network: 'read', security: 'read', automation: 'none',
      monitoring: 'read', terminal: 'none', identity: 'none', users: 'none',
      settings: 'none', inventory: 'read', vault: 'none', kubernetes: 'read',
      hosts: 'read', backups: 'read', audit: 'read', proxmox: 'read', plugins: 'none'
    },
    subPermissions: { 'vault-prod': 'none', 'vault-user': 'none', 'vault-infra': 'none', 'users-permissions': 'none' }
  }
};

function emptyMatrix() {
  return Object.fromEntries(PERMISSION_DOMAINS.map((d) => [d, 'none']));
}

function emptySubMatrix() {
  // {} et non 'none' explicite : une clé absente signifie "hérite du domaine
  // parent" (voir permissionsForUser), alors qu'une valeur explicite (même
  // 'none') signifie "un admin a volontairement isolé ce sous-domaine".
  return {};
}

export function listGroups() {
  return readStore('groups');
}

export function getGroup(id) {
  return listGroups().find((g) => g.id === id);
}

export function createGroup({ name, description, memberIds = [], permissions = {}, subPermissions = {}, preset }) {
  if (!name || !name.trim()) {
    throw Object.assign(new Error('Nom de groupe requis'), { status: 400 });
  }
  // Préréglage ("grosse permission") appliqué en base : les valeurs
  // explicitement fournies dans permissions/subPermissions par l'appelant
  // priment dessus, pour permettre "préréglage Développeur + vault:admin en
  // plus" en un seul appel plutôt que deux.
  const presetDef = preset && PERMISSION_PRESETS[preset];
  const basePermissions = presetDef ? presetDef.permissions : {};
  const baseSubPermissions = presetDef ? presetDef.subPermissions : {};
  const groups = listGroups();
  const group = {
    id: uuid(),
    name: name.trim(),
    description: description || '',
    memberIds: Array.isArray(memberIds) ? memberIds : [],
    permissions: { ...emptyMatrix(), ...sanitizePermissions(basePermissions), ...sanitizePermissions(permissions) },
    subPermissions: { ...emptySubMatrix(), ...sanitizeSubPermissions(baseSubPermissions), ...sanitizeSubPermissions(subPermissions) },
    createdAt: new Date().toISOString()
  };
  groups.push(group);
  writeStore('groups', groups);
  return group;
}

export function updateGroup(id, patch) {
  const groups = listGroups();
  const idx = groups.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  const current = groups[idx];
  const next = { ...current };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.memberIds !== undefined) next.memberIds = Array.isArray(patch.memberIds) ? patch.memberIds : current.memberIds;
  if (patch.permissions !== undefined) next.permissions = { ...current.permissions, ...sanitizePermissions(patch.permissions) };
  if (patch.subPermissions !== undefined) next.subPermissions = { ...(current.subPermissions || {}), ...sanitizeSubPermissions(patch.subPermissions) };
  groups[idx] = next;
  writeStore('groups', groups);
  return next;
}

export function deleteGroup(id) {
  const groups = listGroups();
  const next = groups.filter((g) => g.id !== id);
  if (next.length === groups.length) return false;
  writeStore('groups', next);
  return true;
}

// Groupes auxquels appartient un utilisateur donné (pour affichage côté
// annuaire des utilisateurs).
export function groupsForUser(userId) {
  return listGroups().filter((g) => g.memberIds.includes(userId));
}

// Union (niveau max par domaine) des matrices de tous les groupes d'un
// utilisateur : c'est ce qui rend les rôles composables — appartenir à
// "développeur" (infrastructure:write) ET "monitoring" (monitoring:read)
// donne accès aux deux, sans qu'aucun groupe seul ne les couvre.
// Union des groupes (niveau max par domaine, voir plus haut) + niveau des
// sous-domaines (hérité du domaine parent tant qu'aucun groupe ne l'a isolé
// explicitement) + overrides individuels hors groupe (permissionOverrides,
// voir userOverrides ci-dessous) — chaque source ne peut qu'AUGMENTER le
// niveau final par rapport aux groupes seuls, jamais le restreindre : un
// override individuel sert à accorder un accès ponctuel en plus des groupes,
// pas à retirer ce qu'un groupe donne déjà (cohérent avec la composabilité
// des groupes entre eux).
export function permissionsForUser(userId) {
  const groups = groupsForUser(userId);
  const out = emptyMatrix();
  for (const g of groups) {
    for (const domain of PERMISSION_DOMAINS) {
      const level = g.permissions?.[domain] || 'none';
      if (LEVEL_RANK[level] > LEVEL_RANK[out[domain]]) out[domain] = level;
    }
  }
  for (const sub of SUBDOMAIN_KEYS) {
    const parent = SUBDOMAINS[sub];
    out[sub] = 'none';
    for (const g of groups) {
      const explicit = g.subPermissions?.[sub];
      const level = explicit !== undefined ? explicit : (g.permissions?.[parent] || 'none');
      if (LEVEL_RANK[level] > LEVEL_RANK[out[sub]]) out[sub] = level;
    }
  }
  const overrides = getUserOverrides(userId);
  for (const [domain, level] of Object.entries(overrides)) {
    if (out[domain] !== undefined && LEVEL_RANK[level] > LEVEL_RANK[out[domain]]) out[domain] = level;
  }
  return out;
}

export function hasPermission(userId, domain, minLevel = 'read') {
  const level = permissionsForUser(userId)[domain] || 'none';
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
}

// Permissions individuelles "hors groupe" : réponse au besoin de sélection
// fine par utilisateur sans passer par un groupe (ex. accorder vault:read à
// UN utilisateur précis, sans créer/rejoindre un groupe pour lui seul). Se
// superpose à la matrice des groupes (jamais en dessous, voir
// permissionsForUser ci-dessus) — ne remplace pas les groupes, qui restent
// le mécanisme principal pour tout accès partagé par plusieurs comptes.
const ALL_OVERRIDABLE_DOMAINS = [...PERMISSION_DOMAINS, ...SUBDOMAIN_KEYS];

export function getUserOverrides(userId) {
  const all = readStore('permissionOverrides') || {};
  return all[userId] || {};
}

export function setUserOverrides(userId, overrides) {
  const all = readStore('permissionOverrides') || {};
  const sanitized = {};
  for (const domain of ALL_OVERRIDABLE_DOMAINS) {
    const level = overrides?.[domain];
    if (PERMISSION_LEVELS.includes(level) && level !== 'none') sanitized[domain] = level;
  }
  if (Object.keys(sanitized).length === 0) {
    delete all[userId];
  } else {
    all[userId] = sanitized;
  }
  writeStore('permissionOverrides', all);
  return sanitized;
}

// Ajoute un utilisateur aux groupes/rôles sélectionnés à sa création
// (routes/users.routes.js POST /) — no-op silencieux sur un id de groupe
// inconnu, pour ne jamais faire échouer la création d'utilisateur elle-même.
// N'enlève jamais un utilisateur d'un groupe existant : contrairement à
// setUserGroups (ci-dessous), c'est une opération additive uniquement.
export function assignUserToGroups(userId, groupIds = []) {
  if (!Array.isArray(groupIds) || !groupIds.length) return;
  const groups = listGroups();
  let changed = false;
  for (const g of groups) {
    if (groupIds.includes(g.id) && !g.memberIds.includes(userId)) {
      g.memberIds.push(userId);
      changed = true;
    }
  }
  if (changed) writeStore('groups', groups);
}

export function groupIdsForUser(userId) {
  return groupsForUser(userId).map((g) => g.id);
}

// Remplace intégralement l'appartenance aux groupes d'un utilisateur déjà
// existant : ajoute les groupes cochés, retire ceux décochés, laisse les
// autres utilisateurs de chaque groupe intacts. Contrairement à
// assignUserToGroups (additif, réservé à la création), c'est ce qui permet
// d'ajouter UNE permission de plus à un compte qui en a déjà (ex. donner
// "Monitoring" en plus de "Développeur" sans retirer ce dernier si les deux
// sont cochés) tout en gardant la possibilité de retirer un rôle précédemment
// accordé.
export function setUserGroups(userId, groupIds = []) {
  const wanted = new Set(Array.isArray(groupIds) ? groupIds : []);
  const groups = listGroups();
  let changed = false;
  for (const g of groups) {
    const isMember = g.memberIds.includes(userId);
    const shouldBeMember = wanted.has(g.id);
    if (shouldBeMember && !isMember) {
      g.memberIds.push(userId);
      changed = true;
    } else if (!shouldBeMember && isMember) {
      g.memberIds = g.memberIds.filter((id) => id !== userId);
      changed = true;
    }
  }
  if (changed) writeStore('groups', groups);
}

function sanitizePermissions(permissions) {
  const out = {};
  for (const domain of PERMISSION_DOMAINS) {
    const level = permissions[domain];
    if (PERMISSION_LEVELS.includes(level)) out[domain] = level;
  }
  return out;
}

function sanitizeSubPermissions(subPermissions) {
  const out = {};
  if (!subPermissions) return out;
  for (const domain of SUBDOMAIN_KEYS) {
    const level = subPermissions[domain];
    if (PERMISSION_LEVELS.includes(level)) out[domain] = level;
  }
  return out;
}
