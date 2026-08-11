import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as argocd from '../services/integrations/argocdService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await argocd.getStatus() })));
router.get('/applications', asyncHandler(async (req, res) => res.json({ ok: true, items: await argocd.listApplications() })));
router.get('/applications/:name', asyncHandler(async (req, res) => res.json({ ok: true, application: await argocd.getApplication(req.params.name) })));
router.post('/applications/:name/sync', asyncHandler(async (req, res) => res.json({ ok: true, ...(await argocd.syncApplication(req.params.name)) })));

export default router;
