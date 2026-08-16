import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { scanCode } from '../services/semgrepService.js';
import { listScans, recordScan, getScan } from '../store/codeScansStore.js';
import { logAudit } from '../services/auditService.js';
import { createNotification } from '../store/notificationsStore.js';

// Analyse statique de code via Semgrep (open source, en local — voir
// services/semgrepService.js). Cible fermée (le code de la plateforme
// elle-même, backend/frontend) — pas de chemin arbitraire côté client.
// Réservé aux admins, comme le reste des scans de sécurité.
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
  const target = req.body?.target || 'all';
  const result = await scanCode(target);
  const entry = recordScan(result);
  logAudit(req, 'security.codeScan.run', { target, total: result.total, counts: result.counts });
  if (result.counts.ERROR > 0) {
    createNotification({
      type: 'security.codeScan.findings', severity: 'crit', title: 'Problèmes de code détectés',
      message: `Scan Semgrep (${target}) : ${result.counts.ERROR} ERROR, ${result.counts.WARNING} WARNING.`,
      meta: { scanId: entry.id, target, counts: result.counts }
    });
  }
  res.status(201).json({ ok: true, scan: entry });
}));

export default router;
