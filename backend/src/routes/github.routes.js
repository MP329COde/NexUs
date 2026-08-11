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
router.post('/repos/:owner/:repo/runs/:runId/rerun', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await github.rerunWorkflow(req.params.owner, req.params.repo, req.params.runId)) });
}));

export default router;
