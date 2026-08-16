import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { scanImage } from '../services/trivyService.js';
import { listScans, recordScan, getScan } from '../store/imageScansStore.js';
import { logAudit } from '../services/auditService.js';

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
  const entry = recordScan(result);
  logAudit(req, 'security.imageScan.run', { imageRef, total: result.total, counts: result.counts });
  res.status(201).json({ ok: true, scan: entry });
}));

export default router;
