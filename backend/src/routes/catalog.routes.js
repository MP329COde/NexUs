import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';
import { parseServiceManifest, componentToManifest, ManifestError } from '../services/serviceManifest.js';

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
  const { q, kind, lifecycle, ownerTeamId, projectId } = req.query;
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type invalide' });
  if (lifecycle && !LIFECYCLES.includes(lifecycle)) return res.status(400).json({ ok: false, error: 'Cycle de vie invalide' });
  const items = await orgStore.listComponentsForUser(req.user.id, { q, kind, lifecycle, ownerTeamId, projectId });
  res.json({ ok: true, items });
}));

router.get('/components/:id', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  res.json({ ok: true, component: { ...component, my_role: role } });
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
