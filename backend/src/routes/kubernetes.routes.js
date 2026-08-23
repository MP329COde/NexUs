import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import * as k8s from '../services/integrations/kubernetesService.js';
import { logAudit } from '../services/auditService.js';
import * as deploymentStore from '../store/deploymentStore.js';
import { getRawIntegration } from '../store/settingsStore.js';
import * as github from '../services/integrations/githubService.js';
import * as gitlab from '../services/integrations/gitlabService.js';

const router = Router();
router.use(requireAuth);

// Kubernetes est un cluster partagé par toute la plateforme, pas une
// ressource par projet (contrairement aux dépôts/pipelines/déploiements
// Argo CD déjà scopés — voir routes/projects.routes.js). Les lectures
// (pods, logs, métriques, événements...) restent ouvertes à tout utilisateur
// authentifié : observer l'état du cluster aide au diagnostic sans risque.
// Toute action qui modifie un workload en cluster (redémarrage, scaling,
// rollback, purge, suppression de pod) exige en revanche le rôle admin —
// même politique que Proxmox, HAProxy et les reverse proxies (voir les
// fichiers de routes correspondants).

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await k8s.getStatus() })));
router.get('/namespaces', asyncHandler(async (req, res) => res.json({ ok: true, items: await k8s.listNamespaces() })));
router.get('/pods', asyncHandler(async (req, res) => res.json({ ok: true, items: await k8s.listPods(req.query.namespace) })));
router.get('/deployments', asyncHandler(async (req, res) => res.json({ ok: true, items: await k8s.listDeployments(req.query.namespace) })));
router.get('/services', asyncHandler(async (req, res) => res.json({ ok: true, items: await k8s.listServices(req.query.namespace) })));
router.get('/pods/:namespace/:pod/logs', asyncHandler(async (req, res) => {
  const logs = await k8s.getPodLogs(req.params.namespace, req.params.pod, req.query.container, Number(req.query.tail) || 200);
  res.json({ ok: true, logs });
}));
router.get('/pods/:namespace/:pod/describe', asyncHandler(async (req, res) => {
  res.json({ ok: true, pod: await k8s.describePod(req.params.namespace, req.params.pod) });
}));
router.get('/pods/:namespace/:pod/metrics', asyncHandler(async (req, res) => {
  res.json({ ok: true, metrics: await k8s.getPodMetrics(req.params.namespace, req.params.pod) });
}));
router.get('/pods/:namespace/:pod/owners', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await k8s.getPodOwners(req.params.namespace, req.params.pod)) });
}));
router.get('/deployments/:namespace/:name/diagnostics', asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await k8s.getDeploymentDiagnostics(req.params.namespace, req.params.name)) });
}));
router.get('/events', asyncHandler(async (req, res) => {
  if (!req.query.namespace) return res.status(400).json({ ok: false, error: 'namespace requis' });
  res.json({ ok: true, items: await k8s.listEvents(req.query.namespace, req.query.involvedObject) });
}));

// Remonte depuis une ressource Kubernetes vers le lien de déploiement
// (projet ↔ dépôt ↔ Argo CD ↔ Kubernetes) qui la déploie, s'il en existe un
// — évite de naviguer manuellement entre Kubernetes, Argo CD et le dépôt.
router.get('/deployments/:namespace/:name/links', asyncHandler(async (req, res) => {
  const link = deploymentStore.listLinks().find(
    (l) => l.k8sNamespace === req.params.namespace && l.k8sDeployment === req.params.name
  );
  if (!link) return res.json({ ok: true, link: null });
  const argocdCfg = getRawIntegration('argocd');
  // gitWebUrl résolu ici (pas reconstruit côté frontend, cf. bug corrigé dans
  // DiagnosticsModal.jsx qui supposait `https://github.com/{owner}/{repo}`
  // en dur et ne gérait jamais GitLab) : on redemande l'URL réelle du dépôt
  // à l'intégration configurée, GitHub Enterprise/GitLab self-hosted inclus.
  const gitWebUrl = await (link.gitProvider === 'github'
    ? (link.githubOwner && link.githubRepo ? github.getRepo(link.githubOwner, link.githubRepo).then((r) => r.webUrl).catch(() => null) : null)
    : (link.gitlabProjectId ? gitlab.getProject(link.gitlabProjectId).then((p) => p.webUrl).catch(() => null) : null));
  res.json({
    ok: true,
    link: {
      id: link.id,
      name: link.name,
      argocdAppName: link.argocdAppName,
      argocdWebUrl: link.argocdAppName && argocdCfg.baseUrl ? `${argocdCfg.baseUrl.replace(/\/$/, '')}/applications/${link.argocdAppName}` : null,
      gitProvider: link.gitProvider,
      gitlabProjectId: link.gitlabProjectId || null,
      githubOwner: link.githubOwner || null,
      githubRepo: link.githubRepo || null,
      gitWebUrl
    }
  });
}));

router.use(requirePermission('kubernetes', 'write'));

router.post('/deployments/:namespace/:name/restart', asyncHandler(async (req, res) => {
  const result = await k8s.restartDeployment(req.params.namespace, req.params.name);
  logAudit(req, 'kubernetes.deployment.restarted', { namespace: req.params.namespace, name: req.params.name });
  res.json({ ok: true, ...result });
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
router.post('/deployments/:namespace/:name/rollback', asyncHandler(async (req, res) => {
  const result = await k8s.rollbackDeployment(req.params.namespace, req.params.name);
  logAudit(req, 'kubernetes.deployment.rolledback', { namespace: req.params.namespace, name: req.params.name, revision: result.revision });
  res.json({ ok: true, ...result });
}));
router.post('/deployments/:namespace/:name/purge', asyncHandler(async (req, res) => {
  const result = await k8s.purgeDeploymentPods(req.params.namespace, req.params.name);
  logAudit(req, 'kubernetes.deployment.purged', { namespace: req.params.namespace, name: req.params.name, count: result.count });
  res.json({ ok: true, ...result });
}));
router.delete('/pods/:namespace/:pod', asyncHandler(async (req, res) => {
  const result = await k8s.deletePod(req.params.namespace, req.params.pod);
  logAudit(req, 'kubernetes.pod.deleted', { namespace: req.params.namespace, pod: req.params.pod });
  res.json({ ok: true, ...result });
}));

export default router;
