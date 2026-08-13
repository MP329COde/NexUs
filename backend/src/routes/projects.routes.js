import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as store from '../store/projectsStore.js';
import * as shortcutsStore from '../store/shortcutsStore.js';
import * as vaultStore from '../store/vaultStore.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

// Visibilité : un administrateur voit tous les projets. Un compte Utilisateur
// ne voit que les projets dont il est membre — c'est la restriction demandée
// ("une personne qui ne travaille que sur un projet ne doit voir que celui-ci").
// Appliquée ici, pas seulement côté frontend : /projects/:id refuse (404,
// volontairement pas 403 pour ne pas confirmer l'existence du projet) l'accès
// à un projet dont on n'est pas membre.
function visible(project, user) {
  return user.role === 'admin' || store.isMember(project, user.id);
}

router.get('/', (req, res) => {
  const items = store.listProjects().filter((p) => visible(p, req.user));
  res.json({ ok: true, items });
});

router.get('/:id', (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  res.json({ ok: true, project });
});

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const { name, description, tags, memberIds, repoKeys } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Nom requis' });
  const project = store.createProject({ name, description, tags, memberIds, repoKeys });
  logAudit(req, 'project.create', { projectId: project.id, name: project.name });
  res.status(201).json({ ok: true, project });
}));

router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const project = store.updateProject(req.params.id, req.body || {});
  if (!project) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  logAudit(req, 'project.update', { projectId: project.id });
  res.json({ ok: true, project });
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  if (!store.deleteProject(req.params.id)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  logAudit(req, 'project.delete', { projectId: req.params.id });
  res.json({ ok: true });
}));

// --- Tâches : lecture/écriture ouverte à tout membre du projet (travail
// d'équipe), pas seulement aux administrateurs — cohérent avec le reste de la
// console où la gestion opérationnelle n'est pas réservée aux admins.
router.get('/:id/tasks', (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  res.json({ ok: true, items: store.listTasks(project.id) });
});

router.post('/:id/tasks', asyncHandler(async (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  const { title, priority, assigneeId } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'Titre requis' });
  const task = store.createTask({ projectId: project.id, title, priority, assigneeId });
  res.status(201).json({ ok: true, task });
}));

router.put('/:id/tasks/:taskId', asyncHandler(async (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  const task = store.updateTask(req.params.taskId, req.body || {});
  if (!task) return res.status(404).json({ ok: false, error: 'Tâche introuvable' });
  res.json({ ok: true, task });
}));

router.delete('/:id/tasks/:taskId', asyncHandler(async (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  store.deleteTask(req.params.taskId);
  res.json({ ok: true });
}));

// --- Redirections du projet : raccourcis vers des services externes créés
// à la main pour ce projet précis (staging perso, tableau de bord, wiki de
// l'équipe...), distincts des raccourcis globaux d'Accès aux outils.
router.get('/:id/shortcuts', (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  res.json({ ok: true, items: shortcutsStore.listShortcuts({ projectId: project.id }) });
});

router.post('/:id/shortcuts', asyncHandler(async (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  const { label, url, category } = req.body || {};
  if (!label || !url) return res.status(400).json({ ok: false, error: 'Nom et URL requis' });
  const shortcut = shortcutsStore.createShortcut({ label, url, category, projectId: project.id });
  res.status(201).json({ ok: true, shortcut });
}));

router.delete('/:id/shortcuts/:shortcutId', asyncHandler(async (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  const shortcut = shortcutsStore.findShortcut(req.params.shortcutId);
  if (!shortcut || shortcut.projectId !== project.id) return res.status(404).json({ ok: false, error: 'Raccourci introuvable' });
  shortcutsStore.deleteShortcut(shortcut.id);
  res.json({ ok: true });
}));

router.post('/:id/shortcuts/:shortcutId/open', asyncHandler(async (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  const shortcut = shortcutsStore.findShortcut(req.params.shortcutId);
  if (!shortcut || shortcut.projectId !== project.id) return res.status(404).json({ ok: false, error: 'Raccourci introuvable' });
  res.json({ ok: true, shortcut: shortcutsStore.recordOpen(shortcut.id) });
}));

// --- Coffre-fort du projet : secrets propres à ce projet (base de données de
// staging, clé API tierce...), visibles/gérables uniquement par ses membres
// (ou un admin) — pas de triple vérification ici (ce n'est pas la production
// globale), mais la révélation exige quand même de retaper son mot de passe,
// voir vault.routes.js.
router.get('/:id/vault', (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  res.json({ ok: true, items: vaultStore.listVaultEntries('project', project.id) });
});

router.post('/:id/vault', asyncHandler(async (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project || !visible(project, req.user)) return res.status(404).json({ ok: false, error: 'Projet introuvable' });
  const { label, username, secret, notes } = req.body || {};
  if (!label || !secret) return res.status(400).json({ ok: false, error: 'Nom et secret requis' });
  const entry = vaultStore.createVaultEntry({ tier: 'project', projectId: project.id, label, username, secret, notes, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'project', projectId: project.id, label });
  res.status(201).json({ ok: true, entry });
}));

export default router;
