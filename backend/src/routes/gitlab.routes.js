import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import { enableGitlabToGithubMirror, listMirrors } from '../services/gitMirrorService.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await gitlab.getStatus() })));
router.get('/projects', asyncHandler(async (req, res) => res.json({ ok: true, items: await gitlab.listProjects() })));
router.get('/projects/:id/pipelines', asyncHandler(async (req, res) => res.json({ ok: true, items: await gitlab.listPipelines(req.params.id) })));
router.get('/projects/:id/merge-requests', asyncHandler(async (req, res) => res.json({ ok: true, items: await gitlab.listMergeRequests(req.params.id) })));
// La relance de pipeline et l'approbation de MR ne vivent plus ici : elles
// dupliquaient, sans aucune vérification de portée, ce que fournissent déjà
// routes/pipelines.routes.js (vue globale) et routes/projects.routes.js
// (POST /:id/workspace/pipelines/:runKey/retry et .../reviews/:reviewKey/approve,
// scopés au projet et au rôle). Ces deux routes n'étaient plus appelées par
// le frontend — retirées plutôt que protégées, pour ne pas garder deux
// chemins concurrents vers la même action.

router.get('/projects/:id/mirrors', requireRole('admin'), asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await listMirrors(req.params.id) });
}));

router.post('/projects/:id/mirror-to-github', requireRole('admin'), asyncHandler(async (req, res) => {
  const { githubRepoName } = req.body || {};
  if (!githubRepoName) return res.status(400).json({ ok: false, error: 'Nom du dépôt GitHub de sauvegarde requis' });
  const result = await enableGitlabToGithubMirror(req.params.id, githubRepoName);
  logAudit(req, 'git.mirror.enabled', { projectId: req.params.id, githubRepo: result.githubRepo });
  res.status(201).json(result);
}));

export default router;
