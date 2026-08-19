import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { loadProjectAccess, requireMinRole, resolveProjectRole } from '../middleware/projectAccess.js';
import * as store from '../store/projectsStore.js';
import { notifyUser } from '../services/userNotificationService.js';
import { logProjectActivity, listProjectActivity } from '../services/projectActivityService.js';
import * as presence from '../services/projectPresenceService.js';
import { findUserByUsername, listUsers } from '../store/usersStore.js';
import * as shortcutsStore from '../store/shortcutsStore.js';
import * as vaultStore from '../store/vaultStore.js';
import * as orgStore from '../store/orgStore.js';
import { pool } from '../db/pool.js';
import { logAudit } from '../services/auditService.js';
import { buildProjectWorkspace } from '../services/projectWorkspaceService.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import * as github from '../services/integrations/githubService.js';
import * as deploymentStore from '../store/deploymentStore.js';
import { syncApplication, rollbackApplication, getApplicationHistory } from '../services/integrations/argocdService.js';
import * as jobService from '../services/jobService.js';
import * as incidentStore from '../store/incidentStore.js';
import * as changeStore from '../store/changeStore.js';
import * as maintenanceStore from '../store/maintenanceStore.js';
import { getPipeline as getDeploymentPipeline } from '../services/deploymentService.js';
import { listEnvironmentsWithStatus, linkEnvironment, promote, listPromotions, provisionArgocdApp, rollbackEnvironment } from '../services/environmentPromotionService.js';
import { provisionFromBlueprint } from '../services/environmentProvisioningService.js';
import { checkQuotaBeforeCreate } from '../services/quotaService.js';
import { listResourceGrants, setResourceGrant } from '../store/orgStore.js';
import { verifyPassword, hashPassword } from '../utils/crypto.js';
import { getMinPasswordLength } from '../store/identityStore.js';
import { scanProjectRepos } from '../services/projectScanService.js';
import * as projectScansStore from '../store/projectScansStore.js';

const router = Router();
router.use(requireAuth);

// Visibilité : un administrateur voit tous les projets. Un compte Utilisateur
// ne voit que les projets dont il est membre — c'est la restriction demandée
// ("une personne qui ne travaille que sur un projet ne doit voir que
// celui-ci"). Appliquée ici, pas seulement côté frontend : /projects/:id
// refuse (404, volontairement pas 403 pour ne pas confirmer l'existence du
// projet) l'accès à un projet dont on n'est pas membre. Un membre ajouté via
// le RBAC relationnel (PUT /:id/members/:userId, table project_members) n'a
// jamais son id inséré dans l'ancien memberIds plat — les deux sources
// d'appartenance sont donc fusionnées ici (bug corrigé : sans ça, un tel
// membre pouvait accéder au projet par son id ou depuis la recherche, mais
// n'apparaissait jamais dans sa propre liste "Projets").
async function listMyProjects(user) {
  const all = store.listProjects();
  if (user.role === 'admin') return all;
  const relationalIds = pool ? new Set((await orgStore.listProjectsForUser(user.id)).map((p) => p.legacy_id).filter(Boolean)) : new Set();
  return all.filter((p) => store.isMember(p, user.id) || relationalIds.has(p.id));
}

router.get('/', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await listMyProjects(req.user) });
}));

// orgId / relationalProjectId : résolus via le projet relationnel miroir
// (legacy_id, voir POST / ci-dessous qui le provisionne à la création) —
// permet au frontend de relier ce projet à son wiki d'organisation
// (routes/wiki.routes.js, GET /wiki?orgId=...&projectId=...) sans exposer
// tout le socle relationnel ici. IMPORTANT : wiki_pages.project_id référence
// projects.id (l'id RELATIONNEL), jamais le legacy_id utilisé partout
// ailleurs dans cette API — les deux sont distincts, d'où l'exposition des
// deux champs séparément plutôt que de réutiliser req.legacyProject.id.
// null si Postgres n'est pas configuré ou si le provisioning a échoué.
router.get('/:id', loadProjectAccess(), asyncHandler(async (req, res) => {
  const pgProject = pool ? await orgStore.getProjectByLegacyId(req.legacyProject.id) : null;
  res.json({
    ok: true,
    project: { ...req.legacyProject, orgId: pgProject?.org_id || null, relationalProjectId: pgProject?.id || null },
    role: req.projectRole
  });
}));

// Vue d'ensemble "mes projets" : équivalent de GET /system/overview (réservé
// aux admins) mais pour un membre ordinaire — n'agrège que ce qui concerne
// SES propres projets (incidents ouverts, changements en attente de sa
// décision, maintenances à venir), jamais la plateforme entière. Placé sur
// un segment à deux niveaux (/mine/overview) pour ne jamais entrer en
// collision avec GET /:id (un seul segment).
router.get('/mine/overview', asyncHandler(async (req, res) => {
  const myProjects = await listMyProjects(req.user);
  if (!pool || myProjects.length === 0) {
    return res.json({ ok: true, relationalCoreConfigured: Boolean(pool), projects: [], openIncidents: [], pendingChanges: [], upcomingMaintenance: [] });
  }
  const perProject = await Promise.all(myProjects.map(async (legacy) => {
    const pg = await orgStore.getProjectByLegacyId(legacy.id);
    if (!pg) return null;
    const role = await resolveProjectRole(legacy, req.user);
    const [incidents, changes, windows] = await Promise.all([
      incidentStore.listForProject(pg.id, { status: 'open' }),
      changeStore.listForProject(pg.id, { status: 'pending' }),
      maintenanceStore.listForProject(pg.id)
    ]);
    const now = Date.now();
    return {
      project: { id: legacy.id, name: legacy.name },
      role,
      openIncidents: incidents.map((i) => ({ id: i.id, title: i.title, severity: i.severity })),
      pendingChanges: changes.map((c) => ({ id: c.id, title: c.title })),
      upcomingMaintenance: windows.filter((w) => !w.cancelled_at && new Date(w.ends_at).getTime() > now)
        .map((w) => ({ id: w.id, title: w.title, startsAt: w.starts_at, endsAt: w.ends_at }))
    };
  }));
  const valid = perProject.filter(Boolean);
  res.json({
    ok: true,
    relationalCoreConfigured: true,
    projects: valid.map((v) => ({ ...v.project, role: v.role })),
    openIncidents: valid.flatMap((v) => v.openIncidents.map((i) => ({ ...i, projectId: v.project.id, projectName: v.project.name }))),
    pendingChanges: valid.flatMap((v) => v.pendingChanges.filter(() => roleAtLeastForDecide(v.role)).map((c) => ({ ...c, projectId: v.project.id, projectName: v.project.name }))),
    upcomingMaintenance: valid.flatMap((v) => v.upcomingMaintenance.map((w) => ({ ...w, projectId: v.project.id, projectName: v.project.name })))
  });
}));

function roleAtLeastForDecide(role) {
  return role === 'maintainer' || role === 'owner';
}

// "Mes environnements" (page "Mon travail") : environnements de type
// preview sur MES projets — aucune notion de "créé par moi" n'existe sur
// la table environments (pas de created_by), donc ce n'est pas un filtre
// par propriétaire mais par appartenance projet, comme /mine/overview et
// /mine/tasks juste au-dessus.
router.get('/mine/environments', asyncHandler(async (req, res) => {
  const myProjects = await listMyProjects(req.user);
  if (!pool || myProjects.length === 0) return res.json({ ok: true, items: [] });
  const perProject = await Promise.all(myProjects.map(async (legacy) => {
    const pg = await orgStore.getProjectByLegacyId(legacy.id);
    if (!pg) return [];
    const envs = await orgStore.listEnvironments(pg.id);
    return envs.filter((e) => e.kind === 'preview').map((e) => ({ ...e, projectId: legacy.id, projectName: legacy.name }));
  }));
  const items = perProject.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ ok: true, items });
}));

// "Mon travail" (page frontend éponyme) : mes tâches, tous projets
// confondus, avec le nom du projet pour affichage/navigation directe.
// Filtre par appartenance projet (comme /mine/overview) pour ne jamais
// exposer une tâche d'un projet dont l'utilisateur a été retiré depuis.
router.get('/mine/tasks', asyncHandler(async (req, res) => {
  const myProjects = await listMyProjects(req.user);
  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const tasks = store.listTasksAssignedTo(req.user.id).filter((t) => myProjectIds.has(t.projectId));
  const projectName = (id) => myProjects.find((p) => p.id === id)?.name || id;
  res.json({
    ok: true,
    items: tasks.map((t) => ({ ...t, projectName: projectName(t.projectId) }))
  });
}));

const ICON_PATTERN = /^\p{Extended_Pictographic}(‍\p{Extended_Pictographic})*$|^$/u;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, description, tags, memberIds, repoKeys, icon, color, organizationId } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Nom requis' });
  if (icon && !ICON_PATTERN.test(icon)) return res.status(400).json({ ok: false, error: 'Icône invalide (un seul emoji attendu)' });
  if (color && !COLOR_PATTERN.test(color)) return res.status(400).json({ ok: false, error: 'Couleur invalide (format #RRGGBB attendu)' });
  const project = store.createProject({ name, description, tags, memberIds, repoKeys, icon, color });
  // Provisionne aussi le projet dans le socle relationnel quand Postgres est
  // disponible, avec les mêmes membres en rôle "maintainer" par défaut
  // (ajustable ensuite via PUT /:id/members/:userId) et deux environnements
  // (production, staging) créés automatiquement.
  if (pool) {
    try {
      const orgs = await orgStore.listOrganizationsForUser(req.user.id);
      // Bug corrigé : organizationId envoyé par le client était jusqu'ici
      // silencieusement ignoré — le projet finissait toujours rattaché à
      // la première organisation de l'utilisateur (orgs[0]), jamais celle
      // demandée, dès qu'un compte appartenait à plusieurs organisations.
      let org = organizationId ? orgs.find((o) => o.id === organizationId) : orgs[0];
      // organizationId invalide/inaccessible : repli sur le comportement
      // précédent (première organisation, ou "Organisation par défaut")
      // plutôt qu'un échec — le projet legacy ci-dessus est déjà créé, une
      // erreur ici laisserait un projet legacy sans réponse cohérente.
      if (!org) org = orgs[0] || await orgStore.createOrganization({ name: 'Organisation par défaut', slug: 'default', ownerUserId: req.user.id });
      const pgProject = await orgStore.createProject({
        orgId: org.id, name, slug: slugify(name), description, tags, repoKeys,
        ownerUserId: req.user.id, legacyId: project.id
      });
      for (const memberId of (memberIds || [])) {
        if (memberId === req.user.id) continue;
        await orgStore.setMemberRole(pgProject.id, memberId, 'developer');
      }
    } catch (err) {
      // Le projet legacy reste valide même si le provisioning relationnel échoue
      // (ex. slug déjà pris) : on log sans bloquer la création côté produit.
      req.log?.warn({ err }, 'Provisioning Postgres du projet échoué (projet legacy conservé)');
    }
  }
  logAudit(req, 'project.create', { projectId: project.id, name: project.name });
  res.status(201).json({ ok: true, project });
}));

router.put('/:id', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  // Allowlist explicite : req.body ne doit jamais pouvoir écrire des champs
  // internes comme vaultPasswordHash (géré exclusivement par les routes
  // dédiées ci-dessous, avec re-authentification).
  const { name, description, tags, memberIds, repoKeys, status, icon, color } = req.body || {};
  if (icon && !ICON_PATTERN.test(icon)) return res.status(400).json({ ok: false, error: 'Icône invalide (un seul emoji attendu)' });
  if (color && !COLOR_PATTERN.test(color)) return res.status(400).json({ ok: false, error: 'Couleur invalide (format #RRGGBB attendu)' });
  const project = store.updateProject(req.params.id, { name, description, tags, memberIds, repoKeys, status, icon, color });
  if (req.pgProject) {
    await orgStore.updateProjectByLegacyId(req.params.id, { name, description, tags, repoKeys });
  }
  logAudit(req, 'project.update', { projectId: project.id });
  const { vaultPasswordHash, ...publicProject } = project;
  res.json({ ok: true, project: publicProject });
}));

// Mot de passe de coffre-fort du projet : verrou distinct du mot de passe du
// compte, requis pour révéler ses secrets (voir vault.routes.js). Seul un
// owner/maintainer peut le définir ; le changer exige de retaper l'ancien
// (sauf s'il n'était pas encore défini, ou pour un admin plateforme).
router.put('/:id/vault-password', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const minLength = getMinPasswordLength();
  if (!newPassword || newPassword.length < minLength) {
    return res.status(400).json({ ok: false, error: `Le mot de passe doit contenir au moins ${minLength} caractères` });
  }
  const rawProject = store.getProject(req.params.id);
  if (rawProject.vaultPasswordHash && req.user.role !== 'admin') {
    if (!verifyPassword(currentPassword || '', rawProject.vaultPasswordHash)) {
      return res.status(401).json({ ok: false, error: 'Mot de passe de coffre-fort actuel incorrect' });
    }
  }
  store.setProjectVaultPassword(req.params.id, hashPassword(newPassword));
  logAudit(req, 'project.vaultPassword.set', { projectId: req.params.id });
  res.json({ ok: true });
}));

router.delete('/:id/vault-password', loadProjectAccess(), requireMinRole('owner'), asyncHandler(async (req, res) => {
  store.clearProjectVaultPassword(req.params.id);
  logAudit(req, 'project.vaultPassword.clear', { projectId: req.params.id });
  res.json({ ok: true });
}));

// Garde-fou avant une action irréversible : la suppression cascade sur tout
// ce qui référence le projet (incidents, changements, jobs, fenêtres de
// maintenance, membres — ON DELETE CASCADE, voir migrations). Bloquer tant
// qu'il reste un incident ouvert ou un changement en attente évite de
// perdre silencieusement un suivi opérationnel en cours ; pas de contourne-
// ment (force flag) — la ressource bloquante doit être explicitement
// résolue/rejetée d'abord, jamais escamotée par la suppression du projet.
router.delete('/:id', loadProjectAccess(), requireMinRole('owner'), asyncHandler(async (req, res) => {
  if (req.pgProject) {
    const [openIncidents, pendingChanges] = await Promise.all([
      incidentStore.listForProject(req.pgProject.id, { status: 'open' }),
      changeStore.listForProject(req.pgProject.id, { status: 'pending' })
    ]);
    const investigating = await incidentStore.listForProject(req.pgProject.id, { status: 'investigating' });
    const blockers = openIncidents.length + investigating.length + pendingChanges.length;
    if (blockers > 0) {
      return res.status(409).json({
        ok: false,
        error: `Suppression bloquée : ${openIncidents.length + investigating.length} incident(s) non résolu(s) et ${pendingChanges.length} changement(s) en attente sur ce projet. Résolvez-les ou rejetez-les d'abord.`
      });
    }
  }
  store.deleteProject(req.params.id);
  if (req.pgProject) await orgStore.deleteProjectByLegacyId(req.params.id);
  logAudit(req, 'project.delete', { projectId: req.params.id });
  res.json({ ok: true });
}));

// --- Membres et rôles (socle relationnel uniquement) ---
// DevSecOps par projet : SAST (Semgrep), SCA (Trivy fs) et IaC (Checkov) sur
// les dépôts réellement liés au projet, contrairement aux scans "plateforme
// entière" de codeScans.routes.js/iacScans.routes.js. Lancer un scan est au
// moins aussi sensible qu'un job de synchronisation (clone via jeton Git
// configuré) : maintainer+, comme le reste des actions d'écriture du projet.
router.get('/:id/security-scans', loadProjectAccess(), asyncHandler(async (req, res) => {
  res.json({ ok: true, items: projectScansStore.listScans(req.legacyProject.id) });
}));

router.post('/:id/security-scans', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  const repoKeys = req.legacyProject.repoKeys || [];
  if (repoKeys.length === 0) return res.status(400).json({ ok: false, error: 'Aucun dépôt lié à ce projet' });
  const results = await scanProjectRepos(repoKeys);
  const entry = projectScansStore.recordScan(req.legacyProject.id, results);
  const totalFindings = results.reduce((sum, r) => sum + (r.sast?.total || 0) + (r.sca?.total || 0) + (r.iac?.total || 0), 0);
  logAudit(req, 'project.securityScan.run', { projectId: req.legacyProject.id, repoCount: repoKeys.length, totalFindings });
  res.status(201).json({ ok: true, scan: entry });
}));

router.get('/:id/members', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [], migrated: false });
  res.json({ ok: true, items: await orgStore.listMembers(req.pgProject.id), migrated: true });
}));

router.put('/:id/members/:userId', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const { role } = req.body || {};
  if (!['viewer', 'developer', 'maintainer', 'owner'].includes(role)) {
    return res.status(400).json({ ok: false, error: 'Rôle invalide' });
  }
  // Promouvoir quelqu'un au rôle owner exige soi-même d'être owner (un
  // maintainer ne peut pas créer un pair au-dessus de son propre niveau).
  if (role === 'owner' && req.projectRole !== 'owner') {
    return res.status(403).json({ ok: false, error: 'Seul un propriétaire du projet peut attribuer ce rôle' });
  }
  const member = await orgStore.setMemberRole(req.pgProject.id, req.params.userId, role);
  logAudit(req, 'project.member.role', { projectId: req.legacyProject.id, userId: req.params.userId, role });
  res.json({ ok: true, member });
}));

router.delete('/:id/members/:userId', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  await orgStore.removeMember(req.pgProject.id, req.params.userId);
  logAudit(req, 'project.member.remove', { projectId: req.legacyProject.id, userId: req.params.userId });
  res.json({ ok: true });
}));

// --- Octrois d'accès par ressource (granularité fine, socle relationnel
// uniquement — voir store/orgStore.js, hasResourceAccess/vault.routes.js) ---
router.get('/:id/resource-grants', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [] });
  res.json({ ok: true, items: await listResourceGrants(req.pgProject.id) });
}));

router.put('/:id/resource-grants/:userId/:resource', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const { resource, userId } = req.params;
  if (resource !== 'vault') return res.status(400).json({ ok: false, error: 'Ressource inconnue' });
  const { level } = req.body || {};
  if (level && !['read', 'write'].includes(level)) return res.status(400).json({ ok: false, error: 'Niveau invalide (read ou write, ou vide pour retirer)' });
  const grant = await setResourceGrant(req.pgProject.id, userId, resource, level || null, req.user.id);
  logAudit(req, 'project.resourceGrant.set', { projectId: req.legacyProject.id, userId, resource, level: level || null });
  res.json({ ok: true, grant });
}));

// --- Environnements (socle relationnel uniquement) ---
router.get('/:id/environments', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [], migrated: false });
  // Statut réel (santé/revision) de chaque environnement lié à une
  // application Argo CD — jamais de version inventée, voir
  // environmentPromotionService.js.
  const items = await listEnvironmentsWithStatus(req.pgProject.id);
  res.json({ ok: true, items, migrated: true });
}));

router.post('/:id/environments', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const { name, kind, isProduction, blueprintId, sourceBranch, sourceCommit, sourcePrUrl } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Nom requis' });
  // blueprintId non validé ici contre l'organisation du projet : la
  // contrainte FK (environments.blueprint_id) suffit à rejeter un id
  // inexistant, et un blueprint d'une AUTRE organisation resterait de
  // toute façon invisible/inutilisable côté UI (sélecteur alimenté par
  // GET /environment-blueprints?orgId=<org du projet>).
  const blueprint = blueprintId ? await orgStore.getEnvironmentBlueprint(blueprintId) : null;

  // Quotas (ÉTAPE 26 IDP) : vérifié AVANT toute écriture — jamais un
  // environnement créé puis annulé après coup. Silencieux si l'organisation
  // n'a défini aucun quota (comportement inchangé par défaut).
  const quotaCheck = await checkQuotaBeforeCreate(req.pgProject.org_id, blueprint);
  if (!quotaCheck.allowed) return res.status(409).json({ ok: false, error: quotaCheck.reason });

  const environment = await orgStore.createEnvironment(req.pgProject.id, { name, kind, isProduction, blueprintId, sourceBranch, sourceCommit, sourcePrUrl });

  // Provisioning réel (ÉTAPE 7 IDP) : uniquement si un blueprint a été
  // choisi — un environnement créé sans blueprint reste purement déclaratif,
  // comme avant. Ne bloque jamais la réponse HTTP sur un échec Kubernetes
  // (voir environmentProvisioningService, qui n'a jamais lancé) : le
  // résultat réel est déjà consigné sur l'environnement au retour.
  let provisioning = { status: 'skipped', message: 'Aucun blueprint sélectionné' };
  if (blueprint) {
    provisioning = await provisionFromBlueprint(environment, blueprint, req.pgProject.slug);
  }

  logAudit(req, 'project.environment.create', { projectId: req.legacyProject.id, name, provisioning: provisioning.status });
  res.status(201).json({ ok: true, environment: { ...environment, provisioning_status: provisioning.status, provisioning_message: provisioning.message, provisioned_namespace: provisioning.namespace || null } });
}));

// Destroy Preview (ÉTAPE 11) : suppression manuelle, jamais la production
// (voir orgStore.deleteEnvironment, qui refuse déjà is_production=true —
// la vérification ici évite en plus un message d'erreur générique et donne
// une raison claire à l'appelant).
router.delete('/:id/environments/:envId', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const environment = await orgStore.getEnvironment(req.params.envId);
  if (!environment || environment.project_id !== req.pgProject.id) return res.status(404).json({ ok: false, error: 'Environnement introuvable pour ce projet' });
  if (environment.is_production) return res.status(403).json({ ok: false, error: 'Un environnement de production ne peut pas être supprimé depuis cette action' });
  await orgStore.deleteEnvironment(req.params.envId);
  logAudit(req, 'project.environment.delete', { projectId: req.legacyProject.id, environmentId: req.params.envId, name: environment.name });
  res.json({ ok: true });
}));

router.put('/:id/environments/:envId/link', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  // IDOR corrigé (audit sécurité) : linkEnvironment() ne vérifie lui-même
  // que l'existence de l'environnement, jamais son project_id — sans ce
  // contrôle ici, un maintainer d'un projet A pouvait modifier le lien Argo
  // CD d'un environnement appartenant à un projet B en devinant/énumérant
  // son id, malgré loadProjectAccess() qui n'autorise que le rôle sur A.
  const target = await orgStore.getEnvironment(req.params.envId);
  if (!target || target.project_id !== req.pgProject.id) return res.status(404).json({ ok: false, error: 'Environnement introuvable pour ce projet' });
  await guardProductionEnvironment(req, req.params.envId);
  const { argocdApp } = req.body || {};
  const environment = await linkEnvironment(req.params.envId, argocdApp || null);
  logAudit(req, 'project.environment.link', { projectId: req.legacyProject.id, environmentId: req.params.envId, argocdApp: argocdApp || null });
  res.json({ ok: true, environment });
}));

// Provisionne réellement l'application Argo CD (voir
// environmentPromotionService.provisionArgocdApp) — équivalent, pour le
// socle relationnel, de POST /deployments/:id/provision-argocd-app.
router.post('/:id/environments/:envId/provision-argocd-app', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const environment = await orgStore.getEnvironment(req.params.envId);
  if (!environment || environment.project_id !== req.pgProject.id) return res.status(404).json({ ok: false, error: 'Environnement introuvable pour ce projet' });
  // Même garde que sync/rollback/promote (audit sécurité) : provisionner
  // (créer/reconfigurer) l'Application Argo CD d'un environnement de
  // production est une action au moins aussi sensible qu'une simple
  // synchronisation — pas de raison qu'elle échappe à guardProductionEnvironment.
  await guardProductionEnvironment(req, req.params.envId);
  const { appName, repoURL, path, targetRevision, destinationNamespace, automatedSync } = req.body || {};
  const updated = await provisionArgocdApp(req.params.envId, req.pgProject.slug, { appName, repoURL, path, targetRevision, destinationNamespace, automatedSync });
  logAudit(req, 'project.environment.provision_argocd_app', { projectId: req.legacyProject.id, environmentId: req.params.envId, appName: updated.argocd_app });
  res.status(201).json({ ok: true, environment: updated });
}));

router.get('/:id/environments/promotions', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [] });
  res.json({ ok: true, items: await listPromotions(req.pgProject.id) });
}));

router.post('/:id/environments/:envId/promote', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  await guardProductionEnvironment(req, req.params.envId);
  const { fromEnvironmentId } = req.body || {};
  const promotion = await promote({
    projectId: req.pgProject.id, fromEnvironmentId: fromEnvironmentId || null,
    toEnvironmentId: req.params.envId, triggeredBy: req.user.id
  });
  logAudit(req, 'project.environment.promote', { projectId: req.legacyProject.id, toEnvironmentId: req.params.envId, fromEnvironmentId: fromEnvironmentId || null, status: promotion.status });
  res.status(201).json({ ok: true, promotion });
}));

// Rollback réel (ÉTAPE 17 IDP, équivalent relationnel de
// POST /deployments/:linkId/rollback) : réservé owner, comme le rollback
// legacy — jamais seulement maintainer, quelle que soit la criticité de
// l'environnement (contrairement à promote/sync qui l'exigent uniquement
// pour la production, un rollback reste une action suffisamment sensible
// pour rester au niveau le plus haut inconditionnellement).
router.post('/:id/environments/:envId/rollback', loadProjectAccess(), requireMinRole('owner'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const { toPromotionId } = req.body || {};
  if (!toPromotionId) return res.status(400).json({ ok: false, error: 'toPromotionId requis' });
  const rollback = await rollbackEnvironment({
    projectId: req.pgProject.id, environmentId: req.params.envId, toPromotionId, triggeredBy: req.user.id
  });
  logAudit(req, 'project.environment.rollback', { projectId: req.legacyProject.id, environmentId: req.params.envId, toPromotionId, status: rollback.status });
  res.status(201).json({ ok: true, rollback });
}));

// --- Espace de travail : agrège l'état réel des dépôts liés au projet
// (branches, derniers commits, MR/PR ouvertes, dernières exécutions CI) —
// voir services/projectWorkspaceService.js. C'est le point d'entrée unique
// pour "ouvrir" un projet dans Nexus : plus besoin de recouper soi-même
// Développement, Pipelines et Revues pour un dépôt donné.
router.get('/:id/workspace', loadProjectAccess(), asyncHandler(async (req, res) => {
  const repos = await buildProjectWorkspace(req.legacyProject.repoKeys);
  res.json({ ok: true, project: req.legacyProject, role: req.projectRole, repos });
}));

// repoKey (ex. "gitlab:42", "github:org/repo") tel que stocké dans
// project.repoKeys. Les actions ci-dessous exigent que le dépôt ciblé y
// figure explicitement : sans ce garde-fou, un développeur du projet A
// pourrait relancer un pipeline ou approuver une revue sur un dépôt du
// projet B simplement en devinant sa clé — le rôle projet ne suffit pas à
// lui seul, la portée (quel dépôt appartient à quel projet) doit aussi être
// vérifiée à chaque action d'écriture.
function assertRepoInProject(project, repoKey) {
  if (!project.repoKeys.includes(repoKey)) {
    throw Object.assign(new Error("Ce dépôt n'est pas rattaché à ce projet"), { status: 403 });
  }
}

// Relance un pipeline/workflow en échec directement depuis l'espace de
// travail du projet, plutôt que depuis la vue globale Pipelines CI/CD
// (réservée aux admins pour l'usage transverse). Un développeur du projet
// suffit : relancer une exécution CI n'est pas une action destructrice.
router.post('/:id/workspace/pipelines/:runKey/retry', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const runKey = decodeURIComponent(req.params.runKey);
  const [provider, ...rest] = runKey.split(':');
  if (provider === 'gitlab') {
    const [projectId, pipelineId] = rest;
    assertRepoInProject(req.legacyProject, `gitlab:${projectId}`);
    const result = await gitlab.retryPipeline(projectId, pipelineId);
    logAudit(req, 'pipeline.retried', { projectId: req.legacyProject.id, provider, repo: projectId, pipelineId });
    return res.json({ ok: true, result });
  }
  if (provider === 'github') {
    const repoFull = rest.slice(0, -1).join(':');
    const runId = rest[rest.length - 1];
    const [owner, repo] = repoFull.split('/');
    assertRepoInProject(req.legacyProject, `github:${repoFull}`);
    const result = await github.rerunWorkflow(owner, repo, runId);
    logAudit(req, 'pipeline.retried', { projectId: req.legacyProject.id, provider, owner, repo, runId });
    return res.json({ ok: true, result });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

// Approbation de revue de code : exige maintainer+ (pas developer), car
// approuver une MR/PR conditionne un merge en production — plus proche d'une
// action de gouvernance que d'une action de développement courante.
router.post('/:id/workspace/reviews/:reviewKey/approve', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  const reviewKey = decodeURIComponent(req.params.reviewKey);
  const [provider, ...rest] = reviewKey.split(':');
  if (provider === 'gitlab') {
    const [projectId, iid] = rest;
    assertRepoInProject(req.legacyProject, `gitlab:${projectId}`);
    const result = await gitlab.approveMergeRequest(projectId, iid);
    logAudit(req, 'review.approved', { projectId: req.legacyProject.id, provider, repo: projectId, iid });
    return res.json({ ok: true, result });
  }
  if (provider === 'github') {
    const repoFull = rest.slice(0, -1).join(':');
    const number = rest[rest.length - 1];
    const [owner, repo] = repoFull.split('/');
    assertRepoInProject(req.legacyProject, `github:${repoFull}`);
    const result = await github.approvePullRequest(owner, repo, number);
    logAudit(req, 'review.approved', { projectId: req.legacyProject.id, provider, owner, repo, number });
    return res.json({ ok: true, result });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

// --- Webhook : URL + secret à renseigner côté GitLab/GitHub pour que Nexus
// réagisse aux événements du dépôt (voir routes/webhooks.routes.js). Le
// secret n'est exposé qu'à maintainer+ (au même titre que le coffre-fort
// projet) : quiconque le connaît peut faire croire à Nexus qu'un pipeline a
// échoué et ouvrir des incidents en son nom.
router.get('/:id/webhook', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  res.json({
    ok: true,
    gitlabUrl: `/api/webhooks/gitlab/${req.legacyProject.id}`,
    githubUrl: `/api/webhooks/github/${req.legacyProject.id}`,
    secret: req.pgProject.webhook_secret
  });
}));

router.post('/:id/webhook/rotate', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const secret = await orgStore.rotateWebhookSecret(req.pgProject.id);
  logAudit(req, 'project.webhook.rotated', { projectId: req.legacyProject.id });
  res.json({ ok: true, secret });
}));

// --- Déploiements (rattachement optionnel via deploymentStore.projectId) :
// équivalent scopé au projet de routes/deployments.routes.js (vue globale,
// non protégée par projet — conservée telle quelle pour la compatibilité de
// l'UI existante, voir README). Ici, la synchronisation Argo CD exige
// maintainer+, et si le lien référence un environnement de production
// (via environmentId, résolu dans le socle relationnel), owner est requis même
// pour une simple synchronisation. Le rollback, toujours plus risqué qu'une
// synchronisation normale, exige systématiquement owner, production ou non.
router.get('/:id/deployments', loadProjectAccess(), (req, res) => {
  const items = deploymentStore.listLinks().filter((l) => l.projectId === req.legacyProject.id);
  res.json({ ok: true, items });
});

async function loadDeploymentLink(req, res) {
  const link = deploymentStore.getLink(req.params.linkId);
  if (!link || link.projectId !== req.legacyProject.id) {
    res.status(404).json({ ok: false, error: 'Déploiement introuvable pour ce projet' });
    return null;
  }
  return link;
}

async function guardProductionEnvironment(req, environmentId) {
  if (!environmentId || !req.pgProject) return;
  const environments = await orgStore.listEnvironments(req.pgProject.id);
  const env = environments.find((e) => e.id === environmentId);
  if (env?.is_production && req.projectRole !== 'owner') {
    throw Object.assign(new Error("Cette action sur un environnement de production requiert le rôle propriétaire du projet"), { status: 403 });
  }
}

// Synchronisation et rollback ArgoCD peuvent prendre plusieurs secondes à
// plusieurs minutes selon la taille de l'application — jamais bloquer la
// requête HTTP dessus (voir services/jobService.js). Quand le projet est
// migré vers le socle relationnel (req.pgProject), l'action est déléguée à
// un job persisté et suivi via GET /:id/jobs/:jobId ; sinon (projet pas
// encore migré, pas de table jobs disponible), on retombe sur l'ancien
// comportement synchrone pour ne jamais bloquer un projet legacy.
router.post('/:id/deployments/:linkId/sync', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  const link = await loadDeploymentLink(req, res);
  if (!link) return;
  if (!link.argocdAppName) return res.status(409).json({ ok: false, error: 'Aucune application Argo CD associée' });
  await guardProductionEnvironment(req, link.environmentId);
  const revision = req.body?.revision || null;

  if (req.pgProject) {
    const job = await jobService.enqueue(
      {
        type: 'deployment.sync', projectId: req.pgProject.id, userId: req.user.id,
        payload: { linkId: link.id, appName: link.argocdAppName, revision },
        idempotencyKey: `deployment.sync:${link.id}`
      },
      async () => {
        const result = await syncApplication(link.argocdAppName, revision);
        logAudit(req, 'argocd.application.synced', { projectId: req.legacyProject.id, linkId: link.id, appName: link.argocdAppName, revision });
        return result;
      }
    );
    return res.status(202).json({ ok: true, job });
  }

  const result = await syncApplication(link.argocdAppName, revision);
  logAudit(req, 'argocd.application.synced', { projectId: req.legacyProject.id, linkId: link.id, appName: link.argocdAppName, revision });
  res.json({ ok: true, ...result });
}));

router.post('/:id/deployments/:linkId/rollback', loadProjectAccess(), requireMinRole('owner'), asyncHandler(async (req, res) => {
  const link = await loadDeploymentLink(req, res);
  if (!link) return;
  if (!link.argocdAppName) return res.status(409).json({ ok: false, error: 'Aucune application Argo CD associée' });
  const { historyId } = req.body || {};
  if (historyId === undefined) return res.status(400).json({ ok: false, error: 'historyId requis' });

  if (req.pgProject) {
    const job = await jobService.enqueue(
      {
        type: 'deployment.rollback', projectId: req.pgProject.id, userId: req.user.id,
        payload: { linkId: link.id, appName: link.argocdAppName, historyId },
        idempotencyKey: `deployment.rollback:${link.id}`
      },
      async () => {
        const result = await rollbackApplication(link.argocdAppName, historyId);
        logAudit(req, 'argocd.application.rolledback', { projectId: req.legacyProject.id, linkId: link.id, appName: link.argocdAppName, historyId });
        return result;
      }
    );
    return res.status(202).json({ ok: true, job });
  }

  const result = await rollbackApplication(link.argocdAppName, historyId);
  logAudit(req, 'argocd.application.rolledback', { projectId: req.legacyProject.id, linkId: link.id, appName: link.argocdAppName, historyId });
  res.json({ ok: true, ...result });
}));

// Suivi des jobs du projet (voir services/jobService.js) : historique et
// polling de progression côté frontend pour les actions ci-dessus.
router.get('/:id/jobs', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.json({ ok: true, items: [] });
  res.json({ ok: true, items: await jobService.listJobsForProject(req.pgProject.id) });
}));

router.get('/:id/jobs/:jobId', loadProjectAccess(), asyncHandler(async (req, res) => {
  const job = await jobService.getJob(req.params.jobId);
  if (!job || !req.pgProject || job.project_id !== req.pgProject.id) {
    return res.status(404).json({ ok: false, error: 'Job introuvable pour ce projet' });
  }
  res.json({ ok: true, job });
}));

// Relance d'un job de déploiement en échec (sync/rollback) : crée un
// NOUVEAU job avec le même payload plutôt que de muter l'original (garde
// l'historique complet, y compris l'échec initial). Rejoue les mêmes gardes
// que l'action d'origine (rôle minimum par type, production réservée à
// owner) — un retry n'est jamais un raccourci pour contourner le RBAC.
// idempotencyKey dérivée du job d'origine : plusieurs clics rapides sur
// "Relancer" ne déclenchent jamais deux relances concurrentes.
router.post('/:id/jobs/:jobId/retry', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.status(409).json({ ok: false, error: 'Projet non migré vers le socle relationnel' });
  const original = await jobService.getJob(req.params.jobId);
  if (!original || original.project_id !== req.pgProject.id) return res.status(404).json({ ok: false, error: 'Job introuvable pour ce projet' });
  if (original.status !== 'failed') return res.status(409).json({ ok: false, error: 'Seul un job en échec peut être relancé' });

  if (original.type === 'deployment.sync') {
    const link = deploymentStore.getLink(original.payload.linkId);
    if (!link || link.projectId !== req.legacyProject.id) return res.status(404).json({ ok: false, error: 'Déploiement introuvable pour ce projet' });
    await guardProductionEnvironment(req, link.environmentId);
    const job = await jobService.enqueue(
      {
        type: 'deployment.sync', projectId: req.pgProject.id, userId: req.user.id,
        payload: original.payload, idempotencyKey: `deployment.sync.retry:${original.id}`, retryOf: original.id
      },
      async () => {
        const result = await syncApplication(link.argocdAppName, original.payload.revision);
        logAudit(req, 'argocd.application.synced', { projectId: req.legacyProject.id, linkId: link.id, retryOf: original.id });
        return result;
      }
    );
    return res.status(202).json({ ok: true, job });
  }

  if (original.type === 'deployment.rollback') {
    if (req.projectRole !== 'owner') return res.status(403).json({ ok: false, error: 'Rôle propriétaire requis pour relancer un rollback' });
    const link = deploymentStore.getLink(original.payload.linkId);
    if (!link || link.projectId !== req.legacyProject.id) return res.status(404).json({ ok: false, error: 'Déploiement introuvable pour ce projet' });
    await guardProductionEnvironment(req, link.environmentId);
    const job = await jobService.enqueue(
      {
        type: 'deployment.rollback', projectId: req.pgProject.id, userId: req.user.id,
        payload: original.payload, idempotencyKey: `deployment.rollback.retry:${original.id}`, retryOf: original.id
      },
      async () => {
        const result = await rollbackApplication(link.argocdAppName, original.payload.historyId);
        logAudit(req, 'argocd.application.rolledback', { projectId: req.legacyProject.id, linkId: link.id, retryOf: original.id });
        return result;
      }
    );
    return res.status(202).json({ ok: true, job });
  }

  res.status(400).json({ ok: false, error: `Type de job non re-lançable : "${original.type}"` });
}));

// Annulation coopérative (voir services/jobService.js) : même rôle minimum
// que retry — un job de projet (scaffolding, sync, rollback...) engage des
// ressources réelles, pas un simple viewer.
router.post('/:id/jobs/:jobId/cancel', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.status(409).json({ ok: false, error: 'Projet non migré vers le socle relationnel' });
  const original = await jobService.getJob(req.params.jobId);
  if (!original || original.project_id !== req.pgProject.id) return res.status(404).json({ ok: false, error: 'Job introuvable pour ce projet' });
  const cancelled = await jobService.cancelJob(req.params.jobId);
  if (!cancelled) return res.status(409).json({ ok: false, error: 'Seul un job en attente ou en cours peut être annulé' });
  logAudit(req, 'job.cancel', { jobId: cancelled.id, type: cancelled.type, projectId: req.pgProject.id });
  res.json({ ok: true, job: cancelled });
}));

// --- Incidents : suivi opérationnel (gravité, état, ressource affectée,
// résolution) — voir store/incidentStore.js. Un incident peut référencer un
// job en échec (jobId) pour garder le lien entre la cause technique et
// l'incident qui en a résulté, sans dupliquer l'information. Lecture
// ouverte à tout membre (viewer+), création à partir de developer (signaler
// un problème n'est pas une action sensible), mise à jour/résolution à
// partir de maintainer (documenter une résolution engage la fiabilité de
// l'historique).
router.get('/:id/incidents', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.json({ ok: true, items: [] });
  const status = ['open', 'investigating', 'resolved'].includes(req.query.status) ? req.query.status : undefined;
  res.json({ ok: true, items: await incidentStore.listForProject(req.pgProject.id, { status }) });
}));

router.post('/:id/incidents', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const { title, description, severity, resourceType, resourceRef, jobId, runbookUrl } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'Titre requis' });
  if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
    return res.status(400).json({ ok: false, error: 'Gravité invalide (low, medium, high, critical)' });
  }
  if (jobId) {
    const job = await jobService.getJob(jobId);
    if (!job || job.project_id !== req.pgProject.id) return res.status(400).json({ ok: false, error: 'Job introuvable pour ce projet' });
  }
  const incident = await incidentStore.create({
    projectId: req.pgProject.id, jobId, title, description, severity, resourceType, resourceRef, runbookUrl, createdBy: req.user.id
  });
  logAudit(req, 'incident.create', { projectId: req.legacyProject.id, incidentId: incident.id, severity });
  res.status(201).json({ ok: true, incident });
}));

async function loadIncident(req, res) {
  const incident = await incidentStore.getById(req.params.incidentId);
  if (!incident || !req.pgProject || incident.project_id !== req.pgProject.id) {
    res.status(404).json({ ok: false, error: 'Incident introuvable pour ce projet' });
    return null;
  }
  return incident;
}

router.get('/:id/incidents/:incidentId', loadProjectAccess(), asyncHandler(async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;
  res.json({ ok: true, incident, comments: await incidentStore.listComments(incident.id) });
}));

router.put('/:id/incidents/:incidentId', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;
  const { status, assignedTo, resolution, runbookUrl } = req.body || {};
  if (status && !['open', 'investigating', 'resolved'].includes(status)) {
    return res.status(400).json({ ok: false, error: 'État invalide' });
  }
  if (status === 'resolved' && !resolution && !incident.resolution) {
    return res.status(400).json({ ok: false, error: 'Une résolution doit être documentée pour clore un incident' });
  }
  const updated = await incidentStore.update(incident.id, { status, assignedTo, resolution, runbookUrl });
  logAudit(req, 'incident.update', { projectId: req.legacyProject.id, incidentId: incident.id, status });
  res.json({ ok: true, incident: updated });
}));

router.post('/:id/incidents/:incidentId/comments', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const incident = await loadIncident(req, res);
  if (!incident) return;
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ ok: false, error: 'Commentaire vide' });
  const comment = await incidentStore.addComment(incident.id, req.user.id, body.trim());
  await logProjectActivity(req.pgProject.id, req.user.id, 'incident.comment', { incidentId: incident.id, title: incident.title }).catch(() => {});
  res.status(201).json({ ok: true, comment });
}));

// --- Changements contrôlés : une modification planifiée, avec description,
// impact attendu, auteur, validation éventuelle et état d'exécution — voir
// store/changeStore.js. Distinct d'un incident (qui documente un problème
// déjà survenu, pas une action à venir). Proposer un changement est ouvert
// à developer+ ; l'approuver/le rejeter exige maintainer+, et owner si
// l'environnement ciblé est marqué production (même politique que la
// synchronisation de déploiement — voir guardProductionEnvironment).
router.get('/:id/changes', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.json({ ok: true, items: [] });
  const status = ['pending', 'approved', 'rejected', 'executed', 'cancelled'].includes(req.query.status) ? req.query.status : undefined;
  res.json({ ok: true, items: await changeStore.listForProject(req.pgProject.id, { status }) });
}));

router.post('/:id/changes', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const { title, description, impact, environmentId } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'Titre requis' });
  if (environmentId) {
    const environments = await orgStore.listEnvironments(req.pgProject.id);
    if (!environments.some((e) => e.id === environmentId)) return res.status(400).json({ ok: false, error: 'Environnement introuvable pour ce projet' });
  }
  const change = await changeStore.create({ projectId: req.pgProject.id, environmentId, title, description, impact, requestedBy: req.user.id });
  logAudit(req, 'change.create', { projectId: req.legacyProject.id, changeId: change.id, environmentId: environmentId || null });
  res.status(201).json({ ok: true, change });
}));

async function loadChange(req, res) {
  const change = await changeStore.getById(req.params.changeId);
  if (!change || !req.pgProject || change.project_id !== req.pgProject.id) {
    res.status(404).json({ ok: false, error: 'Changement introuvable pour ce projet' });
    return null;
  }
  return change;
}

router.put('/:id/changes/:changeId/decide', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  const change = await loadChange(req, res);
  if (!change) return;
  if (change.status !== 'pending') return res.status(409).json({ ok: false, error: 'Ce changement a déjà été décidé' });
  const { status, note } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ ok: false, error: 'Décision invalide (approved ou rejected)' });
  // Rejeter ne nécessite pas de protection supplémentaire (action sûre) ;
  // seule une approbation en production exige le rôle owner.
  if (status === 'approved') await guardProductionEnvironment(req, change.environment_id);
  const updated = await changeStore.decide(change.id, { status, decidedBy: req.user.id, decisionNote: note });
  logAudit(req, 'change.decided', { projectId: req.legacyProject.id, changeId: change.id, status });
  res.json({ ok: true, change: updated });
}));

router.post('/:id/changes/:changeId/execute', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  const change = await loadChange(req, res);
  if (!change) return;
  if (change.status !== 'approved') return res.status(409).json({ ok: false, error: "Ce changement doit être approuvé avant d'être exécuté" });
  const updated = await changeStore.markExecuted(change.id);
  logAudit(req, 'change.executed', { projectId: req.legacyProject.id, changeId: change.id });
  res.json({ ok: true, change: updated });
}));

// Fenêtre de maintenance planifiée : purement déclaratif, voir
// db/migrations/0006_maintenance_windows.sql — n'a aucun effet sur les
// autres gardes (une fenêtre active ne dispense pas de l'approbation owner
// sur un changement production).
router.get('/:id/maintenance-windows', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.json({ ok: true, items: [] });
  res.json({ ok: true, items: await maintenanceStore.listForProject(req.pgProject.id) });
}));

router.post('/:id/maintenance-windows', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.status(409).json({ ok: false, error: 'Projet non migré vers le socle relationnel' });
  const { title, description, environmentId, startsAt, endsAt } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'Titre requis' });
  const starts = new Date(startsAt);
  const ends = new Date(endsAt);
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) {
    return res.status(400).json({ ok: false, error: 'Dates de début/fin requises (ISO 8601)' });
  }
  if (ends <= starts) return res.status(400).json({ ok: false, error: 'La fin doit être après le début' });
  if (environmentId) {
    const environments = await orgStore.listEnvironments(req.pgProject.id);
    if (!environments.some((e) => e.id === environmentId)) return res.status(400).json({ ok: false, error: 'Environnement introuvable pour ce projet' });
  }
  const window = await maintenanceStore.create({
    projectId: req.pgProject.id, environmentId, title, description, startsAt: starts.toISOString(), endsAt: ends.toISOString(), createdBy: req.user.id
  });
  logAudit(req, 'maintenance_window.create', { projectId: req.legacyProject.id, windowId: window.id, startsAt: window.starts_at, endsAt: window.ends_at });
  res.status(201).json({ ok: true, window });
}));

router.post('/:id/maintenance-windows/:windowId/cancel', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!req.pgProject) return res.status(409).json({ ok: false, error: 'Projet non migré vers le socle relationnel' });
  const existing = await maintenanceStore.getById(req.params.windowId);
  if (!existing || existing.project_id !== req.pgProject.id) return res.status(404).json({ ok: false, error: 'Fenêtre de maintenance introuvable pour ce projet' });
  const window = await maintenanceStore.cancel(req.params.windowId);
  if (!window) return res.status(409).json({ ok: false, error: 'Cette fenêtre est déjà annulée' });
  logAudit(req, 'maintenance_window.cancel', { projectId: req.legacyProject.id, windowId: window.id });
  res.json({ ok: true, window });
}));

router.get('/:id/deployments/:linkId/history', loadProjectAccess(), asyncHandler(async (req, res) => {
  const link = await loadDeploymentLink(req, res);
  if (!link) return;
  if (!link.argocdAppName) return res.json({ ok: true, items: [] });
  res.json({ ok: true, items: await getApplicationHistory(link.argocdAppName) });
}));

// Chemin réseau/déploiement complet d'une application : Git → Argo CD →
// Kubernetes → reverse proxy (voir deploymentService.getPipeline, qui
// existait déjà côté global sans portée projet — routes/deployments.routes.js
// GET /:id/pipeline, conservée telle quelle pour compatibilité). Répond au
// besoin explicite du brief de partir d'un déploiement et comprendre son
// exposition réseau jusqu'au service, dans le contexte du projet plutôt que
// par un id de lien deviné.
router.get('/:id/deployments/:linkId/pipeline', loadProjectAccess(), asyncHandler(async (req, res) => {
  const link = await loadDeploymentLink(req, res);
  if (!link) return;
  res.json({ ok: true, ...(await getDeploymentPipeline(link.id)) });
}));

// --- Tâches : lecture/écriture ouverte à tout membre du projet (travail
// d'équipe), pas seulement aux administrateurs — cohérent avec le reste de la
// console où la gestion opérationnelle n'est pas réservée aux admins.
router.get('/:id/tasks', loadProjectAccess(), (req, res) => {
  res.json({ ok: true, items: store.listTasks(req.legacyProject.id) });
});

router.post('/:id/tasks', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const { title, priority, assigneeId } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'Titre requis' });
  const task = store.createTask({ projectId: req.legacyProject.id, title, priority, assigneeId });
  await logProjectActivity(req.pgProject?.id, req.user.id, 'task.create', { taskId: task.id, title: task.title }).catch(() => {});
  res.status(201).json({ ok: true, task });
}));

// Faille corrigée : ces deux routes ne vérifiaient jusqu'ici que le rôle
// sur le projet DE L'URL, jamais que la tâche visée par :taskId lui
// appartenait réellement — un développeur d'un projet A pouvait modifier
// ou supprimer une tâche de n'importe quel autre projet B en connaissant
// son id, contournant entièrement l'isolation inter-projets vérifiée par
// ailleurs sur incidents/changements/webhooks/coffre-fort.
router.put('/:id/tasks/:taskId', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const existing = store.findTask(req.params.taskId);
  if (!existing || existing.projectId !== req.legacyProject.id) return res.status(404).json({ ok: false, error: 'Tâche introuvable' });
  const task = store.updateTask(req.params.taskId, req.body || {});
  // Notifie le nouvel assigné (jamais soi-même — pas de notification pour
  // s'être assigné sa propre tâche, cf. bouton "S'assigner" côté frontend).
  const newAssignee = req.body?.assigneeId;
  if (newAssignee && newAssignee !== existing.assigneeId && newAssignee !== req.user.id) {
    notifyUser(newAssignee, {
      type: 'task.assigned', title: 'Tâche assignée',
      message: `${req.user.name || req.user.email} vous a assigné « ${task.title} »`,
      meta: { projectId: req.legacyProject.id, taskId: task.id }
    }).catch(() => {});
  }
  if (req.body?.status && req.body.status !== existing.status) {
    await logProjectActivity(req.pgProject?.id, req.user.id, 'task.status', { taskId: task.id, title: task.title, status: task.status }).catch(() => {});
  }
  res.json({ ok: true, task });
}));

router.delete('/:id/tasks/:taskId', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const existing = store.findTask(req.params.taskId);
  if (!existing || existing.projectId !== req.legacyProject.id) return res.status(404).json({ ok: false, error: 'Tâche introuvable' });
  store.deleteTask(req.params.taskId);
  res.json({ ok: true });
}));

// Résout @handle en id réel, pour notifier une mention dans un commentaire.
// `username` est optionnel (souvent absent, cf. usersStore.js createUser) :
// repli sur la partie locale de l'e-mail (avant @), qui existe toujours et
// reste le handle affiché par défaut dans l'UI (ex. "alex.lambert" pour
// alex.lambert@exemple.com). Un handle inconnu est simplement ignoré —
// jamais d'erreur pour une faute de frappe dans une mention.
function extractMentionedUserIds(text) {
  const handles = [...text.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1].toLowerCase());
  const ids = new Set();
  for (const handle of handles) {
    const byUsername = findUserByUsername(handle);
    const byEmailPrefix = byUsername ? null : listUsers().find((u) => u.email.split('@')[0].toLowerCase() === handle);
    const match = byUsername || byEmailPrefix;
    if (match) ids.add(match.id);
  }
  return [...ids];
}

router.get('/:id/tasks/:taskId/comments', loadProjectAccess(), asyncHandler(async (req, res) => {
  const existing = store.findTask(req.params.taskId);
  if (!existing || existing.projectId !== req.legacyProject.id) return res.status(404).json({ ok: false, error: 'Tâche introuvable' });
  res.json({ ok: true, items: store.listTaskComments(req.params.taskId) });
}));

router.post('/:id/tasks/:taskId/comments', loadProjectAccess(), asyncHandler(async (req, res) => {
  const existing = store.findTask(req.params.taskId);
  if (!existing || existing.projectId !== req.legacyProject.id) return res.status(404).json({ ok: false, error: 'Tâche introuvable' });
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ ok: false, error: 'Texte requis' });
  const comment = store.addTaskComment({ taskId: req.params.taskId, userId: req.user.id, text: text.trim() });

  for (const mentionedId of extractMentionedUserIds(text)) {
    if (mentionedId === req.user.id) continue; // pas de notification en se mentionnant soi-même
    notifyUser(mentionedId, {
      type: 'task.mention', title: 'Mention dans un commentaire',
      message: `${req.user.name || req.user.email} vous a mentionné dans « ${existing.title} »`,
      meta: { projectId: req.legacyProject.id, taskId: existing.id, commentId: comment.id }
    }).catch(() => {});
  }
  if (existing.assigneeId && existing.assigneeId !== req.user.id) {
    notifyUser(existing.assigneeId, {
      type: 'task.comment', title: 'Nouveau commentaire',
      message: `${req.user.name || req.user.email} a commenté « ${existing.title} »`,
      meta: { projectId: req.legacyProject.id, taskId: existing.id, commentId: comment.id }
    }).catch(() => {});
  }
  await logProjectActivity(req.pgProject?.id, req.user.id, 'task.comment', { taskId: existing.id, title: existing.title }).catch(() => {});
  res.status(201).json({ ok: true, comment });
}));

// --- Redirections du projet : raccourcis vers des services externes créés
// à la main pour ce projet précis (staging perso, tableau de bord, wiki de
// l'équipe...), distincts des raccourcis globaux d'Accès aux outils.
router.get('/:id/shortcuts', loadProjectAccess(), (req, res) => {
  res.json({ ok: true, items: shortcutsStore.listShortcuts({ projectId: req.legacyProject.id }) });
});

router.post('/:id/shortcuts', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const { label, url, category } = req.body || {};
  if (!label || !url) return res.status(400).json({ ok: false, error: 'Nom et URL requis' });
  const shortcut = shortcutsStore.createShortcut({ label, url, category, projectId: req.legacyProject.id });
  res.status(201).json({ ok: true, shortcut });
}));

router.delete('/:id/shortcuts/:shortcutId', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const shortcut = shortcutsStore.findShortcut(req.params.shortcutId);
  if (!shortcut || shortcut.projectId !== req.legacyProject.id) return res.status(404).json({ ok: false, error: 'Raccourci introuvable' });
  shortcutsStore.deleteShortcut(shortcut.id);
  res.json({ ok: true });
}));

router.post('/:id/shortcuts/:shortcutId/open', loadProjectAccess(), asyncHandler(async (req, res) => {
  const shortcut = shortcutsStore.findShortcut(req.params.shortcutId);
  if (!shortcut || shortcut.projectId !== req.legacyProject.id) return res.status(404).json({ ok: false, error: 'Raccourci introuvable' });
  res.json({ ok: true, shortcut: shortcutsStore.recordOpen(shortcut.id) });
}));

// --- Coffre-fort du projet : secrets propres à ce projet (base de données de
// staging, clé API tierce...), visibles/gérables uniquement par ses membres
// (ou un admin) — pas de triple vérification ici (ce n'est pas la production
// globale), mais la révélation exige quand même de retaper son mot de passe,
// voir vault.routes.js.
router.get('/:id/vault', loadProjectAccess(), (req, res) => {
  res.json({ ok: true, items: vaultStore.listVaultEntries('project', req.legacyProject.id) });
});

router.post('/:id/vault', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const { label, username, secret, notes, url, rotationMinutes } = req.body || {};
  if (!label || !secret) return res.status(400).json({ ok: false, error: 'Nom et secret requis' });
  const entry = vaultStore.createVaultEntry({ tier: 'project', projectId: req.legacyProject.id, label, username, secret, notes, url, rotationMinutes, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'project', projectId: req.legacyProject.id, label, rotationMinutes: entry.rotationMinutes });
  res.status(201).json({ ok: true, entry });
}));

// --- Documentation (Docusaurus) / Design System (Storybook) ---
// Enregistrement manuel des liens tant que la création automatisée de
// repository (compte GitHub de plateforme) n'est pas branchée — voir
// 0031_project_doc_sites.sql. Nécessite le socle relationnel (les liens
// sont rattachés au projet relationnel, pas au projet legacy JSON).
router.get('/:id/doc-sites', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [], migrated: false });
  res.json({ ok: true, items: await orgStore.listDocSites(req.pgProject.id), migrated: true });
}));

// --- ADR (Architecture Decision Records) ---
router.get('/:id/adrs', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [], migrated: false });
  res.json({ ok: true, items: await orgStore.listAdrs(req.pgProject.id), migrated: true });
}));

router.post('/:id/adrs', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: 'Projet non migré vers le socle relationnel' });
  const { title, status, content } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ ok: false, error: 'title requis' });
  const adr = await orgStore.createAdr(req.pgProject.id, { title: title.trim(), status, content, userId: req.user.id });
  logAudit(req, 'project.adr.create', { projectId: req.legacyProject.id, adrId: adr.id, number: adr.number });
  await logProjectActivity(req.pgProject.id, req.user.id, 'adr.create', { adrId: adr.id, number: adr.number, title: adr.title }).catch(() => {});
  res.status(201).json({ ok: true, adr });
}));

router.put('/:id/adrs/:adrId', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: 'Projet non migré vers le socle relationnel' });
  const existing = await orgStore.getAdr(req.params.adrId);
  if (!existing || existing.project_id !== req.pgProject.id) return res.status(404).json({ ok: false, error: 'ADR introuvable' });
  const { title, status, content } = req.body || {};
  const adr = await orgStore.updateAdr(req.params.adrId, { title, status, content, userId: req.user.id });
  logAudit(req, 'project.adr.update', { projectId: req.legacyProject.id, adrId: adr.id });
  res.json({ ok: true, adr });
}));

router.get('/:id/adrs/:adrId/revisions', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [] });
  const existing = await orgStore.getAdr(req.params.adrId);
  if (!existing || existing.project_id !== req.pgProject.id) return res.status(404).json({ ok: false, error: 'ADR introuvable' });
  res.json({ ok: true, items: await orgStore.listAdrRevisions(req.params.adrId) });
}));

router.put('/:id/doc-sites/:kind', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: 'Projet non migré vers le socle relationnel' });
  const { kind } = req.params;
  if (!['docusaurus', 'storybook'].includes(kind)) return res.status(400).json({ ok: false, error: 'Type inconnu (docusaurus ou storybook)' });
  const { url, repoUrl, branch, lastCommit, lastPublishedAt, status } = req.body || {};
  const site = await orgStore.upsertDocSite(req.pgProject.id, kind, { url, repoUrl, branch, lastCommit, lastPublishedAt, status, userId: req.user.id });
  logAudit(req, 'project.docSite.update', { projectId: req.legacyProject.id, kind, url });
  await logProjectActivity(req.pgProject.id, req.user.id, 'docSite.update', { kind, url }).catch(() => {});
  res.json({ ok: true, site });
}));

// Activité d'équipe (todo.md items 28/31) : lecture ouverte à tout membre
// du projet — même portée que le reste de la fiche projet.
router.get('/:id/activity', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [] });
  res.json({ ok: true, items: await listProjectActivity(req.pgProject.id, Number(req.query.limit) || 50) });
}));

// Présence (todo.md item 3) : ping léger + lecture, réservés aux membres
// du projet comme le reste de la fiche (loadProjectAccess()).
router.post('/:id/presence', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true });
  await presence.ping(req.pgProject.id, req.user.id);
  res.json({ ok: true });
}));

router.get('/:id/presence', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [] });
  res.json({ ok: true, items: await presence.listPresence(req.pgProject.id) });
}));

function slugify(name) {
  return String(name).toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'projet';
}

export default router;
