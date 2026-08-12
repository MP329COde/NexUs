import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Domaines fonctionnels sur lesquels une permission peut être accordée à un
// groupe. Volontairement plus larges que les pages exactes de la console
// (regrouper Kubernetes/Réseaux/Infrastructure sous "infrastructure" par ex.)
// pour rester lisible dans une matrice de droits.
export const PERMISSION_DOMAINS = ['infrastructure', 'network', 'security', 'automation'];
export const PERMISSION_LEVELS = ['none', 'read', 'write', 'admin'];

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

function sanitizePermissions(permissions) {
  const out = {};
  for (const domain of PERMISSION_DOMAINS) {
    const level = permissions[domain];
    if (PERMISSION_LEVELS.includes(level)) out[domain] = level;
  }
  return out;
}
