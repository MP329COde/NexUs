import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Historique des scans Trivy déclenchés manuellement (voir
// services/trivyService.js, routes/imageScans.routes.js) — ne garde que le
// résumé (compteurs par sévérité + findings tronqués), jamais le rapport
// JSON brut complet, pour ne pas faire grossir le store indéfiniment.
const MAX_HISTORY = 100;

export function listScans() {
  return readStore('imageScans') || [];
}

export function recordScan(scan) {
  const scans = listScans();
  const entry = { id: uuid(), ...scan };
  scans.unshift(entry);
  writeStore('imageScans', scans.slice(0, MAX_HISTORY));
  return entry;
}

export function getScan(id) {
  return listScans().find((s) => s.id === id) || null;
}
