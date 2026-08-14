import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as haproxy from '../services/integrations/haproxyService.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await haproxy.getStatus() })));
router.get('/backends', asyncHandler(async (req, res) => res.json({ ok: true, items: await haproxy.listBackends() })));
router.get('/backends/:backend/servers', asyncHandler(async (req, res) => res.json({ ok: true, items: await haproxy.listServers(req.params.backend) })));
router.get('/backends/:backend/servers/runtime', asyncHandler(async (req, res) => res.json({ ok: true, items: await haproxy.listRuntimeServerStates(req.params.backend) })));

// Bascule un serveur backend up/down/drain au runtime : affecte directement
// le trafic de production routé par ce reverse proxy — réservé aux admins,
// même politique que routes/proxies.routes.js.
router.post('/backends/:backend/servers/:server/state', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await haproxy.setServerState(req.params.backend, req.params.server, req.body?.state);
  logAudit(req, 'haproxy.server.state_changed', { backend: req.params.backend, server: req.params.server, state: req.body?.state });
  res.json({ ok: true, ...result });
}));
router.get('/frontends', asyncHandler(async (req, res) => res.json({ ok: true, items: await haproxy.listFrontends() })));

export default router;
