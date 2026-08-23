// Suivi minimal et honnête du démarrage du process backend (Lot A7).
//
// Ne construit PAS l'écran de bootstrap complet prévu au Lot D9 (progression
// détaillée, UI dédiée avant que l'app soit utilisable) : ici on se contente
// de mémoriser, en mémoire process, l'ordre et la durée des étapes de
// démarrage réellement exécutées dans index.js (migrations, admin bootstrap,
// planificateurs), pour que GET /api/system/status/startup réponde avec des
// faits vérifiés plutôt qu'un "tout va bien" supposé. Repart de zéro à
// chaque redémarrage du process — pas de persistance, ce n'est pas un
// historique.

const startedAt = Date.now();
const steps = [];
let readyAt = null;

export function beginStep(name) {
  const step = { name, status: 'running', startedAt: Date.now(), finishedAt: null, durationMs: null, error: null };
  steps.push(step);
  return {
    ok() {
      step.status = 'ok';
      step.finishedAt = Date.now();
      step.durationMs = step.finishedAt - step.startedAt;
    },
    fail(err) {
      step.status = 'failed';
      step.finishedAt = Date.now();
      step.durationMs = step.finishedAt - step.startedAt;
      step.error = err?.message || String(err);
    }
  };
}

export function markReady() {
  readyAt = Date.now();
}

export function getStartupStatus() {
  return {
    startedAt: new Date(startedAt).toISOString(),
    readyAt: readyAt ? new Date(readyAt).toISOString() : null,
    ready: readyAt !== null,
    uptimeMs: Date.now() - startedAt,
    steps: steps.map((s) => ({ ...s, startedAt: new Date(s.startedAt).toISOString(), finishedAt: s.finishedAt ? new Date(s.finishedAt).toISOString() : null }))
  };
}
