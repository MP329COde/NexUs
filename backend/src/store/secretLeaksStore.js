import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Historique des secrets détectés en clair dans un dépôt lié à un projet
// (voir services/secretLeakScanService.js). Ne stocke jamais le secret
// lui-même — seulement son label/tier/entrée de coffre, l'emplacement du
// fichier, et l'action prise (toujours 'rotated' pour l'instant : la
// rotation immédiate est automatique et inconditionnelle dès qu'un secret
// prod/project connu est trouvé).
export function listLeaks(projectId) {
  const leaks = readStore('secretLeaks') || [];
  return projectId ? leaks.filter((l) => l.projectId === projectId) : leaks;
}

export function recordLeak({ projectId, repoKey, filePath, vaultEntryId, label, tier, action }) {
  const leaks = readStore('secretLeaks') || [];
  const entry = {
    id: uuid(), projectId, repoKey, filePath, vaultEntryId, label, tier, action,
    detectedAt: new Date().toISOString()
  };
  leaks.unshift(entry);
  writeStore('secretLeaks', leaks.slice(0, 500));
  return entry;
}

export function getLastScanAt() {
  return (readStore('secretLeaks') || [])[0]?.detectedAt || null;
}
