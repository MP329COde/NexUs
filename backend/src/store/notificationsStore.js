import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Notifications persistantes côté serveur pour les événements de sécurité
// qu'un admin doit voir même s'il n'était pas connecté au moment des faits
// (verrouillage de compte, bannissement IP automatique, secret committé
// détecté, vulnérabilité critique trouvée par Trivy) — distinct du système
// de toasts éphémères du frontend (NotificationContext.jsx), qui ne
// survit pas à un rechargement de page. Visibles par tous les admins (pas
// de ciblage par utilisateur pour l'instant : ce sont des événements
// plateforme, pas des messages personnels).
const MAX_NOTIFICATIONS = 300;

export function listNotifications() {
  return readStore('notifications') || [];
}

export function createNotification({ type, severity = 'info', title, message, meta }) {
  const notifications = listNotifications();
  const entry = {
    id: uuid(), type, severity, title, message, meta: meta || null,
    read: false, createdAt: new Date().toISOString()
  };
  notifications.unshift(entry);
  writeStore('notifications', notifications.slice(0, MAX_NOTIFICATIONS));
  return entry;
}

export function markRead(id) {
  const notifications = listNotifications();
  const entry = notifications.find((n) => n.id === id);
  if (!entry) return null;
  entry.read = true;
  writeStore('notifications', notifications);
  return entry;
}

export function markAllRead() {
  const notifications = listNotifications();
  let changed = 0;
  for (const n of notifications) {
    if (!n.read) { n.read = true; changed += 1; }
  }
  if (changed > 0) writeStore('notifications', notifications);
  return changed;
}

export function unreadCount() {
  return listNotifications().filter((n) => !n.read).length;
}
