import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { pool } from '../db/pool.js';
import * as store from '../store/hostsStore.js';
import { listCatalog, previewScript } from '../services/agentCatalog.js';
import { listInstallableIds, getServiceMeta, buildServiceScript, buildCheckUpdateScript, buildUpdateScript, buildK8sManifests } from '../services/serviceCatalog.js';
import { runScript } from '../services/sshExecutor.js';
import { getConsolePublicKey } from '../utils/sshKeypair.js';
import { logAudit } from '../services/auditService.js';
import { getCriticalHostsSnapshot } from '../services/hostMetricsService.js';
import * as hostServices from '../store/hostServicesStore.js';
import { getServiceUpdatePolicy, setServiceUpdatePolicy, isServiceUpdateAllowed, listK8sClustersRedacted, getRawIntegration } from '../store/settingsStore.js';
import { startInstall } from '../services/provisioningService.js';
import { applyManifest } from '../services/integrations/kubernetesService.js';

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

// Lot D4 (Groupe D) — cibles d'installation honnêtes : l'app n'impose plus
// de créer/choisir une machine SSH pour installer un outil du catalogue.
// Cette route liste, sans rien inventer, ce qui est réellement disponible
// dans CET environnement : hôtes déjà gérés, clusters Kubernetes configurés
// (Lot C4, multi-cluster), et Proxmox (configuré mais la création
// automatique de VM/LXC n'est pas encore implémentée — voir todo.md — donc
// `available: false` avec une raison plutôt qu'une option qui échouerait).
router.get('/services/install-targets', asyncHandler(async (req, res) => {
  const hosts = await store.listHosts();
  const clusters = listK8sClustersRedacted().filter((c) => c.configured);
  const proxmoxCfg = getRawIntegration('proxmox');
  const proxmoxConfigured = Boolean(proxmoxCfg.baseUrl);
  res.json({
    ok: true,
    sshHost: { available: hosts.length > 0, hosts: hosts.map((h) => ({ id: h.id, name: h.name, address: h.address })) },
    kubernetes: { available: clusters.length > 0, clusters: clusters.map((c) => ({ id: c.id, name: c.name })) },
    proxmox: {
      available: false,
      configured: proxmoxConfigured,
      reason: proxmoxConfigured
        ? "Proxmox est configuré, mais la création automatique de VM/LXC n'est pas encore implémentée dans la console — créez la machine manuellement dans Proxmox puis ajoutez-la comme hôte."
        : 'Proxmox non configuré (Paramètres → Intégrations).'
    }
  });
}));

// Installation dirigée par cible explicite ({type:'ssh-host'|'kubernetes'}),
// sans jamais forcer la création d'une machine : voir GET
// /services/install-targets pour ce qui est proposé. `ssh-host` réutilise
// soit un hôte déjà géré (target.hostId), soit crée l'hôte à la volée à
// partir d'une adresse (target.address, même logique que
// provisioningService.startInstall utilisé par l'assistant de setup).
// `kubernetes` déploie un Deployment+Service minimal généré depuis le même
// catalogue (buildK8sManifests) sur le cluster choisi (target.clusterId).
router.post('/services/:serviceId/install', asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  const { target } = req.body || {};
  if (!target?.type) return res.status(400).json({ ok: false, error: 'Cible d\'installation requise (target.type)' });
  const meta = getServiceMeta(serviceId);

  if (target.type === 'ssh-host') {
    if (target.hostId) {
      const host = await store.getHost(target.hostId);
      if (!host) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
      const script = buildServiceScript(serviceId, { address: host.address });
      const result = await runScript(host, script);
      await store.recordInstallResult(host.id, { agentId: serviceId, ok: result.ok, message: result.ok ? 'Installation réussie' : `Échec (code ${result.exitCode})` });
      if (result.ok) await hostServices.recordInstalled(host.id, serviceId);
      logAudit(req, 'host.service.install', { hostId: host.id, serviceId, ok: result.ok, exitCode: result.exitCode, via: 'ssh-host' });
      return res.json({ ok: true, result, port: meta?.port, address: host.address });
    }
    if (target.address) {
      const job = await startInstall({ toolId: serviceId, address: target.address, port: target.port, sshUser: target.sshUser });
      logAudit(req, 'host.service.install', { serviceId, via: 'ssh-host-new', hostId: job.hostId, jobId: job.id });
      return res.status(202).json({ ok: true, job, port: meta?.port, address: target.address });
    }
    return res.status(400).json({ ok: false, error: 'target.hostId ou target.address requis pour ssh-host' });
  }

  if (target.type === 'kubernetes') {
    if (!target.clusterId) return res.status(400).json({ ok: false, error: 'target.clusterId requis pour kubernetes' });
    const clusters = listK8sClustersRedacted().filter((c) => c.configured);
    if (!clusters.some((c) => c.id === target.clusterId)) {
      return res.status(409).json({ ok: false, error: 'Cluster Kubernetes non configuré' });
    }
    const namespace = target.namespace || 'default';
    const { deployment, service } = buildK8sManifests(serviceId, { namespace });
    const deploymentResult = await applyManifest(deployment, target.clusterId);
    const serviceResult = service ? await applyManifest(service, target.clusterId) : null;
    logAudit(req, 'host.service.install', { serviceId, via: 'kubernetes', clusterId: target.clusterId, namespace });
    return res.status(202).json({ ok: true, result: { ok: true, deployment: deploymentResult, service: serviceResult }, namespace });
  }

  if (target.type === 'proxmox') {
    return res.status(501).json({ ok: false, error: "Création automatique de VM/LXC Proxmox non encore implémentée — créez la machine dans Proxmox puis ajoutez-la comme hôte géré." });
  }

  return res.status(400).json({ ok: false, error: `Type de cible inconnu: ${target.type}` });
}));

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
  if (result.ok) await hostServices.recordInstalled(host.id, req.params.serviceId);
  logAudit(req, 'host.service.install', { hostId: host.id, serviceId: req.params.serviceId, ok: result.ok, exitCode: result.exitCode });
  res.json({ ok: true, result, port: meta?.port, address: host.address });
}));

// Lot D3 (Groupe D) — mise à jour de services autorisée -------------------
// Services du catalogue installés sur un hôte donné, avec le dernier état de
// vérification connu (jamais de statut inventé : lastCheckStatus reste null
// tant qu'aucun check n'a été exécuté).
router.get('/:id/services', asyncHandler(async (req, res) => {
  const host = await store.getHost(req.params.id);
  if (!host) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  const items = await hostServices.listByHost(host.id);
  res.json({ ok: true, items: items.map((s) => ({ ...s, label: getServiceMeta(s.serviceId)?.label || s.serviceId })) });
}));

// Réglage d'autorisation des mises à jour de services — désactivé par
// défaut (voir settingsStore.getServiceUpdatePolicy). Réservé aux admins
// hosts comme le reste de ce routeur.
router.get('/services/update-policy', (req, res) => {
  res.json({ ok: true, policy: getServiceUpdatePolicy() });
});

router.put('/services/update-policy', (req, res) => {
  const policy = setServiceUpdatePolicy(req.body || {});
  logAudit(req, 'host.service.update-policy.set', { policy });
  res.json({ ok: true, policy });
});

// Vérification de nouvelle version — jamais bloquée par le réglage
// d'autorisation (consulter n'est pas modifier), mais toujours honnête :
// un échec de vérification (hôte/registre injoignable) remonte comme statut
// "error", jamais comme "up_to_date"/"update_available" inventés.
router.post('/:id/services/:serviceId/check-update', asyncHandler(async (req, res) => {
  const host = await store.getHost(req.params.id);
  if (!host) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  const script = buildCheckUpdateScript(req.params.serviceId, { address: host.address });
  let status; let detail;
  try {
    const result = await runScript(host, script);
    const out = (result.stdout || '').trim();
    if (result.ok && ['UP_TO_DATE', 'UPDATE_AVAILABLE', 'NOT_INSTALLED'].includes(out)) {
      status = out.toLowerCase();
      detail = null;
    } else {
      status = 'error';
      detail = result.stderr?.trim() || `Sortie inattendue (code ${result.exitCode})`;
    }
  } catch (err) {
    status = 'error';
    detail = err.message;
  }
  const record = await hostServices.recordCheck(host.id, req.params.serviceId, status, detail);
  logAudit(req, 'host.service.check-update', { hostId: host.id, serviceId: req.params.serviceId, status });
  res.json({ ok: true, status, detail, record });
}));

router.post('/:id/services/:serviceId/update', asyncHandler(async (req, res) => {
  const host = await store.getHost(req.params.id);
  if (!host) return res.status(404).json({ ok: false, error: 'Hôte introuvable' });
  if (!isServiceUpdateAllowed(req.params.serviceId)) {
    return res.status(403).json({ ok: false, error: "Mise à jour non autorisée : activez le réglage dans Paramètres avant de mettre à jour ce service." });
  }
  const script = buildUpdateScript(req.params.serviceId, { address: host.address });
  const result = await runScript(host, script, { timeoutMs: 300_000 });
  await hostServices.recordUpdate(host.id, req.params.serviceId, result.ok);
  logAudit(req, 'host.service.update', { hostId: host.id, serviceId: req.params.serviceId, ok: result.ok, exitCode: result.exitCode });
  res.json({ ok: true, result });
}));

export default router;
