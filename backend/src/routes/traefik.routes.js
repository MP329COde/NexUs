import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as traefik from '../services/integrations/traefikService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await traefik.getStatus() })));
router.get('/routers', asyncHandler(async (req, res) => res.json({ ok: true, items: await traefik.listRouters() })));
router.get('/services', asyncHandler(async (req, res) => res.json({ ok: true, items: await traefik.listServices() })));

export default router;
