import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getVersion, checkForUpdates } from '../services/updateService.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/version', (req, res) => {
  res.json({ ok: true, version: getVersion() });
});

router.get('/updates/check', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...checkForUpdates() });
}));

export default router;
