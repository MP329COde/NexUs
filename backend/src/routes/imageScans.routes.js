import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { scanImage } from '../services/trivyService.js';
import { runScheduledTrivyScan } from '../services/scheduledTrivyScanService.js';
import { listScans, recordScan, getScan } from '../store/imageScansStore.js';
import { logAudit } from '../services/auditService.js';
import { createNotification } from '../store/notificationsStore.js';

// Scan de vulnérabilités d'images de conteneurs via Trivy (open source, en
// local sur la machine backend — voir services/trivyService.js). Réservé
// aux admins, comme le reste des scans de sécurité de la plateforme.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, items: listScans() });
});

router.get('/:id', (req, res) => {
  const scan = getScan(req.params.id);
  if (!scan) return res.status(404).json({ ok: false, error: 'Scan introuvable' });
  res.json({ ok: true, scan });
});

router.post('/', asyncHandler(async (req, res) => {
  const { imageRef } = req.body || {};
  if (!imageRef) return res.status(400).json({ ok: false, error: "Référence d'image requise (ex. nginx:1.27)" });
  const result = await scanImage(imageRef);
  const entry = recordScan({ ...result, trigger: 'manual' });
  logAudit(req, 'security.imageScan.run', { imageRef, total: result.total, counts: result.counts });
  const critical = result.counts.CRITICAL || 0;
  const high = result.counts.HIGH || 0;
  if (critical > 0 || high > 0) {
    createNotification({
      type: 'security.imageScan.vulnerable', severity: critical > 0 ? 'crit' : 'warn', title: 'Vulnérabilités trouvées',
      message: `${imageRef} : ${critical} CRITICAL, ${high} HIGH.`,
      meta: { imageRef, scanId: entry.id, counts: result.counts }
    });
  }
  res.status(201).json({ ok: true, scan: entry });
}));

// Déclenchement manuel du cycle planifié (voir scheduleHourlyTrivyScan dans
// index.js), pour vérifier/tester sans attendre l'heure suivante — re-scanne
// chaque image déjà vue en scan manuel, jamais une cible inventée.
router.post('/run-scheduled', asyncHandler(async (req, res) => {
  const result = await runScheduledTrivyScan();
  logAudit(req, 'security.imageScan.scheduledRun', result);
  res.json({ ok: true, ...result });
}));

export default router;
