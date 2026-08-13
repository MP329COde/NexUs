import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as store from '../store/hostsStore.js';
import { listCatalog, previewScript } from '../services/agentCatalog.js';
import { runScript } from '../services/sshExecutor.js';
import { getConsolePublicKey } from '../utils/sshKeypair.js';
import { logAudit } from '../services/auditService.js';
import { getCriticalHostsSnapshot } from '../services/hostMetricsService.js';

// Gestion des hôtes et installation d'agents : réservée aux administrateurs.
// L'exécution est toujours limitée au catalogue fermé (agentCatalog.js).
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/ssh-public-key', (req, res) => {
  res.json({ ok: true, publicKey: getConsolePublicKey() });
});

router.get('/agents/catalog', (req, res) => {
  res.json({ ok: true, items: listCatalog() });
});

router.get('/', (req, res) => {
  res.json({ ok: true, items: store.listHosts() });
});

// Snapshot des hôtes marqués critiques (rôle, joignabilité TCP, CPU/RAM/uptime
// si lisibles via SSH) : alimente la carte "Hôtes critiques" de la page
// d'accueil. Voir services/hostMetricsService.js pour le rafraîchissement.
router.get('/critical', (req, res) => {
  res.json({ ok: true, ...getCriticalHostsSnapshot() });
});

router.post('/', asyncHandler(async (req, res) => {
  const { name, address, port, sshUser, role, critical } = req.body || {};
  if (!name || !address) return res.status(400).json({ ok: false, error: 'Nom et adresse requis' });
  const host = store.createHost({ name, address, port, sshUser, role, critical });
  logAudit(req, 'host.create', { hostId: host.id, address: host.address });
  res.status(201).json({ ok: true, host });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const updated = store.updateHost(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  logAudit(req, 'host.update', { hostId: updated.id });
  res.json({ ok: true, host: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!store.deleteHost(req.params.id)) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  logAudit(req, 'host.delete', { hostId: req.params.id });
  res.json({ ok: true });
}));

router.get('/agents/:agentId/preview', asyncHandler(async (req, res) => {
  res.json({ ok: true, script: previewScript(req.params.agentId) });
}));

router.post('/:id/agents/:agentId/install', asyncHandler(async (req, res) => {
  const host = store.getHost(req.params.id);
  if (!host) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  const script = previewScript(req.params.agentId);
  const result = await runScript(host, script);
  store.recordInstallResult(host.id, { agentId: req.params.agentId, ok: result.ok, message: result.ok ? 'Installation réussie' : `Échec (code ${result.exitCode})` });
  logAudit(req, 'host.agent.install', { hostId: host.id, agentId: req.params.agentId, ok: result.ok, exitCode: result.exitCode });
  res.json({ ok: true, result });
}));

export default router;
