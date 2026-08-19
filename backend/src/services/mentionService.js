import { findUserByUsername, listUsers } from '../store/usersStore.js';

// Résout @handle en id réel, pour notifier une mention dans un commentaire.
// `username` est optionnel (souvent absent, cf. usersStore.js createUser) :
// repli sur la partie locale de l'e-mail (avant @), qui existe toujours et
// reste le handle affiché par défaut dans l'UI (ex. "alex.lambert" pour
// alex.lambert@exemple.com). Un handle inconnu est simplement ignoré —
// jamais d'erreur pour une faute de frappe dans une mention.
// Extrait de routes/projects.routes.js (commentaires de tâche) pour être
// réutilisé par les commentaires génériques (entity_comments).
export function extractMentionedUserIds(text) {
  const handles = [...text.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1].toLowerCase());
  const ids = new Set();
  for (const handle of handles) {
    const byUsername = findUserByUsername(handle);
    const byEmailPrefix = byUsername ? null : listUsers().find((u) => u.email.split('@')[0].toLowerCase() === handle);
    const match = byUsername || byEmailPrefix;
    if (match) ids.add(match.id);
  }
  return [...ids];
}
