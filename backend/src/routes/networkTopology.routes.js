import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { getTopology } from '../services/networkTopologyService.js';

const router = Router();
router.use(requireAuth);

router.get('/topology', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await getTopology()) });
}));

export default router;
