import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as certManager from '../services/integrations/certManagerService.js';
import { renewCertificate } from '../services/integrations/kubernetesService.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await certManager.getStatus() })));
router.get('/certificates', asyncHandler(async (req, res) => res.json({ ok: true, items: await certManager.listCertificates(req.query.namespace) })));
router.post('/certificates/:namespace/:name/renew', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await renewCertificate(req.params.namespace, req.params.name);
  logAudit(req, 'certmanager.certificate.renewed', { namespace: req.params.namespace, name: req.params.name });
  res.json({ ok: true, ...result });
}));

export default router;
