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
// mustOnboard : affiche l'assistant de première connexion (nom, mot de passe,
// compte Git) avant d'accéder au reste de la console. Faux par défaut — le
// bootstrap admin et le setup initial n'en ont pas besoin ; seule la création
// d'un compte par un admin (routes/users.routes.js) le met à true, sauf si
// l'admin indique avoir déjà configuré le compte lui-même.
export function createUser({ email, password, name, username, role = 'user', mustOnboard = false }) {
  if (findUserByEmail(email)) {
    throw Object.assign(new Error('Un utilisateur avec cet e-mail existe déjà'), { status: 409 });
  }
  const users = listUsers();
  const user = {
    id: uuid(),
    email,
    name: name || email.split('@')[0],
    // Cosmétique uniquement : la connexion reste basée sur l'e-mail (voir
    // routes/auth.routes.js). Conservé pour affichage (ex. "alex.lambert").
    username: username || null,
    role,
    active: true,
    passwordHash: hashPassword(password),
    avatarEmoji: null,
    avatarColor: AVATAR_COLORS[users.length % AVATAR_COLORS.length],
    avatarImage: null, // data URL (image importée) — prioritaire sur avatarEmoji à l'affichage
    theme: null,
    mustOnboard,
    // Palier du Terminal sécurisé — indépendant du rôle admin/user : null
    // (par défaut) = aucun accès au terminal, même pour un compte "user".
    // Un admin de plateforme a toujours le palier 'admin' (accès complet),
    // implicitement, sans avoir besoin d'être positionné ici — cf.
    // resolveTerminalTier() dans terminalService.js.
    terminalTier: null,
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
  const allowed = ['name', 'avatarEmoji', 'avatarColor', 'avatarImage', 'theme'];
  for (const key of allowed) {
    if (patch[key] !== undefined) users[idx][key] = patch[key] || null;
  }
  writeStore('users', users);
  return users[idx];
}

// Verrouillage de compte après échecs de connexion rapprochés sur CE compte
// (brute-force ciblé) — distinct du rate-limit IP générique (index.js), qui
// laisse passer un trafic distribué normal mais ne protège pas un compte
// visé depuis plusieurs IP. Fenêtre glissante : les échecs plus vieux que
// FAILURE_WINDOW_MS ne comptent plus, pour ne pas verrouiller un compte à
// cause d'une poignée d'erreurs de frappe étalées sur plusieurs jours.
const MAX_FAILED_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export function getLockStatus(user) {
  if (!user?.lockUntil) return { locked: false };
  const lockUntil = new Date(user.lockUntil).getTime();
  if (lockUntil <= Date.now()) return { locked: false };
  return { locked: true, lockUntil: user.lockUntil };
}

// Retourne { locked, attempts, lockUntil } après avoir enregistré l'échec.
export function recordLoginFailure(id) {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return { locked: false, attempts: 0 };
  const user = users[idx];
  const now = Date.now();
  const withinWindow = user.lastFailedAt && (now - new Date(user.lastFailedAt).getTime()) < FAILURE_WINDOW_MS;
  const attempts = (withinWindow ? user.failedAttempts || 0 : 0) + 1;
  user.failedAttempts = attempts;
  user.lastFailedAt = new Date(now).toISOString();
  let locked = false;
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    user.lockUntil = new Date(now + LOCK_DURATION_MS).toISOString();
    locked = true;
  }
  writeStore('users', users);
  return { locked, attempts, lockUntil: user.lockUntil || null };
}

export function recordLoginSuccess(id) {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  users[idx].failedAttempts = 0;
  users[idx].lastFailedAt = null;
  users[idx].lockUntil = null;
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

// Sort l'utilisateur de l'assistant de première connexion, une fois pour toutes.
export function clearOnboarding(id) {
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  users[idx].mustOnboard = false;
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

const TERMINAL_TIERS = ['developer', 'maintainer', 'admin', null];
export function setTerminalTier(id, tier) {
  if (!TERMINAL_TIERS.includes(tier)) {
    throw Object.assign(new Error('Palier de terminal invalide'), { status: 400 });
  }
  const users = listUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return null;
  users[idx].terminalTier = tier;
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
