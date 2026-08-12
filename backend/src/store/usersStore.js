import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';
import { hashPassword } from '../utils/crypto.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function listUsers() {
  return readStore('users');
}

export function hasAnyUser() {
  return listUsers().length > 0;
}

export function findUserByEmail(email) {
  return listUsers().find((u) => u.email.toLowerCase() === String(email).toLowerCase());
}

export function findUserById(id) {
  return listUsers().find((u) => u.id === id);
}

export function countAdmins(users = listUsers()) {
  return users.filter((u) => u.role === 'admin' && u.active !== false).length;
}

const AVATAR_COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899'];

// role: 'admin' (accès complet, y compris Paramètres/intégrations et gestion des
// utilisateurs) ou 'user' (accède à la console et à ses propres préférences
// uniquement — cf. requireRole() dans middleware/auth.js).
export function createUser({ email, password, name, role = 'user' }) {
  if (findUserByEmail(email)) {
    throw Object.assign(new Error('Un utilisateur avec cet e-mail existe déjà'), { status: 409 });
  }
  const users = listUsers();
  const user = {
    id: uuid(),
    email,
    name: name || email.split('@')[0],
    role,
    active: true,
    passwordHash: hashPassword(password),
    avatarEmoji: null,
    avatarColor: AVATAR_COLORS[users.length % AVATAR_COLORS.length],
    theme: null,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeStore('users', users);
  return user;
}

export function updateUser(id, patch) {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const allowed = ['name', 'avatarEmoji', 'avatarColor', 'theme'];
  for (const key of allowed) {
    if (patch[key] !== undefined) users[idx][key] = patch[key] || null;
  }
  writeStore('users', users);
  return users[idx];
}

export function updatePassword(id, passwordHash) {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  users[idx].passwordHash = passwordHash;
  writeStore('users', users);
  return users[idx];
}

// Réservé aux admins (routes/users.routes.js) : changement de rôle / activation.
// Refuse de retirer le dernier admin actif pour ne jamais verrouiller la console.
export function setUserAdminFields(id, { role, active }) {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  const wouldRemoveLastAdmin = users[idx].role === 'admin'
    && ((role && role !== 'admin') || active === false)
    && countAdmins(users) <= 1;
  if (wouldRemoveLastAdmin) {
    throw Object.assign(new Error("Impossible de retirer le dernier compte administrateur"), { status: 409 });
  }
  if (role) users[idx].role = role;
  if (active !== undefined) users[idx].active = active;
  writeStore('users', users);
  return users[idx];
}

export function deleteUser(id) {
  const users = listUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return false;
  if (target.role === 'admin' && countAdmins(users) <= 1) {
    throw Object.assign(new Error("Impossible de supprimer le dernier compte administrateur"), { status: 409 });
  }
  writeStore('users', users.filter((u) => u.id !== id));
  return true;
}

// Bootstrap non-interactif optionnel : ne crée un compte que si ADMIN_EMAIL et
// ADMIN_PASSWORD sont explicitement définis (déploiement automatisé/headless).
// Sans ces variables, la console reste sans utilisateur et affiche l'assistant
// de première configuration (GET /api/setup/status → needsSetup: true).
export function ensureBootstrapAdmin() {
  if (hasAnyUser()) return;
  if (!env.adminEmail || !env.adminPassword) return;
  createUser({ email: env.adminEmail, password: env.adminPassword, name: 'Administrateur', role: 'admin' });
  logger.warn(`Compte admin créé depuis les variables d'environnement (${env.adminEmail}).`);
}
