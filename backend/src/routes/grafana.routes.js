import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as grafana from '../services/integrations/grafanaService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await grafana.getStatus() })));
router.get('/dashboards', asyncHandler(async (req, res) => res.json({ ok: true, items: await grafana.listDashboards() })));
router.get('/alerts', asyncHandler(async (req, res) => res.json({ ok: true, items: await grafana.listAlerts() })));

export default router;
