import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Domaines fonctionnels sur lesquels une permission peut être accordée à un
// groupe. Volontairement plus larges que les pages exactes de la console
// (regrouper Kubernetes/Réseaux/Infrastructure sous "infrastructure" par ex.)
// pour rester lisible dans une matrice de droits.
export const PERMISSION_DOMAINS = [
  'infrastructure', 'network', 'security', 'automation',
  'monitoring', 'terminal', 'identity', 'users', 'settings', 'inventory', 'vault', 'kubernetes',
  'hosts', 'backups', 'audit', 'proxmox'
];
export const PERMISSION_LEVELS = ['none', 'read', 'write', 'admin'];
const LEVEL_RANK = { none: 0, read: 1, write: 2, admin: 3 };

function emptyMatrix() {
  return Object.fromEntries(PERMISSION_DOMAINS.map((d) => [d, 'none']));
}

export function listGroups() {
  return readStore('groups');
}

export function getGroup(id) {
  return listGroups().find((g) => g.id === id);
}

export function createGroup({ name, description, memberIds = [], permissions = {} }) {
  if (!name || !name.trim()) {
    throw Object.assign(new Error('Nom de groupe requis'), { status: 400 });
  }
  const groups = listGroups();
  const group = {
    id: uuid(),
    name: name.trim(),
    description: description || '',
    memberIds: Array.isArray(memberIds) ? memberIds : [],
    permissions: { ...emptyMatrix(), ...sanitizePermissions(permissions) },
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
export function permissionsForUser(userId) {
  const groups = groupsForUser(userId);
  const out = emptyMatrix();
  for (const g of groups) {
    for (const domain of PERMISSION_DOMAINS) {
      const level = g.permissions?.[domain] || 'none';
      if (LEVEL_RANK[level] > LEVEL_RANK[out[domain]]) out[domain] = level;
    }
  }
  return out;
}

export function hasPermission(userId, domain, minLevel = 'read') {
  const level = permissionsForUser(userId)[domain] || 'none';
  return LEVEL_RANK[level] >= LEVEL_RANK[minLevel];
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
