import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';
import { componentToManifest } from '../services/serviceManifest.js';
import { importServiceManifest, ManifestError } from '../services/serviceManifestImportService.js';
import { listTemplatesSummary } from '../services/scaffolderTemplates.js';
import { scaffoldService } from '../services/scaffolderService.js';
import * as jobService from '../services/jobService.js';
import { computeScorecard } from '../services/catalogScorecard.js';
import { evaluatePolicies } from '../services/policyEngine.js';
import { findVaultEntry } from '../store/vaultStore.js';
import { syncBindingSecret } from '../services/serviceBindingSyncService.js';
import * as yaml from 'js-yaml';
import * as componentImagesStore from '../store/componentImagesStore.js';
import * as privateRegistry from '../services/integrations/privateRegistryService.js';
import * as incidentStore from '../store/incidentStore.js';
import * as tracing from '../services/integrations/tracingService.js';

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
  const { ownerTeamId, name, kind, lifecycle, description, language, framework, repositoryProvider, repositoryUrl, tags, links, k8sNamespace, grafanaDashboardUid, sloTarget } = req.body || {};
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type invalide' });
  if (lifecycle && !LIFECYCLES.includes(lifecycle)) return res.status(400).json({ ok: false, error: 'Cycle de vie invalide' });
  if (sloTarget !== undefined && sloTarget !== null && sloTarget !== '' && (Number.isNaN(Number(sloTarget)) || Number(sloTarget) <= 0 || Number(sloTarget) > 100)) {
    return res.status(400).json({ ok: false, error: 'Objectif de disponibilité invalide (0-100)' });
  }
  const component = await orgStore.updateComponent(req.params.id, { ownerTeamId, name, kind, lifecycle, description, language, framework, repositoryProvider, repositoryUrl, tags, links, k8sNamespace, grafanaDashboardUid, sloTarget });
  logAudit(req, 'catalog.component.update', { componentId: component.id, name: component.name });
  res.json({ ok: true, component });
}));

// Images Docker rattachées au composant (Registry ↔ Projets/Services) :
// ferme la chaîne Projet → Repository → Pipeline → Image Docker → Registry
// → Deployment — registry.routes.js reste un proxy plateforme sans notion
// de projet, mais chaque image enregistrée ici pointe vers un component_id
// précis (donc un projet via components.project_id). GET enrichit avec les
// tags réellement présents dans le registre privé configuré, quand
// l'intégration existe — jamais de tags inventés si non configurée.
router.get('/components/:id/images', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const images = await componentImagesStore.listForComponent(req.params.id);
  const enriched = await Promise.all(images.map(async (img) => {
    const tags = await privateRegistry.listTags(img.repository).catch(() => null);
    return { ...img, registryTags: tags };
  }));
  res.json({ ok: true, items: enriched });
}));

router.post('/components/:id/images', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const { repository, tag, digest, pipelineProvider, pipelineUrl } = req.body || {};
  if (!repository || !repository.trim()) return res.status(400).json({ ok: false, error: 'repository requis' });
  const image = await componentImagesStore.createImage(req.params.id, {
    repository: repository.trim(), tag: tag?.trim() || 'latest', digest, pipelineProvider, pipelineUrl, createdBy: req.user.id
  });
  logAudit(req, 'catalog.component.image.registered', { componentId: component.id, repository: image.repository, tag: image.tag });
  res.status(201).json({ ok: true, item: image });
}));

router.delete('/components/:id/images/:imageId', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const deleted = await componentImagesStore.deleteImage(req.params.id, req.params.imageId);
  if (!deleted) return res.status(404).json({ ok: false, error: 'Image introuvable' });
  logAudit(req, 'catalog.component.image.deleted', { componentId: component.id, imageId: req.params.imageId });
  res.json({ ok: true });
}));

// Observabilité centrée Service (Priorité 5) : incidents réellement rattachés
// au composant (voir incidents.component_id, migration 0046) — base du calcul
// de disponibilité ci-dessous. Lecture ouverte, comme le reste de la fiche.
router.get('/components/:id/incidents', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const items = await incidentStore.listForComponent(req.params.id);
  res.json({ ok: true, items });
}));

// Vue SLO/SLA réelle (pas de donnée inventée) : la disponibilité est
// calculée à partir du temps d'impact réel des incidents rattachés au
// composant (created_at → resolved_at, ou → maintenant si encore ouvert),
// borné à la fenêtre demandée. Simplification assumée et documentée : les
// incidents qui se chevauchent dans le temps sont comptés indépendamment
// (pas de fusion d'intervalles), donc le temps d'indisponibilité calculé
// est un majorant, jamais un chiffre sous-estimé. slo_target vient du
// composant (défini par l'équipe) ; sans valeur, "objectif" est null et
// error_budget_remaining_pct n'est pas calculé plutôt que d'inventer 99.9%
// par défaut.
router.get('/components/:id/slo', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const windowDays = Math.min(Math.max(Number(req.query.days) || 30, 1), 90);
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const incidents = await incidentStore.listForComponent(req.params.id);

  function impactMs(periodStart, periodEnd) {
    let total = 0;
    for (const inc of incidents) {
      const start = new Date(inc.created_at).getTime();
      const end = inc.resolved_at ? new Date(inc.resolved_at).getTime() : now;
      const overlapStart = Math.max(start, periodStart);
      const overlapEnd = Math.min(end, periodEnd);
      if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
    }
    return total;
  }

  const currentStart = now - windowMs;
  const previousStart = currentStart - windowMs;
  const currentImpact = impactMs(currentStart, now);
  const previousImpact = impactMs(previousStart, currentStart);
  const availabilityPct = Math.max(0, 100 - (currentImpact / windowMs) * 100);
  const previousAvailabilityPct = Math.max(0, 100 - (previousImpact / windowMs) * 100);
  const target = component.slo_target != null ? Number(component.slo_target) : null;

  res.json({
    ok: true,
    windowDays,
    availabilityPct: Number(availabilityPct.toFixed(3)),
    target,
    errorBudgetRemainingPct: target != null ? Number((availabilityPct - (100 - target)).toFixed(3)) : null,
    trend: Number((availabilityPct - previousAvailabilityPct).toFixed(3)),
    incidentCount: incidents.filter((i) => new Date(i.created_at).getTime() >= currentStart).length,
    openIncidentCount: incidents.filter((i) => i.status !== 'resolved').length,
    history: incidents.slice(0, 20)
  });
}));

// Traces distribuées (Priorité 5) : recherche par le nom du composant
// (convention `service.name` OpenTelemetry — best-effort, NexUs n'injecte
// aucun SDK de traçage, voir tracingService.js). 409 si non configuré,
// jamais de traces inventées.
router.get('/components/:id/traces', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const items = await tracing.searchTraces(component.slug);
  res.json({ ok: true, items, uiUrl: tracing.tracingUiUrl(component.slug) });
}));

// Changelog / Releases (todo.md item 37) : mêmes règles d'accès que le
// composant lui-même — lecture ouverte à quiconque le voit déjà,
// écriture réservée maintainer+ sur le projet du composant.
router.get('/components/:id/releases', asyncHandler(async (req, res) => {
  const existing = await orgStore.getComponent(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  res.json({ ok: true, items: await orgStore.listComponentReleases(req.params.id) });
}));

router.post('/components/:id/releases', asyncHandler(async (req, res) => {
  const existing = await orgStore.getComponent(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(existing.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const { version, notes, commitSha, prUrl, pipelineUrl, deploymentUrl } = req.body || {};
  if (!version || !version.trim()) return res.status(400).json({ ok: false, error: 'version requise' });
  try {
    const release = await orgStore.createComponentRelease(req.params.id, { version: version.trim(), notes, commitSha, prUrl, pipelineUrl, deploymentUrl, userId: req.user.id });
    logAudit(req, 'catalog.component.release', { componentId: existing.id, version: release.version });
    res.status(201).json({ ok: true, release });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Cette version existe déjà pour ce composant' });
    throw err;
  }
}));

// API Docs (Étape 17 IDP, chantier #14) : pas de nouvelle table — réutilise
// la convention déjà existante `links` (JSONB [{label,url}]) plutôt que
// d'ajouter une colonne dédiée. Un composant kind='api' documente son
// spec OpenAPI via un lien libellé "OpenAPI"/"Swagger" (insensible à la
// casse) ; cette route va la chercher et la sert déjà parsée (JSON ou
// YAML) pour que le frontend n'ait besoin d'aucune librairie Swagger UI
// complète — juste un rendu simple endpoints/schémas. Proxy côté backend
// (pas de fetch direct navigateur) pour éviter tout souci CORS sur la
// spec hébergée par le dépôt/CI du service.
router.get('/components/:id/openapi', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const link = (component.links || []).find((l) => /openapi|swagger/i.test(l.label || ''));
  if (!link?.url) return res.json({ ok: true, configured: false });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(link.url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return res.json({ ok: true, configured: true, error: `Échec du téléchargement (HTTP ${response.status})`, sourceUrl: link.url });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const spec = contentType.includes('json') || link.url.endsWith('.json') ? JSON.parse(text) : yaml.load(text);
    res.json({ ok: true, configured: true, sourceUrl: link.url, spec });
  } catch (err) {
    res.json({ ok: true, configured: true, error: `Impossible de charger/parser la spec OpenAPI : ${err.message}`, sourceUrl: link.url });
  }
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

// Policy Engine (ÉTAPE 16 IDP) : évalue les policies ACTIVÉES de
// l'organisation du composant contre ses données réelles — voir
// services/policyEngine.js. Même portée de lecture que GET /components/:id
// (aucune écriture ici, une évaluation ne modifie rien).
router.get('/components/:id/policy-check', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const policies = await orgStore.listPoliciesForOrg(component.org_id);
  res.json({ ok: true, ...evaluatePolicies(component, policies) });
}));

// Service Bindings (ÉTAPE 15 IDP) : un composant déclare un besoin
// (PostgreSQL, Redis, stockage objet, API...) exposé sous un nom de
// variable d'environnement — voir db/migrations/0019_component_bindings.sql.
// Le secret lui-même ne transite JAMAIS ici : au mieux une référence vers
// une entrée du coffre-fort du projet (store/vaultStore.js), validée
// appartenir à CE projet avant d'être acceptée (jamais une référence vers
// le coffre-fort d'un autre projet, même si l'appelant en connaît l'id).
const BINDING_TYPES = ['postgres', 'redis', 'object_storage', 'api', 'other'];

router.get('/components/:id/bindings', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const bindings = await orgStore.listBindingsForComponent(req.params.id);
  // Label de l'entrée de coffre-fort jointe (jamais le secret — findVaultEntry
  // renvoie l'entrée complète, on ne prend que le label) : évite d'obliger le
  // frontend à connaître le projet legacy pour afficher un nom lisible.
  const items = bindings.map((b) => ({ ...b, vault_entry_label: b.vault_entry_id ? (findVaultEntry(b.vault_entry_id)?.label || null) : null }));
  res.json({ ok: true, items });
}));

router.post('/components/:id/bindings', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const { bindingType, envVarName, vaultEntryId, description } = req.body || {};
  if (!bindingType || !envVarName) return res.status(400).json({ ok: false, error: 'bindingType et envVarName requis' });
  if (!BINDING_TYPES.includes(bindingType)) return res.status(400).json({ ok: false, error: 'Type de binding invalide' });
  if (!/^[A-Z][A-Z0-9_]*$/.test(envVarName)) return res.status(400).json({ ok: false, error: 'Nom de variable invalide (MAJUSCULES, chiffres, underscore, ex. DATABASE_URL)' });
  if (vaultEntryId) {
    const project = await orgStore.getProject(component.project_id);
    const entry = findVaultEntry(vaultEntryId);
    if (!entry || entry.tier !== 'project' || entry.projectId !== project?.legacy_id) {
      return res.status(400).json({ ok: false, error: "Entrée du coffre-fort introuvable pour le projet de ce composant" });
    }
  }
  let binding;
  try {
    binding = await orgStore.createBinding({ componentId: req.params.id, bindingType, envVarName, vaultEntryId, description });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: `Une variable "${envVarName}" est déjà déclarée pour ce composant` });
    throw err;
  }
  logAudit(req, 'catalog.binding.create', { componentId: req.params.id, bindingType, envVarName });
  res.status(201).json({ ok: true, binding });
}));

router.delete('/components/:id/bindings/:bindingId', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const binding = await orgStore.getBinding(req.params.bindingId);
  if (!binding || binding.component_id !== req.params.id) return res.status(404).json({ ok: false, error: 'Binding introuvable' });
  await orgStore.deleteBinding(req.params.bindingId);
  logAudit(req, 'catalog.binding.delete', { componentId: req.params.id, bindingId: req.params.bindingId });
  res.json({ ok: true });
}));

// Provisioning réel (ÉTAPE 15 IDP, suite — voir migration 0023) : synchronise
// la valeur du secret référencé vers un vrai Secret Kubernetes dans le
// namespace déjà provisionné de l'environnement choisi. La valeur ne
// transite jamais dans la réponse HTTP ni dans les logs — seul le résultat
// (synced/failed) l'est. Réservé maintainer+ comme les autres mutations de
// bindings : ça touche un vrai cluster Kubernetes.
router.post('/components/:id/bindings/:bindingId/sync', asyncHandler(async (req, res) => {
  const component = await orgStore.getComponent(req.params.id);
  if (!component) return res.status(404).json({ ok: false, error: 'Composant introuvable' });
  const role = await orgStore.getProjectRole(component.project_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }
  const binding = await orgStore.getBinding(req.params.bindingId);
  if (!binding || binding.component_id !== req.params.id) return res.status(404).json({ ok: false, error: 'Binding introuvable' });
  const { environmentId } = req.body || {};
  if (!environmentId) return res.status(400).json({ ok: false, error: 'environmentId requis' });
  const environment = await orgStore.getEnvironment(environmentId);
  if (!environment || environment.project_id !== component.project_id) {
    return res.status(404).json({ ok: false, error: 'Environnement introuvable pour ce projet' });
  }

  const result = await syncBindingSecret(binding, component, environment);
  await orgStore.recordBindingSync(binding.id, { environmentId, status: result.status, message: result.message });
  logAudit(req, 'catalog.binding.sync', { componentId: req.params.id, bindingId: binding.id, environmentId, resultStatus: result.status });
  res.json({ ok: result.status === 'synced', result });
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

  const role = await orgStore.getProjectRole(projectId, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.projectRoleAtLeast(role, 'maintainer')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant sur ce projet (requis : maintainer)' });
  }

  let result;
  try {
    result = await importServiceManifest({ projectId, yaml });
  } catch (err) {
    if (err instanceof ManifestError) return res.status(400).json({ ok: false, error: err.message });
    throw err;
  }
  logAudit(req, result.created ? 'catalog.component.import.create' : 'catalog.component.import.update', { componentId: result.component.id, projectId, name: result.component.name });
  res.status(result.created ? 201 : 200).json({ ok: true, component: result.component, created: result.created });
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
  const { templateId, legacyProjectId, projectId: rawProjectId, name, description, ownerTeamId, repositoryProvider, withDocs, withEnvironment } = req.body || {};
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
    async (createdJob, { isCancelled }) => {
      const log = (step, status, detail) => jobService.appendJobStep(createdJob.id, step, status, detail);
      const result = await scaffoldService({ templateId, name, description, projectId, ownerTeamId, repositoryProvider, withDocs: Boolean(withDocs), withEnvironment: Boolean(withEnvironment), userId: req.user.id, log, isCancelled });
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
