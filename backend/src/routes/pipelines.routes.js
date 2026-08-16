import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import * as github from '../services/integrations/githubService.js';
import { normalizePipelineRun } from '../services/pipelineNormalizer.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

// Agrège les exécutions récentes GitLab (pipelines) et GitHub (workflow runs)
// de tous les dépôts accessibles, normalisées dans un format commun. Aucune
// exécution n'est inventée : liste vide si ni GitLab ni GitHub configurés.
router.get('/runs', asyncHandler(async (req, res) => {
  const runs = [];

  try {
    const projects = (await gitlab.listProjects()).slice(0, 12);
    const perProject = await Promise.allSettled(projects.map((p) => gitlab.listPipelines(p.id)));
    perProject.forEach((r, i) => {
      if (r.status === 'fulfilled') runs.push(...r.value.map((p) => normalizePipelineRun('gitlab', p, projects[i].path, projects[i].id)));
    });
  } catch { /* GitLab non configuré */ }

  try {
    const repos = (await github.listRepos()).slice(0, 12);
    const perRepo = await Promise.allSettled(repos.map((r) => github.listWorkflowRuns(r.fullName.split('/')[0], r.name)));
    perRepo.forEach((res_, i) => {
      const [owner, repo] = repos[i].fullName.split('/');
      if (res_.status === 'fulfilled') runs.push(...res_.value.map((r) => normalizePipelineRun('github', r, repos[i].fullName, owner, repo)));
    });
  } catch { /* GitHub non configuré */ }

  runs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ ok: true, items: runs });
}));

// Faille corrigée : cette vue globale (tous dépôts confondus) ne vérifiait
// jusqu'ici que requireAuth alors même que le commentaire de la route
// scopée équivalente (routes/projects.routes.js
// POST /:id/workspace/pipelines/:runKey/retry) déclarait déjà cette vue
// "réservée aux admins pour l'usage transverse" — l'intention documentée
// n'était jamais appliquée : n'importe quel compte authentifié pouvait
// relancer un pipeline sur n'importe quel dépôt de la plateforme.
// Relance une exécution en échec/annulée directement sur la forge d'origine
// (proxy vers l'API réelle GitLab/GitHub, pas de réexécution simulée).
router.post('/runs/:id/retry', requireRole('admin'), asyncHandler(async (req, res) => {
  const key = decodeURIComponent(req.params.id);
  const [provider, ...rest] = key.split(':');
  if (provider === 'gitlab') {
    const [projectId, pipelineId] = rest;
    const result = await gitlab.retryPipeline(projectId, pipelineId);
    logAudit(req, 'pipeline.retried', { provider, projectId, pipelineId });
    return res.json({ ok: true, result });
  }
  if (provider === 'github') {
    const repoFull = rest.slice(0, -1).join(':');
    const runId = rest[rest.length - 1];
    const [owner, repo] = repoFull.split('/');
    const result = await github.rerunWorkflow(owner, repo, runId);
    logAudit(req, 'pipeline.retried', { provider, owner, repo, runId });
    return res.json({ ok: true, result });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

// Détail jobs/étapes d'une exécution — GitHub Actions uniquement (GitLab
// expose déjà ce niveau de détail directement dans son interface, moins
// pertinent à dupliquer ici vu l'absence d'API équivalente simple).
router.get('/runs/:id/jobs', asyncHandler(async (req, res) => {
  const key = decodeURIComponent(req.params.id);
  const [provider, ...rest] = key.split(':');
  if (provider !== 'github') return res.status(400).json({ ok: false, error: 'Détail des jobs disponible pour GitHub Actions uniquement' });
  const repoFull = rest.slice(0, -1).join(':');
  const runId = rest[rest.length - 1];
  const [owner, repo] = repoFull.split('/');
  const jobs = await github.listWorkflowRunJobs(owner, repo, runId);
  res.json({ ok: true, items: jobs });
}));

export default router;
