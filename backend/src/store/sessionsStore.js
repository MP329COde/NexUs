import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Sessions actives réelles (Priorité 6 — durcissement sécurité) : jusqu'ici
// la seule granularité de révocation était globale (tokenVersion, voir
// usersStore.incrementTokenVersion) — un utilisateur ne pouvait ni voir ses
// sessions ouvertes (device/IP/dernière activité) ni en révoquer une seule
// sans se déconnecter partout. Chaque login (mot de passe, MFA, WebAuthn)
// crée désormais une entrée ici, portée dans le JWT via `sid` (voir
// middleware/auth.js#issueSessionCookies) ; requireAuth vérifie qu'elle
// n'est pas révoquée et met à jour lastSeenAt à chaque requête.
export function createSession(userId, { ip, userAgent }) {
  const sessions = readStore('sessions');
  const session = {
    id: uuid(), userId, ip: ip || null, userAgent: userAgent || null,
    createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), revoked: false
  };
  sessions.push(session);
  writeStore('sessions', sessions);
  return session;
}

export function touchSession(id) {
  const sessions = readStore('sessions');
  const session = sessions.find((s) => s.id === id);
  if (!session) return;
  session.lastSeenAt = new Date().toISOString();
  writeStore('sessions', sessions);
}

export function getSession(id) {
  return readStore('sessions').find((s) => s.id === id) || null;
}

export function listSessionsForUser(userId) {
  return readStore('sessions')
    .filter((s) => s.userId === userId && !s.revoked)
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

// Révoque une session précise si elle appartient bien à `userId` (jamais de
// révocation croisée entre comptes). Retourne false si introuvable/pas la
// sienne, pour que la route puisse renvoyer un 404 plutôt qu'un faux succès.
export function revokeSession(id, userId) {
  const sessions = readStore('sessions');
  const session = sessions.find((s) => s.id === id && s.userId === userId);
  if (!session) return false;
  session.revoked = true;
  writeStore('sessions', sessions);
  return true;
}

// Utilisé par le changement de mot de passe / logout global existants pour
// que les sessions listées reflètent la révocation déjà opérée via
// tokenVersion, plutôt que de continuer à afficher des sessions mortes.
export function revokeAllSessionsForUser(userId, exceptId) {
  const sessions = readStore('sessions');
  let changed = false;
  for (const s of sessions) {
    if (s.userId === userId && !s.revoked && s.id !== exceptId) {
      s.revoked = true;
      changed = true;
    }
  }
  if (changed) writeStore('sessions', sessions);
}
