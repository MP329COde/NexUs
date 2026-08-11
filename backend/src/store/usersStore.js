import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';
import { hashPassword } from '../utils/crypto.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function listUsers() {
  return readStore('users');
}

export function findUserByEmail(email) {
  return listUsers().find((u) => u.email.toLowerCase() === String(email).toLowerCase());
}

export function findUserById(id) {
  return listUsers().find((u) => u.id === id);
}

const AVATAR_COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899'];

export function createUser({ email, password, name, role = 'admin' }) {
  const users = listUsers();
  const user = {
    id: uuid(),
    email,
    name: name || email.split('@')[0],
    role,
    passwordHash: hashPassword(password),
    avatarEmoji: null,
    avatarColor: AVATAR_COLORS[users.length % AVATAR_COLORS.length],
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
  const allowed = ['name', 'avatarEmoji', 'avatarColor'];
  for (const key of allowed) {
    if (patch[key] !== undefined) users[idx][key] = patch[key] || null;
  }
  writeStore('users', users);
  return users[idx];
}

// Au premier démarrage, crée le compte admin depuis les variables d'environnement
// afin que la console soit utilisable immédiatement derrière le reverse proxy.
export function ensureBootstrapAdmin() {
  const users = listUsers();
  if (users.length > 0) return;
  createUser({ email: env.adminEmail, password: env.adminPassword, name: 'Administrateur', role: 'admin' });
  logger.warn(`Aucun utilisateur trouvé : compte admin créé (${env.adminEmail}). Changez son mot de passe depuis les Paramètres.`);
}
