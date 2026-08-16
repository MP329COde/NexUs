import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { scanIac } from '../services/checkovService.js';
import { listScans, recordScan, getScan } from '../store/iacScansStore.js';
import { logAudit } from '../services/auditService.js';
import { createNotification } from '../store/notificationsStore.js';

// Analyse IaC (Dockerfiles) via Checkov (open source — voir
// services/checkovService.js). Réservé aux admins.
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
  const result = await scanIac();
  const entry = recordScan(result);
  logAudit(req, 'security.iacScan.run', { total: result.total });
  if (result.total > 0) {
    createNotification({
      type: 'security.iacScan.findings', severity: 'warn', title: 'Problèmes IaC détectés',
      message: `Scan Checkov : ${result.total} vérification(s) échouée(s) sur les Dockerfiles.`,
      meta: { scanId: entry.id, total: result.total }
    });
  }
  res.status(201).json({ ok: true, scan: entry });
}));

export default router;
