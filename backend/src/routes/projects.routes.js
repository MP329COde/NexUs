import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { loadProjectAccess, requireMinRole } from '../middleware/projectAccess.js';
import * as store from '../store/projectsStore.js';
import * as shortcutsStore from '../store/shortcutsStore.js';
import * as vaultStore from '../store/vaultStore.js';
import * as orgStore from '../store/orgStore.js';
import { pool } from '../db/pool.js';
import { logAudit } from '../services/auditService.js';
import { buildProjectWorkspace } from '../services/projectWorkspaceService.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import * as github from '../services/integrations/githubService.js';

const router = Router();
router.use(requireAuth);

// Visibilité : un administrateur voit tous les projets. Un compte Utilisateur
// ne voit que les projets dont il est membre — c'est la restriction demandée
// ("une personne qui ne travaille que sur un projet ne doit voir que
// celui-ci"). Appliquée ici, pas seulement côté frontend : /projects/:id
// refuse (404, volontairement pas 403 pour ne pas confirmer l'existence du
// projet) l'accès à un projet dont on n'est pas membre. Le rôle exact
// (viewer/developer/maintainer/owner) n'est disponible que pour les projets
// déjà migrés vers le socle relationnel (voir middleware/projectAccess.js) ;
// pour les autres, la liste utilise encore memberIds.
router.get('/', (req, res) => {
  const items = store.listProjects().filter((p) => req.user.role === 'admin' || store.isMember(p, req.user.id));
  res.json({ ok: true, items });
});

router.get('/:id', loadProjectAccess(), (req, res) => {
  res.json({ ok: true, project: req.legacyProject, role: req.projectRole });
});

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, description, tags, memberIds, repoKeys } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Nom requis' });
  const project = store.createProject({ name, description, tags, memberIds, repoKeys });
  // Provisionne aussi le projet dans le socle relationnel quand Postgres est
  // disponible, avec les mêmes membres en rôle "maintainer" par défaut
  // (ajustable ensuite via PUT /:id/members/:userId) et deux environnements
  // (production, staging) créés automatiquement.
  if (pool) {
    try {
      const orgs = await orgStore.listOrganizationsForUser(req.user.id);
      let org = orgs[0];
      if (!org) org = await orgStore.createOrganization({ name: 'Organisation par défaut', slug: 'default', ownerUserId: req.user.id });
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
  const project = store.updateProject(req.params.id, req.body || {});
  logAudit(req, 'project.update', { projectId: project.id });
  res.json({ ok: true, project });
}));

router.delete('/:id', loadProjectAccess(), requireMinRole('owner'), asyncHandler(async (req, res) => {
  store.deleteProject(req.params.id);
  logAudit(req, 'project.delete', { projectId: req.params.id });
  res.json({ ok: true });
}));

// --- Membres et rôles (socle relationnel uniquement) ---
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

// --- Environnements (socle relationnel uniquement) ---
router.get('/:id/environments', loadProjectAccess(), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.json({ ok: true, items: [], migrated: false });
  res.json({ ok: true, items: await orgStore.listEnvironments(req.pgProject.id), migrated: true });
}));

router.post('/:id/environments', loadProjectAccess(), requireMinRole('maintainer'), asyncHandler(async (req, res) => {
  if (!pool || !req.pgProject) return res.status(409).json({ ok: false, error: "Projet non migré vers le socle relationnel" });
  const { name, kind, isProduction } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Nom requis' });
  const environment = await orgStore.createEnvironment(req.pgProject.id, { name, kind, isProduction });
  logAudit(req, 'project.environment.create', { projectId: req.legacyProject.id, name });
  res.status(201).json({ ok: true, environment });
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
  res.status(201).json({ ok: true, task });
}));

router.put('/:id/tasks/:taskId', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  const task = store.updateTask(req.params.taskId, req.body || {});
  if (!task) return res.status(404).json({ ok: false, error: 'Tâche introuvable' });
  res.json({ ok: true, task });
}));

router.delete('/:id/tasks/:taskId', loadProjectAccess(), requireMinRole('developer'), asyncHandler(async (req, res) => {
  store.deleteTask(req.params.taskId);
  res.json({ ok: true });
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
  const { label, username, secret, notes, url } = req.body || {};
  if (!label || !secret) return res.status(400).json({ ok: false, error: 'Nom et secret requis' });
  const entry = vaultStore.createVaultEntry({ tier: 'project', projectId: req.legacyProject.id, label, username, secret, notes, url, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'project', projectId: req.legacyProject.id, label });
  res.status(201).json({ ok: true, entry });
}));

function slugify(name) {
  return String(name).toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'projet';
}

export default router;
