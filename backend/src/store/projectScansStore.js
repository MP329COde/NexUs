import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Historique des scans SAST/SCA/IaC par projet (voir services/projectScanService.js).
const MAX_HISTORY_PER_PROJECT = 20;

export function listScans(projectId) {
  const all = readStore('projectScans') || [];
  return all.filter((s) => s.projectId === projectId);
}

export function recordScan(projectId, results) {
  const all = readStore('projectScans') || [];
  const entry = { id: uuid(), projectId, createdAt: new Date().toISOString(), results };
  all.unshift(entry);
  const kept = [];
  const countByProject = new Map();
  for (const s of all) {
    const n = countByProject.get(s.projectId) || 0;
    if (n < MAX_HISTORY_PER_PROJECT) { kept.push(s); countByProject.set(s.projectId, n + 1); }
  }
  writeStore('projectScans', kept);
  return entry;
}

export function getScan(id) {
  return (readStore('projectScans') || []).find((s) => s.id === id) || null;
}
