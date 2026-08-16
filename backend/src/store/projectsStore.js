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

export function createProject({ name, description, tags, memberIds, repoKeys }) {
  const projects = listProjects();
  const project = {
    id: uuid(),
    name,
    description: description || '',
    status: 'active',
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
  projects[idx] = { ...projects[idx], ...payload };
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

export function createTask({ projectId, title, priority, assigneeId }) {
  const tasks = readStore('tasks') || [];
  const task = {
    id: uuid(),
    projectId,
    title,
    status: 'todo', // todo | in_progress | review | done
    priority: priority || 'normal', // low | normal | high
    assigneeId: assigneeId || null,
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

export function deleteTask(id) {
  const tasks = readStore('tasks') || [];
  const next = tasks.filter((t) => t.id !== id);
  writeStore('tasks', next);
  return next.length !== tasks.length;
}
