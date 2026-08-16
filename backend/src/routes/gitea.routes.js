import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as gitea from '../services/integrations/giteaService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await gitea.getStatus() })));
router.get('/repos', asyncHandler(async (req, res) => res.json({ ok: true, items: await gitea.listRepos() })));
router.get('/repos/:owner/:repo/pulls', asyncHandler(async (req, res) => res.json({ ok: true, items: await gitea.listPullRequests(req.params.owner, req.params.repo) })));

export default router;
