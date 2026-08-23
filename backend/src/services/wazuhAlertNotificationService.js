import * as wazuh from './integrations/wazuhService.js';
import { createNotification } from '../store/notificationsStore.js';
import { logger } from '../utils/logger.js';

const CHECK_INTERVAL_MS = 60_000;
const MAX_NOTIFIED_KEYS = 2000;

// Notifie les admins (store/notificationsStore.js, même mécanisme que le
// Lot D3 pour les demandes d'accès terminal) des nouvelles alertes Wazuh de
// sévérité critique (rule.level >= 12) — même schéma de déduplication en
// mémoire process que services/kubernetesAlertService.js : chaque alerte
// (identifiée par son _id OpenSearch, stable) n'est notifiée qu'une seule
// fois. Ne fait rien si l'indexeur Wazuh n'est pas configuré (pas d'erreur
// bruyante en boucle).
let notified = new Set();

export async function checkCriticalAlerts() {
  if (!wazuh.getIndexerStatusSync().configured) return;
  let result;
  try {
    result = await wazuh.searchAlerts({ severity: 'critical', page: 1, pageSize: 20 });
  } catch (err) {
    logger.warn({ err }, 'Échec de la vérification des alertes Wazuh critiques');
    return;
  }
  for (const alert of result.items) {
    if (notified.has(alert.id)) continue;
    notified.add(alert.id);
    createNotification({
      type: 'wazuh.alert.critical',
      severity: 'crit',
      title: `Alerte Wazuh critique (niveau ${alert.level ?? '?'})`,
      message: `${alert.description}${alert.agentName ? ` — agent ${alert.agentName}` : ''}`,
      meta: { alertId: alert.id, agentId: alert.agentId, agentName: alert.agentName, hostId: alert.host?.id || null, ruleId: alert.ruleId }
    });
  }
  if (notified.size > MAX_NOTIFIED_KEYS) notified = new Set([...notified].slice(-1000));
}

export function scheduleWazuhAlertChecks() {
  const run = () => {
    checkCriticalAlerts().catch((err) => logger.error({ err }, 'Échec de la vérification des alertes Wazuh'));
    setTimeout(run, CHECK_INTERVAL_MS);
  };
  run();
}
