import { readStore, writeStore } from '../store/jsonStore.js';
import { integrations } from './integrationRegistry.js';
import { logger } from '../utils/logger.js';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 heure

// Interroge toutes les intégrations (même agrégation que status.routes.js)
// et enregistre un point horodaté { ts, score, domains: { k8s: {configured, healthy}, ... } }
// pour alimenter la disponibilité 24h/30j de la page d'accueil.
export async function recordSnapshot() {
  const entries = await Promise.all(Object.entries(integrations).map(async ([key, def]) => {
    try {
      const status = await def.service.getStatus();
      return { domain: def.domain, ...status };
    } catch (err) {
      return { domain: def.domain, configured: true, ok: false, message: err.message };
    }
  }));

  const configured = entries.filter((e) => e.configured);
  const healthy = configured.filter((e) => e.ok);
  const score = configured.length ? Math.round((healthy.length / configured.length) * 100) : null;

  const domains = {};
  for (const e of entries) {
    if (!domains[e.domain]) domains[e.domain] = { configured: 0, healthy: 0 };
    if (e.configured) {
      domains[e.domain].configured += 1;
      if (e.ok) domains[e.domain].healthy += 1;
    }
  }

  const snapshot = { ts: new Date().toISOString(), score, domains };
  const history = readStore('statusHistory') || [];
  history.push(snapshot);
  const cutoff = Date.now() - RETENTION_MS;
  const pruned = history.filter((h) => new Date(h.ts).getTime() >= cutoff);
  writeStore('statusHistory', pruned);
  return snapshot;
}

export function getHistory() {
  return readStore('statusHistory') || [];
}

// Planifie un relevé horaire, sans dépendance externe (même pattern que
// scheduleDailyBackups() dans backupService.js).
export function scheduleHourlyStatusSnapshot() {
  const run = () => {
    recordSnapshot().catch((err) => logger.error({ err }, 'Échec du relevé de statut planifié'));
    setTimeout(run, SNAPSHOT_INTERVAL_MS);
  };
  run();
}
