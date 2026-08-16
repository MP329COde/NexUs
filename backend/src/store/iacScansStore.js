import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Historique des scans Checkov (IaC) déclenchés manuellement — voir
// services/checkovService.js.
const MAX_HISTORY = 50;

export function listScans() {
  return readStore('iacScans') || [];
}

export function recordScan(scan) {
  const scans = listScans();
  const entry = { id: uuid(), ...scan };
  scans.unshift(entry);
  writeStore('iacScans', scans.slice(0, MAX_HISTORY));
  return entry;
}

export function getScan(id) {
  return listScans().find((s) => s.id === id) || null;
}
