import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as deploymentService from '../services/deploymentService.js';
import { syncApplication } from '../services/integrations/argocdService.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => res.json({ ok: true, items: deploymentService.list() })));
router.post('/', asyncHandler(async (req, res) => res.status(201).json({ ok: true, link: deploymentService.create(req.body || {}) })));
router.put('/:id', asyncHandler(async (req, res) => res.json({ ok: true, link: deploymentService.update(req.params.id, req.body || {}) })));
router.delete('/:id', asyncHandler(async (req, res) => res.json(deploymentService.remove(req.params.id))));
router.get('/:id/pipeline', asyncHandler(async (req, res) => res.json({ ok: true, ...(await deploymentService.getPipeline(req.params.id)) })));
router.post('/:id/sync', asyncHandler(async (req, res) => {
  const link = deploymentService.list().find((l) => l.id === req.params.id);
  if (!link?.argocdAppName) return res.status(409).json({ ok: false, error: 'Aucune application Argo CD associée' });
  res.json({ ok: true, ...(await syncApplication(link.argocdAppName)) });
}));

export default router;
