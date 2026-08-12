import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as k8s from '../services/integrations/kubernetesService.js';
import { logAudit } from '../services/auditService.js';

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
router.post('/deployments/:namespace/:name/scale', asyncHandler(async (req, res) => {
  const replicas = Number(req.body?.replicas);
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > 100) {
    return res.status(400).json({ ok: false, error: 'Nombre de répliques invalide (0 à 100)' });
  }
  const result = await k8s.scaleDeployment(req.params.namespace, req.params.name, replicas);
  logAudit(req, 'kubernetes.deployment.scaled', { namespace: req.params.namespace, name: req.params.name, replicas });
  res.json({ ok: true, ...result });
}));
router.delete('/pods/:namespace/:pod', asyncHandler(async (req, res) => {
  const result = await k8s.deletePod(req.params.namespace, req.params.pod);
  logAudit(req, 'kubernetes.pod.deleted', { namespace: req.params.namespace, pod: req.params.pod });
  res.json({ ok: true, ...result });
}));

export default router;
