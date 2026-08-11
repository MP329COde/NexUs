import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as gitlab from '../services/integrations/gitlabService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await gitlab.getStatus() })));
router.get('/projects', asyncHandler(async (req, res) => res.json({ ok: true, items: await gitlab.listProjects() })));
router.get('/projects/:id/pipelines', asyncHandler(async (req, res) => res.json({ ok: true, items: await gitlab.listPipelines(req.params.id) })));
router.get('/projects/:id/merge-requests', asyncHandler(async (req, res) => res.json({ ok: true, items: await gitlab.listMergeRequests(req.params.id) })));
router.post('/projects/:id/pipelines/:pipelineId/retry', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await gitlab.retryPipeline(req.params.id, req.params.pipelineId)) });
}));

export default router;
