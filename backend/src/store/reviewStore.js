import { readStore, writeStore } from './jsonStore.js';

// Suivi local des relecteurs assignés sur une MR/PR réelle (GitLab/GitHub
// n'exposent pas d'assignation de relecteurs via les jetons/API utilisés ici) :
// une couche fine par-dessus les vraies demandes de fusion, jamais un
// remplacement. Clé = `${provider}:${repo}:${iid|number}`.
export function listAssignments() {
  return readStore('reviewAssignments') || [];
}

export function getAssignment(key) {
  return listAssignments().find((a) => a.key === key) || null;
}

export function assign(key, userId) {
  const all = listAssignments();
  const idx = all.findIndex((a) => a.key === key);
  if (idx === -1) {
    all.push({ key, reviewerIds: [userId], updatedAt: new Date().toISOString() });
  } else if (!all[idx].reviewerIds.includes(userId)) {
    all[idx] = { ...all[idx], reviewerIds: [...all[idx].reviewerIds, userId], updatedAt: new Date().toISOString() };
  }
  writeStore('reviewAssignments', all);
  return all.find((a) => a.key === key);
}

// "Soulager" un relecteur : retire son assignation sans toucher à la MR/PR
// elle-même côté forge.
export function unassign(key, userId) {
  const all = listAssignments();
  const idx = all.findIndex((a) => a.key === key);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], reviewerIds: all[idx].reviewerIds.filter((id) => id !== userId), updatedAt: new Date().toISOString() };
  writeStore('reviewAssignments', all);
  return all[idx];
}
