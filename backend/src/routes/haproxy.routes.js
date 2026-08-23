import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as haproxy from '../services/integrations/haproxyService.js';
import { logAudit } from '../services/auditService.js';
import * as configHistory from '../store/networkConfigHistoryStore.js';

const MODULE = 'haproxy';

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

// Crée un frontend HAProxy : affecte directement le routage du reverse proxy,
// réservé aux admins, même politique que la bascule d'état des serveurs.
router.post('/frontends', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await haproxy.createFrontend(req.body || {});
  logAudit(req, 'haproxy.frontend.created', { name: req.body?.name, port: req.body?.port });
  res.json({ ok: true, ...result });
}));

// Éditeur sécurisé (Priorité 4) : lecture/validation/application/historique/
// rollback de la config brute. Toute mutation est réservée admin, snapshotée
// avant application (network_config_history) car la Data Plane API elle-même
// ne garde qu'une seule "version courante" — voir haproxyService.js.
router.get('/config/raw', requireRole('admin'), asyncHandler(async (req, res) => res.json({ ok: true, ...(await haproxy.getRawConfig()) })));

router.post('/config/validate', requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await haproxy.validateRawConfig(req.body?.config || '');
  res.json({ ok: true, ...result });
}));

router.post('/config/apply', requireRole('admin'), asyncHandler(async (req, res) => {
  const { config, note } = req.body || {};
  if (!config) return res.status(400).json({ ok: false, message: 'Configuration requise' });
  const current = await haproxy.getRawConfig();
  const snap = await configHistory.snapshot(MODULE, current.config, req.user?.email || req.user?.id, note || '');
  const result = await haproxy.applyRawConfig(config);
  logAudit(req, 'haproxy.config.applied', { snapshotId: snap.id, note: note || '' });
  res.json({ ok: true, ...result, snapshotId: snap.id });
}));

router.get('/config/history', requireRole('admin'), asyncHandler(async (req, res) => res.json({ ok: true, items: await configHistory.listHistory(MODULE) })));

router.get('/config/history/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const entry = await configHistory.getEntry(MODULE, Number(req.params.id));
  if (!entry) return res.status(404).json({ ok: false, message: 'Instantané introuvable' });
  res.json({ ok: true, item: entry });
}));

router.post('/config/history/:id/rollback', requireRole('admin'), asyncHandler(async (req, res) => {
  const entry = await configHistory.getEntry(MODULE, Number(req.params.id));
  if (!entry) return res.status(404).json({ ok: false, message: 'Instantané introuvable' });
  const current = await haproxy.getRawConfig();
  await configHistory.snapshot(MODULE, current.config, req.user?.email || req.user?.id, `avant rollback #${entry.id}`);
  const result = await haproxy.applyRawConfig(entry.content);
  const rolledBack = await configHistory.snapshotRollback(MODULE, entry.content, req.user?.email || req.user?.id, entry.id, req.body?.note || '');
  logAudit(req, 'haproxy.config.rollback', { fromSnapshotId: entry.id, newSnapshotId: rolledBack.id });
  res.json({ ok: true, ...result, snapshotId: rolledBack.id });
}));

export default router;
