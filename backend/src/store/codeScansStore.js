import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Historique des scans Semgrep déclenchés manuellement (voir
// services/semgrepService.js) — résumé uniquement (findings tronqués),
// jamais le rapport JSON brut complet.
const MAX_HISTORY = 50;

export function listScans() {
  return readStore('codeScans') || [];
}

export function recordScan(scan) {
  const scans = listScans();
  const entry = { id: uuid(), ...scan };
  scans.unshift(entry);
  writeStore('codeScans', scans.slice(0, MAX_HISTORY));
  return entry;
}

export function getScan(id) {
  return listScans().find((s) => s.id === id) || null;
}
