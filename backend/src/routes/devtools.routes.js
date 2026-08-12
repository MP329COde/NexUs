import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { checkTools } from '../services/devToolsService.js';

// Détection d'outils sur la machine hébergeant le backend : information
// utile mais pas sensible, ouverte à tout utilisateur authentifié.
const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await checkTools() });
}));

export default router;
