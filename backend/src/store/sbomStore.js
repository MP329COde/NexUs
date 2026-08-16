import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Historique des SBOM générés via Syft (voir services/syftService.js).
const MAX_HISTORY = 30;

export function listSboms() {
  return readStore('sboms') || [];
}

export function recordSbom(sbom) {
  const sboms = listSboms();
  const entry = { id: uuid(), ...sbom };
  sboms.unshift(entry);
  writeStore('sboms', sboms.slice(0, MAX_HISTORY));
  return entry;
}

export function getSbom(id) {
  return listSboms().find((s) => s.id === id) || null;
}
