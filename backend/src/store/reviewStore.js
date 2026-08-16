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

// Créneaux récurrents de revue de code : un jour de semaine (0=dimanche..6=samedi)
// + une plage horaire, avec des relecteurs désignés — pour planifier des
// sessions de revue régulières, indépendamment des MR/PR ouvertes à un instant T.
export function listSchedules() {
  return readStore('reviewSchedules') || [];
}

export function createSchedule({ label, weekday, startTime, endTime, reviewerIds }) {
  const all = listSchedules();
  const entry = {
    id: `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label: label || 'Revue de code',
    weekday,
    startTime,
    endTime,
    reviewerIds: reviewerIds || [],
    createdAt: new Date().toISOString()
  };
  all.push(entry);
  writeStore('reviewSchedules', all);
  return entry;
}

export function updateSchedule(id, patch) {
  const all = listSchedules();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, id };
  writeStore('reviewSchedules', all);
  return all[idx];
}

export function deleteSchedule(id) {
  const all = listSchedules();
  const next = all.filter((s) => s.id !== id);
  writeStore('reviewSchedules', next);
  return next.length !== all.length;
}
