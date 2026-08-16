import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Métadonnées des espaces de travail Terraform générés par Nexus (voir
// services/terraformService.js pour les fichiers .tf eux-mêmes, écrits sur
// disque dans data/terraform/<id>/, jamais commités).
export function listWorkspaces() {
  return readStore('iacWorkspaces') || [];
}

export function getWorkspace(id) {
  return listWorkspaces().find((w) => w.id === id) || null;
}

export function createWorkspace(payload) {
  const workspaces = listWorkspaces();
  const entry = { id: uuid(), createdAt: new Date().toISOString(), lastPlanAt: null, lastPlanSummary: null, lastApplyAt: null, ...payload };
  workspaces.unshift(entry);
  writeStore('iacWorkspaces', workspaces);
  return entry;
}

export function updateWorkspace(id, payload) {
  const workspaces = listWorkspaces();
  const idx = workspaces.findIndex((w) => w.id === id);
  if (idx === -1) return null;
  workspaces[idx] = { ...workspaces[idx], ...payload };
  writeStore('iacWorkspaces', workspaces);
  return workspaces[idx];
}

export function deleteWorkspace(id) {
  const workspaces = listWorkspaces();
  const next = workspaces.filter((w) => w.id !== id);
  writeStore('iacWorkspaces', next);
  return next.length !== workspaces.length;
}
