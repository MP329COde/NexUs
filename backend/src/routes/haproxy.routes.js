import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as haproxy from '../services/integrations/haproxyService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await haproxy.getStatus() })));
router.get('/backends', asyncHandler(async (req, res) => res.json({ ok: true, items: await haproxy.listBackends() })));
router.get('/backends/:backend/servers', asyncHandler(async (req, res) => res.json({ ok: true, items: await haproxy.listServers(req.params.backend) })));
router.get('/backends/:backend/servers/runtime', asyncHandler(async (req, res) => res.json({ ok: true, items: await haproxy.listRuntimeServerStates(req.params.backend) })));
router.post('/backends/:backend/servers/:server/state', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await haproxy.setServerState(req.params.backend, req.params.server, req.body?.state)) });
}));

export default router;
