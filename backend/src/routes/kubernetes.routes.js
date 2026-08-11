import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as k8s from '../services/integrations/kubernetesService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await k8s.getStatus() })));
router.get('/namespaces', asyncHandler(async (req, res) => res.json({ ok: true, items: await k8s.listNamespaces() })));
router.get('/pods', asyncHandler(async (req, res) => res.json({ ok: true, items: await k8s.listPods(req.query.namespace) })));
router.get('/deployments', asyncHandler(async (req, res) => res.json({ ok: true, items: await k8s.listDeployments(req.query.namespace) })));
router.get('/services', asyncHandler(async (req, res) => res.json({ ok: true, items: await k8s.listServices(req.query.namespace) })));
router.get('/pods/:namespace/:pod/logs', asyncHandler(async (req, res) => {
  const logs = await k8s.getPodLogs(req.params.namespace, req.params.pod, req.query.container, Number(req.query.tail) || 200);
  res.json({ ok: true, logs });
}));
router.post('/deployments/:namespace/:name/restart', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await k8s.restartDeployment(req.params.namespace, req.params.name)) });
}));

export default router;
