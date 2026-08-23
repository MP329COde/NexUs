import { readStore, writeStore } from '../store/jsonStore.js';
import { list as listProxies, testConnection } from './proxyService.js';
import { logger } from '../utils/logger.js';
import { registerWorker, recordWorkerRun } from './startupStatusService.js';

registerWorker('hourlyStatusSnapshot', { description: 'Relevé de disponibilité 24h des services critiques', intervalMs: 60 * 60 * 1000 });

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

// Relevé horaire de disponibilité par service marqué "important" (proxies
// critiques) : alimente la carte "Disponibilité 24h" par service exposé de
// l'accueil en testant réellement chaque URL publique (voir
// proxyService.testConnection), plutôt que de dépendre d'une intégration.
export async function recordServiceSnapshot() {
  const critical = listProxies().filter((p) => p.critical);
  if (critical.length === 0) return null;
  const results = await Promise.all(critical.map(async (p) => {
    try {
      const r = await testConnection(p.id);
      return [p.id, r.ok];
    } catch {
      return [p.id, false];
    }
  }));
  const snapshot = { ts: new Date().toISOString(), services: Object.fromEntries(results) };
  const history = readStore('serviceHistory') || [];
  history.push(snapshot);
  const cutoff = Date.now() - RETENTION_MS;
  writeStore('serviceHistory', history.filter((h) => new Date(h.ts).getTime() >= cutoff));
  return snapshot;
}

export function getServiceHistory() {
  return readStore('serviceHistory') || [];
}

// Planifie un relevé horaire, sans dépendance externe (même pattern que
// scheduleDailyBackups() dans backupService.js).
export function scheduleHourlyStatusSnapshot() {
  const run = () => {
    recordServiceSnapshot()
      .then(() => recordWorkerRun('hourlyStatusSnapshot', { ok: true }))
      .catch((err) => { logger.error({ err }, 'Échec du relevé de disponibilité par service'); recordWorkerRun('hourlyStatusSnapshot', { ok: false, error: err }); });
    setTimeout(run, SNAPSHOT_INTERVAL_MS);
  };
  run();
}
