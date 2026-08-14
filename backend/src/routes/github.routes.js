import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as github from '../services/integrations/githubService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await github.getStatus() })));
router.get('/repos', asyncHandler(async (req, res) => res.json({ ok: true, items: await github.listRepos() })));
router.get('/repos/:owner/:repo/runs', asyncHandler(async (req, res) => res.json({ ok: true, items: await github.listWorkflowRuns(req.params.owner, req.params.repo) })));
router.get('/repos/:owner/:repo/pulls', asyncHandler(async (req, res) => res.json({ ok: true, items: await github.listPullRequests(req.params.owner, req.params.repo) })));
// Le rerun de workflow et l'approbation de PR ne vivent plus ici : voir
// gitlab.routes.js (équivalent GitLab) pour la même raison — dupliqués sans
// aucune vérification de portée par routes/pipelines.routes.js,
// routes/reviews.routes.js et leurs équivalents scopés au projet dans
// routes/projects.routes.js, et non appelés par le frontend.

export default router;
