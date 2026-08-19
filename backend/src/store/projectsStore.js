import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Un projet regroupe des dépôts, une équipe (memberIds) et un backlog de
// tâches. La visibilité (qui peut lister/voir un projet) est appliquée dans
// projects.routes.js : un compte non-admin ne voit que les projets dont il
// est membre — c'est la seule vraie restriction d'accès de tout ce module.
export function listProjects() {
  return readStore('projects');
}

export function getProject(id) {
  return listProjects().find((p) => p.id === id);
}

// Palette tournante par ordre de création — même logique que les avatars
// utilisateur (usersStore.js AVATAR_COLORS), pour que chaque nouveau projet
// ait une couleur par défaut distincte sans que l'utilisateur ait à en
// choisir une s'il ne s'en soucie pas.
const PROJECT_COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899'];

export function createProject({ name, description, tags, memberIds, repoKeys, icon, color }) {
  const projects = listProjects();
  const project = {
    id: uuid(),
    name,
    description: description || '',
    status: 'active',
    icon: icon || null, // emoji — null affiche l'icône dossier générique (voir frontend Icon.jsx)
    color: color || PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
    tags: Array.isArray(tags) ? tags : [],
    memberIds: Array.isArray(memberIds) ? memberIds : [],
    repoKeys: Array.isArray(repoKeys) ? repoKeys : [], // `${provider}:${identifiant}` — voir repoMetaStore.js
    createdAt: new Date().toISOString()
  };
  projects.push(project);
  writeStore('projects', projects);
  return project;
}

export function updateProject(id, payload) {
  const projects = listProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  // Les appelants (routes/projects.routes.js) déstructurent req.body avec un
  // allowlist explicite puis passent l'objet tel quel : un champ absent du
  // corps de la requête devient `undefined`, pas simplement "non fourni".
  // Un spread naïf ({...existant, ...payload}) écrase alors silencieusement
  // ce champ (repoKeys, memberIds...) à `undefined` pour toute mise à jour
  // partielle (ex: changer uniquement le statut) — trouvé en testant
  // réellement le nouveau sélecteur de statut du projet, qui a fait
  // disparaître repoKeys et fait planter la fiche projet (`.length` sur
  // undefined). Ne fusionner que les valeurs réellement fournies.
  const defined = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
  projects[idx] = { ...projects[idx], ...defined };
  writeStore('projects', projects);
  return projects[idx];
}

export function deleteProject(id) {
  const projects = listProjects();
  const next = projects.filter((p) => p.id !== id);
  writeStore('projects', next);
  const remainingTasks = (readStore('tasks') || []).filter((t) => t.projectId !== id);
  writeStore('tasks', remainingTasks);
  return next.length !== projects.length;
}

export function isMember(project, userId) {
  return project.memberIds.includes(userId);
}

// Mot de passe de coffre-fort propre au projet : verrou supplémentaire pour
// révéler ses secrets (tier 'project'), distinct du mot de passe du compte
// utilisateur — "entourer un mot de passe du projet pour accéder à ses mots
// de passe". Optionnel : tant qu'il n'est pas défini, la révélation retombe
// sur l'ancien comportement (mot de passe du compte, voir vault.routes.js).
// Le hash ne doit jamais quitter le store tel quel — projectAccess.js le
// retire de req.legacyProject avant toute réponse HTTP.
export function setProjectVaultPassword(id, passwordHash) {
  const projects = listProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  projects[idx].vaultPasswordHash = passwordHash;
  writeStore('projects', projects);
  return projects[idx];
}

export function clearProjectVaultPassword(id) {
  const projects = listProjects();
  const idx = projects.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  projects[idx].vaultPasswordHash = null;
  writeStore('projects', projects);
  return projects[idx];
}

// --- Tâches (backlog) ---

export function listTasks(projectId) {
  return (readStore('tasks') || []).filter((t) => t.projectId === projectId);
}

export function findTask(id) {
  return (readStore('tasks') || []).find((t) => t.id === id);
}

// Toutes les tâches assignées à un utilisateur, tous projets confondus —
// pour la page "Mon travail" (routes/projects.routes.js GET /mine/tasks).
// L'appelant doit encore filtrer aux seuls projets accessibles à
// l'utilisateur (listMyProjects) avant d'exposer le résultat : cette
// fonction ne fait aucune vérification d'accès elle-même.
export function listTasksAssignedTo(userId) {
  return (readStore('tasks') || []).filter((t) => t.assigneeId === userId);
}

export function createTask({ projectId, title, priority, assigneeId }) {
  const tasks = readStore('tasks') || [];
  const task = {
    id: uuid(),
    projectId,
    title,
    status: 'todo', // todo | in_progress | review | done
    priority: priority || 'normal', // low | normal | high
    assigneeId: assigneeId || null,
    // Task → Code (todo.md items 25/48/50) : liens déclarés manuellement
    // vers la branche/PR qui réalise cette tâche — aucune détection
    // automatique (nécessiterait de parser les messages de commit d'une
    // forge configurée), enregistrement honnête comme les liens
    // Docusaurus/Storybook (Lot 6).
    branch: '',
    prUrl: '',
    createdAt: new Date().toISOString()
  };
  tasks.push(task);
  writeStore('tasks', tasks);
  return task;
}

export function updateTask(id, payload) {
  const tasks = readStore('tasks') || [];
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  // id/projectId jamais modifiables par le payload client : un PUT contenant
  // {"projectId": "..."} ne doit jamais pouvoir déplacer une tâche vers un
  // autre projet en contournant la vérification d'appartenance faite par
  // l'appelant (routes/projects.routes.js).
  const { id: _id, projectId: _projectId, ...safePayload } = payload;
  tasks[idx] = { ...tasks[idx], ...safePayload };
  writeStore('tasks', tasks);
  return tasks[idx];
}

// Commentaires sur une tâche — stockés à part (comme les révisions wiki)
// plutôt que dans le tableau `tasks` lui-même, pour ne jamais réécrire tout
// l'historique des commentaires à chaque mise à jour de statut de la tâche.
export function listTaskComments(taskId) {
  return (readStore('taskComments') || []).filter((c) => c.taskId === taskId);
}

export function addTaskComment({ taskId, userId, text }) {
  const comments = readStore('taskComments') || [];
  const comment = { id: uuid(), taskId, userId, text, createdAt: new Date().toISOString() };
  comments.push(comment);
  writeStore('taskComments', comments);
  return comment;
}

export function deleteTask(id) {
  const tasks = readStore('tasks') || [];
  const next = tasks.filter((t) => t.id !== id);
  writeStore('tasks', next);
  const comments = readStore('taskComments') || [];
  writeStore('taskComments', comments.filter((c) => c.taskId !== id));
  return next.length !== tasks.length;
}
