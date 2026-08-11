import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as certManager from '../services/integrations/certManagerService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await certManager.getStatus() })));
router.get('/certificates', asyncHandler(async (req, res) => res.json({ ok: true, items: await certManager.listCertificates(req.query.namespace) })));

export default router;
