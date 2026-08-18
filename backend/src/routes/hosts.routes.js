import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/pool.js';
import * as store from '../store/hostsStore.js';
import { listCatalog, previewScript } from '../services/agentCatalog.js';
import { listInstallableIds, getServiceMeta, buildServiceScript } from '../services/serviceCatalog.js';
import { runScript } from '../services/sshExecutor.js';
import { getConsolePublicKey } from '../utils/sshKeypair.js';
import { logAudit } from '../services/auditService.js';
import { getCriticalHostsSnapshot } from '../services/hostMetricsService.js';

// Gestion des hôtes et installation d'agents : réservée aux administrateurs.
// L'exécution est toujours limitée au catalogue fermé (agentCatalog.js).
// hostsStore.js est passé sur Postgres (ÉTAPE 27 IDP) : nécessite
// DATABASE_URL, comme le reste du socle organisations — cohérent avec
// docker-compose.yml, où Postgres est un service toujours présent.
const router = Router();
router.use(requireAuth, requirePermission('hosts', 'admin'));

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle relationnel indisponible (DATABASE_URL non configuré)' });
  next();
});

router.get('/ssh-public-key', (req, res) => {
  res.json({ ok: true, publicKey: getConsolePublicKey() });
});

router.get('/agents/catalog', (req, res) => {
  res.json({ ok: true, items: listCatalog() });
});

router.get('/', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await store.listHosts() });
}));

// Snapshot des hôtes marqués critiques (rôle, joignabilité TCP, CPU/RAM/uptime
// si lisibles via SSH) : alimente la carte "Hôtes critiques" de la page
// d'accueil. Voir services/hostMetricsService.js pour le rafraîchissement.
router.get('/critical', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await getCriticalHostsSnapshot()) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, address, port, sshUser, role, critical } = req.body || {};
  if (!name || !address) return res.status(400).json({ ok: false, error: 'Nom et adresse requis' });
  const host = await store.createHost({ name, address, port, sshUser, role, critical });
  logAudit(req, 'host.create', { hostId: host.id, address: host.address });
  res.status(201).json({ ok: true, host });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const updated = await store.updateHost(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  logAudit(req, 'host.update', { hostId: updated.id });
  res.json({ ok: true, host: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!(await store.deleteHost(req.params.id))) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  logAudit(req, 'host.delete', { hostId: req.params.id });
  res.json({ ok: true });
}));

router.get('/agents/:agentId/preview', asyncHandler(async (req, res) => {
  res.json({ ok: true, script: previewScript(req.params.agentId) });
}));

router.post('/:id/agents/:agentId/install', asyncHandler(async (req, res) => {
  const host = await store.getHost(req.params.id);
  if (!host) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  const script = previewScript(req.params.agentId);
  const result = await runScript(host, script);
  await store.recordInstallResult(host.id, { agentId: req.params.agentId, ok: result.ok, message: result.ok ? 'Installation réussie' : `Échec (code ${result.exitCode})` });
  logAudit(req, 'host.agent.install', { hostId: host.id, agentId: req.params.agentId, ok: result.ok, exitCode: result.exitCode });
  res.json({ ok: true, result });
}));

// Catalogue de services complets (serviceCatalog.js — même catalogue que
// l'assistant de première installation) installables a posteriori sur un
// hôte déjà géré : utilisé notamment par Monitoring → « Installer Grafana »
// quand aucune instance n'est encore configurée, sans repasser par le setup.
router.get('/services/catalog', (req, res) => {
  res.json({ ok: true, items: listInstallableIds().map((id) => ({ id, ...getServiceMeta(id) })) });
});

router.get('/services/:serviceId/preview', asyncHandler(async (req, res) => {
  const host = req.query.address ? { address: req.query.address } : {};
  res.json({ ok: true, script: buildServiceScript(req.params.serviceId, { address: host.address }) });
}));

router.post('/:id/services/:serviceId/install', asyncHandler(async (req, res) => {
  const host = await store.getHost(req.params.id);
  if (!host) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  const meta = getServiceMeta(req.params.serviceId);
  const script = buildServiceScript(req.params.serviceId, { address: host.address });
  const result = await runScript(host, script);
  await store.recordInstallResult(host.id, { agentId: req.params.serviceId, ok: result.ok, message: result.ok ? 'Installation réussie' : `Échec (code ${result.exitCode})` });
  logAudit(req, 'host.service.install', { hostId: host.id, serviceId: req.params.serviceId, ok: result.ok, exitCode: result.exitCode });
  res.json({ ok: true, result, port: meta?.port, address: host.address });
}));

export default router;
