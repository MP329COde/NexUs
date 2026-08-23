import * as k8s from './integrations/kubernetesService.js';
import { createNotification } from '../store/notificationsStore.js';
import { logger } from '../utils/logger.js';
import { registerWorker, recordWorkerRun } from './startupStatusService.js';

registerWorker('clusterHealthChecks', { description: 'Vérification santé Kubernetes (CrashLoopBackOff, Pending prolongé)', intervalMs: 60_000 });

const CHECK_INTERVAL_MS = 60_000;
const RESTART_THRESHOLD = 5;
const PENDING_THRESHOLD_MS = 10 * 60 * 1000;
const MAX_ALERTED_KEYS = 2000;

// Alerte automatique sur les événements critiques d'un namespace, à partir
// de signaux Kubernetes réels déjà exposés par listPods (aucune donnée
// inventée) : redémarrages excessifs (proxy d'un CrashLoopBackOff) et pod
// resté en attente prolongée. Un franchissement de seuil n'est notifié
// qu'une seule fois (clé mémorisée dans `alerted`) pour ne pas spammer la
// même alerte à chaque passage de la boucle.
let alerted = new Set();
let pendingSince = new Map();

export async function checkClusterHealth() {
  let pods;
  try {
    pods = await k8s.listPods();
  } catch {
    return; // Kubernetes non configuré : rien à vérifier
  }

  const seenKeys = new Set(pods.map((p) => `${p.namespace}/${p.name}`));
  for (const key of pendingSince.keys()) {
    if (!seenKeys.has(key)) pendingSince.delete(key);
  }

  for (const pod of pods) {
    const key = `${pod.namespace}/${pod.name}`;

    if (pod.phase === 'Pending') {
      if (!pendingSince.has(key)) pendingSince.set(key, Date.now());
      const since = pendingSince.get(key);
      const alertKey = `pending:${key}`;
      if (Date.now() - since >= PENDING_THRESHOLD_MS && !alerted.has(alertKey)) {
        alerted.add(alertKey);
        createNotification({
          type: 'kubernetes.pod.pending', severity: 'warn', title: 'Pod en attente prolongée',
          message: `${pod.name} (${pod.namespace}) est en Pending depuis plus de ${Math.round(PENDING_THRESHOLD_MS / 60000)} minutes.`,
          meta: { namespace: pod.namespace, pod: pod.name }
        });
      }
    } else {
      pendingSince.delete(key);
      alerted.delete(`pending:${key}`);
    }

    if (pod.restarts >= RESTART_THRESHOLD) {
      const alertKey = `restarts:${key}:${pod.restarts}`;
      if (!alerted.has(alertKey)) {
        alerted.add(alertKey);
        createNotification({
          type: 'kubernetes.pod.crashloop', severity: 'crit', title: 'Redémarrages excessifs (possible CrashLoopBackOff)',
          message: `${pod.name} (${pod.namespace}) a redémarré ${pod.restarts} fois.`,
          meta: { namespace: pod.namespace, pod: pod.name, restarts: pod.restarts }
        });
      }
    }
  }

  if (alerted.size > MAX_ALERTED_KEYS) alerted = new Set([...alerted].slice(-1000));
}

export function scheduleClusterHealthChecks() {
  const run = () => {
    checkClusterHealth()
      .then(() => recordWorkerRun('clusterHealthChecks', { ok: true }))
      .catch((err) => { logger.error({ err }, 'Échec de la vérification santé Kubernetes'); recordWorkerRun('clusterHealthChecks', { ok: false, error: err }); });
    setTimeout(run, CHECK_INTERVAL_MS);
  };
  run();
}
