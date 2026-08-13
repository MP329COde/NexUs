import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import * as github from '../services/integrations/githubService.js';

const router = Router();
router.use(requireAuth);

const GITLAB_STATUS = { success: 'success', failed: 'failed', running: 'running', pending: 'running', canceled: 'cancelled', skipped: 'cancelled' };
function normalizeGitlab(p, repoName) {
  const durationSeconds = p.duration ?? (p.updatedAt && p.createdAt && ['success', 'failed', 'canceled'].includes(p.status) ? Math.max(0, Math.round((new Date(p.updatedAt) - new Date(p.createdAt)) / 1000)) : null);
  return {
    id: `gitlab-${p.id}`, provider: 'gitlab', repo: repoName, branch: p.ref,
    status: GITLAB_STATUS[p.status] || 'other', durationSeconds,
    createdAt: p.createdAt, webUrl: p.webUrl, trigger: 'push'
  };
}
function normalizeGithub(r, repoName) {
  const status = r.status === 'completed'
    ? (r.conclusion === 'success' ? 'success' : r.conclusion === 'cancelled' ? 'cancelled' : 'failed')
    : 'running';
  const durationSeconds = r.updatedAt && r.createdAt && status !== 'running' ? Math.max(0, Math.round((new Date(r.updatedAt) - new Date(r.createdAt)) / 1000)) : null;
  return {
    id: `github-${r.id}`, provider: 'github', repo: repoName, branch: r.branch,
    status, durationSeconds, createdAt: r.createdAt, webUrl: r.webUrl, trigger: 'push'
  };
}

// Agrège les exécutions récentes GitLab (pipelines) et GitHub (workflow runs)
// de tous les dépôts accessibles, normalisées dans un format commun. Aucune
// exécution n'est inventée : liste vide si ni GitLab ni GitHub configurés.
router.get('/runs', asyncHandler(async (req, res) => {
  const runs = [];

  try {
    const projects = (await gitlab.listProjects()).slice(0, 12);
    const perProject = await Promise.allSettled(projects.map((p) => gitlab.listPipelines(p.id)));
    perProject.forEach((r, i) => {
      if (r.status === 'fulfilled') runs.push(...r.value.map((p) => normalizeGitlab(p, projects[i].path)));
    });
  } catch { /* GitLab non configuré */ }

  try {
    const repos = (await github.listRepos()).slice(0, 12);
    const perRepo = await Promise.allSettled(repos.map((r) => github.listWorkflowRuns(r.fullName.split('/')[0], r.name)));
    perRepo.forEach((res_, i) => {
      if (res_.status === 'fulfilled') runs.push(...res_.value.map((r) => normalizeGithub(r, repos[i].fullName)));
    });
  } catch { /* GitHub non configuré */ }

  runs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, items: runs });
}));

export default router;
