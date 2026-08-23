import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import * as kubernetes from './integrations/kubernetesService.js';
import { createNotification } from '../store/notificationsStore.js';
import { logger } from '../utils/logger.js';

// Nettoyage automatique des environnements de preview expirés (ÉTAPE 11,
// suite) : `expires_at` était affiché (EnvironmentsPage.jsx, MyWorkPage.jsx)
// mais jamais appliqué — aucune infrastructure cron/setInterval n'existait
// (limite documentée dans todo.md). Détruit réellement le namespace
// Kubernetes provisionné quand il y en a un (kubernetesService.deleteNamespace),
// puis l'enregistrement en base — jamais l'inverse, pour ne pas perdre la
// trace d'un environnement dont le namespace n'a pas pu être supprimé.
export async function runPreviewCleanup() {
  if (!pool) return { cleaned: 0, total: 0 };
  const expired = await orgStore.listAllExpiredEnvironments();
  let cleaned = 0;
  for (const env of expired) {
    try {
      if (env.provisioned_namespace) {
        await kubernetes.deleteNamespace(env.provisioned_namespace).catch((err) => {
          // Namespace déjà absent/Kubernetes non configuré : ne bloque pas la
          // suppression de l'enregistrement, mais c'est journalisé pour que
          // l'admin sache qu'aucune ressource n'a réellement été détruite.
          logger.warn({ err, namespace: env.provisioned_namespace }, 'Suppression du namespace de preview échouée (poursuite du nettoyage)');
        });
      }
      await orgStore.deleteEnvironment(env.id);
      cleaned += 1;
    } catch (err) {
      logger.error({ err, environmentId: env.id }, 'Échec du nettoyage d\'un environnement de preview expiré');
    }
  }
  if (cleaned > 0) {
    createNotification({
      type: 'environment.preview.cleaned', severity: 'info', title: 'Previews expirées nettoyées',
      message: `${cleaned} environnement(s) de preview expiré(s) supprimé(s) automatiquement.`,
      meta: { cleaned, total: expired.length }
    });
  }
  return { cleaned, total: expired.length };
}

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export function scheduleHourlyPreviewCleanup() {
  const run = async () => {
    try { await runPreviewCleanup(); } catch (err) { logger.error({ err }, 'Échec du cycle de nettoyage des previews'); }
    setTimeout(run, CLEANUP_INTERVAL_MS);
  };
  setTimeout(run, CLEANUP_INTERVAL_MS);
}
