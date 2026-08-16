import { scanImage } from './trivyService.js';
import { listScans, recordScan } from '../store/imageScansStore.js';
import { createNotification } from '../store/notificationsStore.js';
import { logger } from '../utils/logger.js';

// Re-scanne périodiquement chaque image déjà scannée manuellement au moins
// une fois (voir routes/imageScans.routes.js) plutôt qu'un ensemble d'images
// inventé : ce sont les seules images dont l'existence/l'accessibilité est
// confirmée par un usage réel de la console — pas de registre privé intégré
// pour en découvrir d'autres (voir Propositions dans fonctions.md).
const SCAN_INTERVAL_MS = 60 * 60 * 1000;

function distinctImageRefs() {
  const seen = new Set();
  const refs = [];
  for (const scan of listScans()) {
    if (!seen.has(scan.imageRef)) {
      seen.add(scan.imageRef);
      refs.push(scan.imageRef);
    }
  }
  return refs;
}

export async function runScheduledTrivyScan() {
  const refs = distinctImageRefs();
  let scanned = 0;
  for (const imageRef of refs) {
    const previous = listScans().find((s) => s.imageRef === imageRef) || null;
    try {
      const result = await scanImage(imageRef);
      recordScan({ ...result, trigger: 'scheduled' });
      scanned += 1;
      const prevCritical = previous?.counts?.CRITICAL || 0;
      if (result.counts.CRITICAL > prevCritical) {
        createNotification({
          type: 'security.image.new_critical', severity: 'crit', title: 'Nouvelle vulnérabilité critique',
          message: `${result.counts.CRITICAL} vulnérabilité(s) critique(s) détectée(s) sur "${imageRef}" (scan planifié Trivy).`,
          meta: { imageRef, critical: result.counts.CRITICAL, previousCritical: prevCritical }
        });
      }
    } catch (err) {
      logger.error({ err, imageRef }, 'Échec du scan Trivy planifié');
    }
  }
  return { scanned, total: refs.length };
}

export function scheduleHourlyTrivyScan() {
  const run = async () => {
    try { await runScheduledTrivyScan(); } catch (err) { logger.error({ err }, 'Échec du cycle de scan Trivy planifié'); }
    setTimeout(run, SCAN_INTERVAL_MS);
  };
  setTimeout(run, SCAN_INTERVAL_MS);
}
