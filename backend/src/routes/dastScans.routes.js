import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { scanUrl } from '../services/dastService.js';
import { listScans, recordScan, getScan } from '../store/dastScansStore.js';
import { logAudit } from '../services/auditService.js';
import { createNotification } from '../store/notificationsStore.js';

// DAST (OWASP ZAP) — voir services/dastService.js. Réservé aux admins, comme
// les autres scans (codeScans/iacScans/imageScans).
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
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: 'url requise' });
  const result = await scanUrl(url);
  const entry = recordScan(result);
  logAudit(req, 'security.dastScan.run', { url, total: result.total });
  if (result.counts.High > 0) {
    createNotification({
      type: 'security.dastScan.findings', severity: 'crit', title: 'Vulnérabilités critiques détectées (DAST)',
      message: `Scan OWASP ZAP sur ${url} : ${result.counts.High} alerte(s) à risque élevé.`,
      meta: { scanId: entry.id, url, high: result.counts.High }
    });
  }
  res.status(201).json({ ok: true, scan: entry });
}));

export default router;
