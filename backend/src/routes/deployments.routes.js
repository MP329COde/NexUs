import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as deploymentService from '../services/deploymentService.js';
import { syncApplication, getApplicationHistory, rollbackApplication, getManagedResourcesDiff } from '../services/integrations/argocdService.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

function requireArgocdApp(req, res) {
  const link = deploymentService.list().find((l) => l.id === req.params.id);
  if (!link?.argocdAppName) {
    res.status(409).json({ ok: false, error: 'Aucune application Argo CD associée' });
    return null;
  }
  return link;
}

router.get('/', asyncHandler(async (req, res) => res.json({ ok: true, items: deploymentService.list() })));
router.post('/', asyncHandler(async (req, res) => res.status(201).json({ ok: true, link: deploymentService.create(req.body || {}) })));
router.put('/:id', asyncHandler(async (req, res) => res.json({ ok: true, link: deploymentService.update(req.params.id, req.body || {}) })));
router.delete('/:id', asyncHandler(async (req, res) => res.json(deploymentService.remove(req.params.id))));
router.get('/:id/pipeline', asyncHandler(async (req, res) => res.json({ ok: true, ...(await deploymentService.getPipeline(req.params.id)) })));
router.post('/:id/sync', asyncHandler(async (req, res) => {
  const link = requireArgocdApp(req, res);
  if (!link) return;
  const result = await syncApplication(link.argocdAppName, req.body?.revision);
  logAudit(req, 'argocd.application.synced', { linkId: link.id, appName: link.argocdAppName, revision: req.body?.revision || null });
  res.json({ ok: true, ...result });
}));
router.get('/:id/gitops-diff', asyncHandler(async (req, res) => {
  const link = requireArgocdApp(req, res);
  if (!link) return;
  res.json({ ok: true, items: await getManagedResourcesDiff(link.argocdAppName) });
}));
router.get('/:id/history', asyncHandler(async (req, res) => {
  const link = requireArgocdApp(req, res);
  if (!link) return;
  res.json({ ok: true, items: await getApplicationHistory(link.argocdAppName) });
}));
router.post('/:id/rollback', asyncHandler(async (req, res) => {
  const link = requireArgocdApp(req, res);
  if (!link) return;
  const { historyId } = req.body || {};
  if (historyId === undefined) return res.status(400).json({ ok: false, error: 'historyId requis' });
  const result = await rollbackApplication(link.argocdAppName, historyId);
  logAudit(req, 'argocd.application.rolledback', { linkId: link.id, appName: link.argocdAppName, historyId });
  res.json({ ok: true, ...result });
}));

export default router;
