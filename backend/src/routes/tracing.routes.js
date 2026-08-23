import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as tracing from '../services/integrations/tracingService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await tracing.getStatus() })));

router.get('/search', asyncHandler(async (req, res) => {
  if (!req.query.service) return res.status(400).json({ ok: false, error: 'service requis' });
  const items = await tracing.searchTraces(req.query.service, { limit: Number(req.query.limit) || 20 });
  res.json({ ok: true, items, uiUrl: tracing.tracingUiUrl(req.query.service) });
}));

export default router;
