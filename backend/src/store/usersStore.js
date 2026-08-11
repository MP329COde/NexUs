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

export function createUser({ email, password, name, role = 'admin' }) {
  const users = listUsers();
  const user = {
    id: uuid(),
    email,
    name: name || email.split('@')[0],
    role,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeStore('users', users);
  return user;
}

// Au premier démarrage, crée le compte admin depuis les variables d'environnement
// afin que la console soit utilisable immédiatement derrière le reverse proxy.
export function ensureBootstrapAdmin() {
  const users = listUsers();
  if (users.length > 0) return;
  createUser({ email: env.adminEmail, password: env.adminPassword, name: 'Administrateur', role: 'admin' });
  logger.warn(`Aucun utilisateur trouvé : compte admin créé (${env.adminEmail}). Changez son mot de passe depuis les Paramètres.`);
}
