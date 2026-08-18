import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';
import { parseServiceManifest, componentToManifest, ManifestError } from '../services/serviceManifest.js';
import { listTemplatesSummary } from '../services/scaffolderTemplates.js';
import { scaffoldService } from '../services/scaffolderService.js';
import * as jobService from '../services/jobService.js';
import { computeScorecard } from '../services/catalogScorecard.js';

const router = Router();
router.use(requireAuth);

// Software Catalog développeur : n'existe que si Postgres est configuré,
// comme le reste du socle organisations/projets/wiki (voir
// routes/organizations.routes.js, routes/wiki.routes.js).
router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

const KINDS = ['service', 'api', 'website', 'worker', 'library', 'cronjob', 'infrastructure'];
const LIFECYCLES = ['experimental', 'production', 'deprecated'];

function slugify(name) {
  return name.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'component';
}

router.get('/components', asyncHandler(async (req, res) => {
  const { q, kind, lifecycle, ownerTeamId, projectId, mine } = req.query;
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type invalide' });
  if (lifecycle && !LIFECYCLES.includes(lifecycle)) return res.status(400).json({ ok: false, error: 'Cycle de vie invalide' });
  const items = await orgStore.listComponentsForUser(req.user.id, { q, kind, lifecycle, ownerTeamId, projectId, mine: mine === 'true' });
  res.json({ ok: true, items: items.map((c) => ({ ...c, scorecard: computeScorecard(c) })) });
}));

router.get('/components/:id', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  res.json({ ok: true, component: { ...component, my_role: role, scorecard: computeScorecard(component) } });
}));

// Écriture réservée maintainer+ du projet (ou owner/admin d'organisation via
// getProjectRole, qui remonte déjà ce rôle implicite — voir orgStore.js) :
// un simple lecteur/développeur ne doit pas pouvoir déclarer un composant
// pour un projet auquel il n'a qu'un accès restreint.
router.post('/components', asyncHandler(async (req, res) => {
  const { projectId: rawProjectId, legacyProjectId, ownerTeamId, name, kind, lifecycle, description, language, framework, repositoryProvider, repositoryUrl, tags, links } = req.body || {};
  // Le frontend travaille au quotidien avec l'id legacy du projet (celui de
  // /api/projects) : accepter legacyProjectId ici évite d'obliger chaque
  // appelant à d'abord résoudre le relationalProjectId via GET /projects/:id,
  // comme le fait déjà routes/wiki.routes.js implicitement côté page projet.
  let projectId = rawProjectId;
  if (!projectId && legacyProjectId) {
    const pgProject = await orgStore.getProjectByLegacyId(legacyProjectId);
    if (!pgProject) return res.status(404).json({ ok: false, error: 'Projet introuvable ou pas encore relié au socle organisations' });
    projectId = pgProject.id;
  }
  if (!projectId || !name) return res.status(400).json({ ok: false, error: 'projectId (ou legacyProjectId) et name requis' });
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type invalide' });
  if (lifecycle && !LIFECYCLES.includes(lifecycle)) return res.status(400).json({ ok: false, error: 'Cycle de vie invalide' });
  const role = await orgStore.getProjectRole(projectId, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const component = await orgStore.createComponent({
    projectId, ownerTeamId, name, slug: slugify(name), kind, lifecycle, description, language, framework, repositoryProvider, repositoryUrl, tags, links
  });
  logAudit(req, 'catalog.component.create', { componentId: component.id, projectId, name });
  res.status(201).json({ ok: true, component });
}));

router.put('/components/:id', asyncHandler(async (req, res) => {
  const existing = await orgStore.getComponent(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(existing.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const { ownerTeamId, name, kind, lifecycle, description, language, framework, repositoryProvider, repositoryUrl, tags, links } = req.body || {};
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type invalide' });
  if (lifecycle && !LIFECYCLES.includes(lifecycle)) return res.status(400).json({ ok: false, error: 'Cycle de vie invalide' });
  const component = await orgStore.updateComponent(req.params.id, { ownerTeamId, name, kind, lifecycle, description, language, framework, repositoryProvider, repositoryUrl, tags, links });
  logAudit(req, 'catalog.component.update', { componentId: component.id, name: component.name });
  res.json({ ok: true, component });
}));

// Dependency Graph (ÉTAPE 14 IDP) : dépendances directes déclarées entre
// composants — voir db/migrations/0015_component_dependencies.sql et
// orgStore.js. Lecture ouverte à quiconque voit déjà le composant (même
// portée que GET /components/:id) ; écriture réservée maintainer+ sur le
// PROJET DU COMPOSANT SOURCE (déclarer "billing-api dépend de postgres" est
// une modification de billing-api, pas de postgres — la cible n'a pas
// besoin d'un rôle particulier, elle est juste référencée).
router.get('/components/:id/dependencies', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const [dependsOn, dependents] = await Promise.all([
    orgStore.listDependencies(req.params.id),
    orgStore.listDependents(req.params.id)
  ]);
  res.json({ ok: true, dependsOn, dependents });
}));

router.post('/components/:id/dependencies', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const { dependsOnComponentId, kind } = req.body || {};
  if (!dependsOnComponentId) return res.status(400).json({ ok: false, error: 'dependsOnComponentId requis' });
  if (dependsOnComponentId === req.params.id) return res.status(400).json({ ok: false, error: 'Un composant ne peut pas dépendre de lui-même' });
  if (kind && !['runtime', 'build', 'data'].includes(kind)) return res.status(400).json({ ok: false, error: 'Type de dépendance invalide' });
  const target = await orgStore.getComponent(dependsOnComponentId);
  if (!target) return res.status(404).json({ ok: false, error: 'Composant cible introuvable' });
  let dependency;
  try {
    dependency = await orgStore.createDependency({ componentId: req.params.id, dependsOnComponentId, kind });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Cette dépendance existe déjà' });
    throw err;
  }
  logAudit(req, 'catalog.dependency.create', { componentId: req.params.id, dependsOnComponentId, kind: dependency.kind });
  res.status(201).json({ ok: true, dependency });
}));

router.delete('/components/:id/dependencies/:depId', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const dependency = await orgStore.getDependency(req.params.depId);
  if (!dependency || dependency.component_id !== req.params.id) return res.status(404).json({ ok: false, error: 'Dépendance introuvable' });
  await orgStore.deleteDependency(req.params.depId);
  logAudit(req, 'catalog.dependency.delete', { componentId: req.params.id, dependencyId: req.params.depId });
  res.json({ ok: true });
}));

// Export au format service.yaml — voir services/serviceManifest.js. Même
// portée de lecture que GET /components/:id.
router.get('/components/:id/manifest', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  res.type('text/yaml').send(componentToManifest(component));
}));

// Import/synchronisation depuis un service.yaml collé dans l'interface (ou,
// à terme, poussé automatiquement depuis un dépôt) : crée le composant s'il
// n'existe pas encore dans ce projet (slug = metadata.name), le met à jour
// sinon — un import répété est donc idempotent, contrairement à POST
// /components qui échouerait sur la contrainte UNIQUE (project_id, slug).
router.post('/components/import', asyncHandler(async (req, res) => {
  const { projectId: rawProjectId, legacyProjectId, yaml } = req.body || {};
  let projectId = rawProjectId;
  if (!projectId && legacyProjectId) {
    const pgProject = await orgStore.getProjectByLegacyId(legacyProjectId);
    if (!pgProject) return res.status(404).json({ ok: false, error: 'Projet introuvable ou pas encore relié au socle organisations' });
    projectId = pgProject.id;
  }
  if (!projectId) return res.status(400).json({ ok: false, error: 'projectId (ou legacyProjectId) requis' });

  let manifest;
  try {
    manifest = parseServiceManifest(yaml);
  } catch (err) {
    if (err instanceof ManifestError) return res.status(400).json({ ok: false, error: err.message });
    throw err;
  }

  const role = await orgStore.getProjectRole(projectId, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }

  let ownerTeamId = null;
  if (manifest.ownerTeamSlug) {
    const project = await orgStore.getProject(projectId);
    const team = await orgStore.getTeamBySlug(project.org_id, manifest.ownerTeamSlug);
    if (!team) return res.status(400).json({ ok: false, error: `Équipe introuvable pour spec.owner: "${manifest.ownerTeamSlug}" (créez-la d'abord depuis la fiche organisation)` });
    ownerTeamId = team.id;
  }

  const fields = {
    ownerTeamId, name: manifest.name, kind: manifest.kind, lifecycle: manifest.lifecycle,
    description: manifest.description, language: manifest.language, framework: manifest.framework,
    repositoryProvider: manifest.repositoryProvider, repositoryUrl: manifest.repositoryUrl, tags: manifest.tags, links: manifest.links
  };

  const existing = await orgStore.getComponentBySlug(projectId, manifest.name);
  let component;
  if (existing) {
    component = await orgStore.updateComponent(existing.id, fields);
    logAudit(req, 'catalog.component.import.update', { componentId: component.id, projectId, name: manifest.name });
  } else {
    component = await orgStore.createComponent({ projectId, slug: manifest.name, ...fields });
    logAudit(req, 'catalog.component.import.create', { componentId: component.id, projectId, name: manifest.name });
  }
  res.status(existing ? 200 : 201).json({ ok: true, component, created: !existing });
}));

// Golden paths (ÉTAPE 8/9 IDP) : liste statique, pas de permission
// particulière au-delà d'être authentifié (comme parcourir un catalogue de
// templates n'importe où ailleurs).
router.get('/templates', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: listTemplatesSummary() });
}));

// Scaffolder : génère les fichiers du template, crée le dépôt distant si un
// provider réel est demandé, enregistre le composant — le tout dans un job
// suivi (voir services/scaffolderService.js) plutôt que dans la requête
// HTTP elle-même, la création de dépôt + plusieurs commits pouvant prendre
// plusieurs secondes. Progression consultable via
// GET /projects/:id/jobs/:jobId (routes/projects.routes.js), déjà exposé —
// le job est rattaché au projet relationnel cible comme n'importe quel
// autre job de projet.
router.post('/scaffold', asyncHandler(async (req, res) => {
  const { templateId, legacyProjectId, projectId: rawProjectId, name, description, ownerTeamId, repositoryProvider } = req.body || {};
  let projectId = rawProjectId;
  if (!projectId && legacyProjectId) {
    const pgProject = await orgStore.getProjectByLegacyId(legacyProjectId);
    if (!pgProject) return res.status(404).json({ ok: false, error: 'Projet introuvable ou pas encore relié au socle organisations' });
    projectId = pgProject.id;
  }
  if (!projectId || !templateId || !name) return res.status(400).json({ ok: false, error: 'projectId (ou legacyProjectId), templateId et name requis' });
  const role = await orgStore.getProjectRole(projectId, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }

  const job = await jobService.enqueue(
    { type: 'catalog.scaffold', projectId, userId: req.user.id, payload: { templateId, name, repositoryProvider: repositoryProvider || 'none' } },
    async (createdJob) => {
      const log = (step, status, detail) => jobService.appendJobStep(createdJob.id, step, status, detail);
      const result = await scaffoldService({ templateId, name, description, projectId, ownerTeamId, repositoryProvider, log });
      logAudit(req, 'catalog.scaffold', { componentId: result.component.id, projectId, templateId, name });
      return result;
    }
  );
  res.status(202).json({ ok: true, job });
}));

router.delete('/components/:id', asyncHandler(async (req, res) => {
  const existing = await orgStore.getComponent(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(existing.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  await orgStore.deleteComponent(req.params.id);
  logAudit(req, 'catalog.component.delete', { componentId: req.params.id, name: existing.name });
  res.json({ ok: true });
}));

export default router;
