import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as deploymentService from '../services/deploymentService.js';
import { syncApplication, getApplicationHistory, rollbackApplication, getManagedResourcesDiff } from '../services/integrations/argocdService.js';
import { logAudit } from '../services/auditService.js';
import * as projectsStore from '../store/projectsStore.js';
import * as orgStore from '../store/orgStore.js';
import { resolveProjectRole } from '../middleware/projectAccess.js';

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

// Faille corrigée : ces endpoints globaux (contrairement à
// /api/projects/:id/deployments/:linkId/sync — routes/projects.routes.js,
// qui exige maintainer+ et owner en production) ne vérifiaient jusqu'ici
// que requireAuth — n'importe quel compte "user" authentifié, membre ou non
// du projet concerné, pouvait synchroniser/rollback N'IMPORTE QUELLE
// application ArgoCD de la plateforme, ou modifier/supprimer N'IMPORTE QUEL
// lien de déploiement (y compris rediriger silencieusement un lien vers un
// autre nom d'application ArgoCD). projectId absent (déploiement non
// rattaché à un projet) reste réservé aux administrateurs, faute de
// contexte auquel rattacher un rôle.
async function requireMinRoleForProject(req, res, projectId, environmentId, minRole) {
  if (!projectId) {
    if (req.user.role !== 'admin') {
      res.status(403).json({ ok: false, error: 'Réservé aux administrateurs (déploiement non rattaché à un projet)' });
      return false;
    }
    return true;
  }
  const project = projectsStore.getProject(projectId);
  if (!project) {
    res.status(404).json({ ok: false, error: 'Projet introuvable pour ce déploiement' });
    return false;
  }
  const role = await resolveProjectRole(project, req.user);
  if (!orgStore.projectRoleAtLeast(role, minRole)) {
    res.status(403).json({ ok: false, error: `Rôle "${minRole}" minimum requis sur ce projet` });
    return false;
  }
  if (environmentId) {
    const pgProject = await orgStore.getProjectByLegacyId(projectId);
    const environments = pgProject ? await orgStore.listEnvironments(pgProject.id) : [];
    const env = environments.find((e) => e.id === environmentId);
    if (env?.is_production && role !== 'owner') {
      res.status(403).json({ ok: false, error: "Cette action sur un environnement de production requiert le rôle propriétaire du projet" });
      return false;
    }
  }
  return true;
}

function requireMinRoleForLink(req, res, link, minRole) {
  return requireMinRoleForProject(req, res, link.projectId, link.environmentId, minRole);
}

function requireLink(req, res) {
  const link = deploymentService.list().find((l) => l.id === req.params.id);
  if (!link) {
    res.status(404).json({ ok: false, error: 'Déploiement introuvable' });
    return null;
  }
  return link;
}

router.get('/', asyncHandler(async (req, res) => res.json({ ok: true, items: deploymentService.list() })));

// Créer/modifier/supprimer le lien lui-même est au moins aussi sensible que
// le synchroniser : modifier silencieusement le nom d'application ArgoCD
// visé par un lien existant reviendrait à détourner la cible d'un futur
// sync sans que personne s'en aperçoive. Même seuil (maintainer+, owner en
// production) que les actions sync/rollback ci-dessous.
router.post('/', asyncHandler(async (req, res) => {
  const { projectId, environmentId } = req.body || {};
  if (!(await requireMinRoleForProject(req, res, projectId || null, environmentId || null, 'maintainer'))) return;
  res.status(201).json({ ok: true, link: deploymentService.create(req.body || {}) });
}));
router.put('/:id', asyncHandler(async (req, res) => {
  const link = requireLink(req, res);
  if (!link) return;
  if (!(await requireMinRoleForLink(req, res, link, 'maintainer'))) return;
  res.json({ ok: true, link: deploymentService.update(req.params.id, req.body || {}) });
}));
router.delete('/:id', asyncHandler(async (req, res) => {
  const link = requireLink(req, res);
  if (!link) return;
  if (!(await requireMinRoleForLink(req, res, link, 'maintainer'))) return;
  res.json(deploymentService.remove(req.params.id));
}));
router.get('/:id/pipeline', asyncHandler(async (req, res) => res.json({ ok: true, ...(await deploymentService.getPipeline(req.params.id)) })));
router.post('/:id/sync', asyncHandler(async (req, res) => {
  const link = requireArgocdApp(req, res);
  if (!link) return;
  if (!(await requireMinRoleForLink(req, res, link, 'maintainer'))) return;
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
  // owner, pas seulement maintainer : même seuil que la route scopée
  // équivalente (routes/projects.routes.js) — un rollback est plus
  // destructeur qu'une simple synchronisation.
  if (!(await requireMinRoleForLink(req, res, link, 'owner'))) return;
  const { historyId } = req.body || {};
  if (historyId === undefined) return res.status(400).json({ ok: false, error: 'historyId requis' });
  const result = await rollbackApplication(link.argocdAppName, historyId);
  logAudit(req, 'argocd.application.rolledback', { linkId: link.id, appName: link.argocdAppName, historyId });
  res.json({ ok: true, ...result });
}));

export default router;
