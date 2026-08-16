import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listTags, getRepository } from '../services/integrations/dockerHubService.js';

// Consultation du registre public Docker Hub — accessible à tout compte
// authentifié (lecture seule d'un registre public, pas une intégration
// privée à protéger comme les autres, voir dockerHubService.js).
const router = Router();
router.use(requireAuth);

router.get('/:namespace/:repo', asyncHandler(async (req, res) => {
  const repository = await getRepository(req.params.namespace, req.params.repo);
  res.json({ ok: true, repository });
}));

router.get('/:namespace/:repo/tags', asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const tags = await listTags(req.params.namespace, req.params.repo, page);
  res.json({ ok: true, ...tags });
}));

export default router;
