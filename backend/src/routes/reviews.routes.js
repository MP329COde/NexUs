import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import * as github from '../services/integrations/githubService.js';
import * as reviewStore from '../store/reviewStore.js';
import { listUsers } from '../store/usersStore.js';

const router = Router();
router.use(requireAuth);

function withAssignment(item) {
  const a = reviewStore.getAssignment(item.key);
  return { ...item, reviewerIds: a?.reviewerIds || [] };
}

// Liste unifiée des demandes de fusion/pull requests ouvertes (GitLab +
// GitHub), enrichie de l'assignation locale de relecteurs. Vide si aucune
// forge n'est configurée.
router.get('/', asyncHandler(async (req, res) => {
  const items = [];
  try {
    const projects = (await gitlab.listProjects()).slice(0, 20);
    const perProject = await Promise.allSettled(projects.map((p) => gitlab.listMergeRequests(p.id)));
    perProject.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      for (const m of r.value) {
        items.push(withAssignment({
          key: `gitlab:${projects[i].id}:${m.iid}`, provider: 'gitlab', projectId: projects[i].id, iid: m.iid,
          repo: projects[i].path, title: m.title, sourceBranch: m.sourceBranch, targetBranch: m.targetBranch,
          author: m.author, webUrl: m.webUrl, createdAt: m.createdAt
        }));
      }
    });
  } catch { /* GitLab non configuré */ }

  try {
    const repos = (await github.listRepos()).slice(0, 20);
    const perRepo = await Promise.allSettled(repos.map((r) => github.listPullRequests(r.fullName.split('/')[0], r.name)));
    perRepo.forEach((res_, i) => {
      if (res_.status !== 'fulfilled') return;
      for (const p of res_.value) {
        items.push(withAssignment({
          key: `github:${repos[i].fullName}:${p.number}`, provider: 'github', owner: repos[i].fullName.split('/')[0], repoName: repos[i].name, number: p.number,
          repo: repos[i].fullName, title: p.title, sourceBranch: p.sourceBranch, targetBranch: p.targetBranch,
          author: p.author, webUrl: p.webUrl, createdAt: p.createdAt
        }));
      }
    });
  } catch { /* GitHub non configuré */ }

  const users = listUsers();
  const reviewerNames = Object.fromEntries(users.map((u) => [u.id, u.name]));
  res.json({ ok: true, items, reviewerNames });
}));

router.post('/:key/assign', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  res.json({ ok: true, assignment: reviewStore.assign(key, req.user.id) });
});

router.post('/:key/unassign', (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const userId = req.body?.userId || req.user.id;
  res.json({ ok: true, assignment: reviewStore.unassign(key, userId) });
});

// Approuve directement sur la forge d'origine (proxy vers l'API réelle) : si
// l'auto-approbation est bloquée côté GitLab/GitHub, l'erreur remontée par
// l'API est renvoyée telle quelle, pas masquée.
router.post('/:key/approve', asyncHandler(async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const [provider, ...rest] = key.split(':');
  if (provider === 'gitlab') {
    const [projectId, iid] = rest;
    const result = await gitlab.approveMergeRequest(projectId, iid);
    return res.json({ ok: true, result });
  }
  if (provider === 'github') {
    const repo = rest.slice(0, -1).join(':');
    const number = rest[rest.length - 1];
    const [owner, repoName] = repo.split('/');
    const result = await github.approvePullRequest(owner, repoName, number);
    return res.json({ ok: true, result });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

export default router;
