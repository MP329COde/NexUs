import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Raccourcis ajoutés manuellement par l'équipe vers des outils externes non
// intégrés à la console (wiki, SonarQube, Portainer...). Partagés entre tous
// les comptes (comme le reste des ressources opérationnelles de la console).
// Un raccourci peut aussi être rattaché à un projet (projectId) : il n'est
// alors listé que sur la fiche de ce projet, pas sur la page globale.
export function listShortcuts({ projectId } = {}) {
  const items = readStore('shortcuts') || [];
  return items.filter((s) => (projectId ? s.projectId === projectId : !s.projectId));
}

export function createShortcut({ label, url, category, projectId }) {
  const items = readStore('shortcuts') || [];
  const shortcut = {
    id: uuid(), label, url, category: category || 'Exécution', projectId: projectId || null,
    opens: 0, lastOpenedAt: null, createdAt: new Date().toISOString()
  };
  items.push(shortcut);
  writeStore('shortcuts', items);
  return shortcut;
}

export function findShortcut(id) {
  return (readStore('shortcuts') || []).find((s) => s.id === id) || null;
}

export function deleteShortcut(id) {
  const items = readStore('shortcuts') || [];
  const next = items.filter((s) => s.id !== id);
  writeStore('shortcuts', next);
  return next.length !== items.length;
}

export function recordOpen(id) {
  const items = readStore('shortcuts') || [];
  const idx = items.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], opens: (items[idx].opens || 0) + 1, lastOpenedAt: new Date().toISOString() };
  writeStore('shortcuts', items);
  return items[idx];
}
