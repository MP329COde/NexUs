import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listAuditEntries } from '../services/auditService.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, items: listAuditEntries({ limit: Number(req.query.limit) || 200, integrationKey: req.query.integrationKey || null }) });
});

export default router;
