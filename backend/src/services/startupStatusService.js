// Suivi minimal et honnête du démarrage et de l'état runtime du process
// backend (Lot A7, étendu au Lot D9).
//
// Lot A7 se contentait de mémoriser, en mémoire process, l'ordre et la durée
// des étapes de démarrage réellement exécutées dans index.js (migrations,
// admin bootstrap, planificateurs). Le Lot D9 ajoute :
//   - des étapes plus granulaires (connexion DB, chargement config,
//     vérification intégrations, vérification certificats, vérification
//     réseau) — toujours mesurées réellement via beginStep()/ok()/fail(),
//     jamais une durée ou un statut inventé ;
//   - un registre des jobs planifiés (registerWorker) pour exposer un état
//     runtime continu (pas seulement au démarrage) : ce registre ne fait
//     qu'enregistrer ce qui a RÉELLEMENT été programmé dans index.js (nom,
//     intervalle réel lu dans le code du service concerné) — il n'invente
//     aucun scheduler et ne prétend pas connaître une "prochaine exécution"
//     que le service lui-même ne calcule pas.
//
// Repart de zéro à chaque redémarrage du process — pas de persistance, ce
// n'est pas un historique.

const startedAt = Date.now();
const steps = [];
let readyAt = null;

export function beginStep(name) {
  const step = { name, status: 'running', startedAt: Date.now(), finishedAt: null, durationMs: null, error: null, detail: null };
  steps.push(step);
  return {
    ok(detail) {
      step.status = 'ok';
      step.finishedAt = Date.now();
      step.durationMs = step.finishedAt - step.startedAt;
      if (detail !== undefined) step.detail = detail;
    },
    fail(err) {
      step.status = 'failed';
      step.finishedAt = Date.now();
      step.durationMs = step.finishedAt - step.startedAt;
      step.error = err?.message || String(err);
    },
    // Pour une étape non bloquante (ex: vérification intégrations) dont on
    // veut signaler un état dégradé sans faire échouer tout le démarrage.
    degraded(detail) {
      step.status = 'degraded';
      step.finishedAt = Date.now();
      step.durationMs = step.finishedAt - step.startedAt;
      if (detail !== undefined) step.detail = detail;
    }
  };
}

export function markReady() {
  readyAt = Date.now();
}

export function getStartupStatus() {
  const hasFailure = steps.some((s) => s.status === 'failed');
  return {
    startedAt: new Date(startedAt).toISOString(),
    readyAt: readyAt ? new Date(readyAt).toISOString() : null,
    ready: readyAt !== null,
    degraded: !hasFailure && steps.some((s) => s.status === 'degraded'),
    failedAtStep: steps.find((s) => s.status === 'failed')?.name || null,
    uptimeMs: Date.now() - startedAt,
    steps: steps.map((s) => ({
      ...s,
      startedAt: new Date(s.startedAt).toISOString(),
      finishedAt: s.finishedAt ? new Date(s.finishedAt).toISOString() : null
    }))
  };
}

// --- Registre des jobs planifiés (workers/jobs) -----------------------
//
// Rempli exclusivement par index.js juste après chaque appel schedule*()
// réel — jamais une liste statique indépendante du code qui planifie
// effectivement ces jobs. `intervalMs` est lu depuis la constante exportée
// (ou documentée en commentaire) du service concerné ; `lastRunAt` est mis à
// jour par recordWorkerRun() quand le service le permet, sinon reste `null`
// (honnête : aucun service de ce projet ne persiste de "dernière exécution"
// avant ce lot, donc `null` tant qu'aucun cycle n'a eu lieu depuis ce
// démarrage plutôt qu'une valeur inventée).
const workers = new Map();

export function registerWorker(name, { description, intervalMs = null, intervalHint = null } = {}) {
  workers.set(name, { name, description: description || null, intervalMs, intervalHint, registeredAt: Date.now(), lastRunAt: null, lastRunOk: null, lastRunError: null, runCount: 0 });
}

export function recordWorkerRun(name, { ok = true, error = null } = {}) {
  const w = workers.get(name);
  if (!w) return;
  w.lastRunAt = Date.now();
  w.lastRunOk = ok;
  w.lastRunError = error ? (error.message || String(error)) : null;
  w.runCount += 1;
}

export function getWorkersStatus() {
  return [...workers.values()].map((w) => ({
    ...w,
    registeredAt: new Date(w.registeredAt).toISOString(),
    lastRunAt: w.lastRunAt ? new Date(w.lastRunAt).toISOString() : null,
    nextRunEstimateAt: w.lastRunAt && w.intervalMs ? new Date(w.lastRunAt + w.intervalMs).toISOString() : null
  }));
}

export function getProcessRuntimeStatus() {
  return {
    up: true,
    pid: process.pid,
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    memoryRss: process.memoryUsage().rss
  };
}
