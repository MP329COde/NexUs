import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as proxmox from '../services/integrations/proxmoxService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await proxmox.getStatus() })));
router.get('/nodes', asyncHandler(async (req, res) => res.json({ ok: true, items: await proxmox.listNodes() })));
router.get('/nodes/:node/vms', asyncHandler(async (req, res) => res.json({ ok: true, items: await proxmox.listVMs(req.params.node) })));
router.post('/nodes/:node/:type/:vmid/:action', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await proxmox.vmAction(req.params.node, req.params.vmid, req.params.type, req.params.action)) });
}));

export default router;
