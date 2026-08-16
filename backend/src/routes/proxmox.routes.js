import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as proxmox from '../services/integrations/proxmoxService.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await proxmox.getStatus() })));
router.get('/nodes', asyncHandler(async (req, res) => res.json({ ok: true, items: await proxmox.listNodes() })));
router.get('/nodes/:node/vms', asyncHandler(async (req, res) => res.json({ ok: true, items: await proxmox.listVMs(req.params.node) })));

// start/stop/shutdown/reboot une VM ou un conteneur (voir la liste blanche
// dans proxmoxService.vmAction) : action perturbatrice sur l'infrastructure
// partagée, réservée aux admins — même politique que Kubernetes/HAProxy/
// reverse proxies.
router.use(requirePermission('proxmox', 'write'));

router.post('/nodes/:node/:type/:vmid/:action', asyncHandler(async (req, res) => {
  const result = await proxmox.vmAction(req.params.node, req.params.vmid, req.params.type, req.params.action);
  logAudit(req, 'proxmox.vm.action', { node: req.params.node, type: req.params.type, vmid: req.params.vmid, action: req.params.action });
  res.json({ ok: true, ...result });
}));

export default router;
