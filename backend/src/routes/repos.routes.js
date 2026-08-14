import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import * as github from '../services/integrations/githubService.js';
import * as meta from '../store/repoMetaStore.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

// Liste unifiée des dépôts réels (GitLab + GitHub, selon ce qui est
// configuré), enrichie des étiquettes/rôle posés manuellement (repoMetaStore).
// Ne fabrique aucun dépôt : si aucune forge n'est configurée, la liste est vide.
router.get('/', asyncHandler(async (req, res) => {
  const items = [];
  try {
    const projects = await gitlab.listProjects();
    for (const p of projects) {
      const key = `gitlab:${p.id}`;
      const m = meta.getRepoMeta(key);
      items.push({
        key, provider: 'gitlab', id: p.id, name: p.name, path: p.path, defaultBranch: p.defaultBranch,
        visibility: p.visibility || 'private', webUrl: p.webUrl, lastActivity: p.lastActivity,
        role: m?.role || null, tags: m?.tags || []
      });
    }
  } catch { /* GitLab non configuré */ }
  try {
    const repos = await github.listRepos();
    for (const r of repos) {
      const key = `github:${r.fullName}`;
      const m = meta.getRepoMeta(key);
      items.push({
        key, provider: 'github', id: r.id, name: r.name, path: r.fullName, defaultBranch: r.defaultBranch,
        visibility: r.private ? 'private' : 'public', webUrl: r.webUrl, lastActivity: r.pushedAt,
        role: m?.role || null, tags: m?.tags || []
      });
    }
  } catch { /* GitHub non configuré */ }
  res.json({ ok: true, items });
}));

// :key est le champ "key" renvoyé par GET / (ex. "gitlab:42",
// "github:org%2Frepo"), toujours encodé côté client via encodeURIComponent.
router.put('/meta/:key', asyncHandler(async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  const entry = meta.setRepoMeta(key, req.body || {});
  res.json({ ok: true, meta: entry });
}));

// --- Explorateur de manifests : arborescence, lecture de fichier, et
// workflow complet éditer → commit → merge/pull request, pour les deux
// forges derrière la même interface "key" que le reste de ce fichier.
function parseKey(key) {
  const [provider, ...rest] = decodeURIComponent(key).split(':');
  return { provider, id: rest.join(':') };
}

router.get('/:key/tree', asyncHandler(async (req, res) => {
  const { provider, id } = parseKey(req.params.key);
  const path = req.query.path || '';
  const ref = req.query.ref || undefined;
  if (provider === 'gitlab') return res.json({ ok: true, items: await gitlab.listTree(id, path, ref) });
  if (provider === 'github') {
    const [owner, repo] = id.split('/');
    return res.json({ ok: true, items: await github.listTree(owner, repo, path, ref) });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

router.get('/:key/file', asyncHandler(async (req, res) => {
  const { provider, id } = parseKey(req.params.key);
  const path = req.query.path;
  if (!path) return res.status(400).json({ ok: false, error: 'path requis' });
  const ref = req.query.ref || undefined;
  if (provider === 'gitlab') return res.json({ ok: true, file: await gitlab.getFileContent(id, path, ref) });
  if (provider === 'github') {
    const [owner, repo] = id.split('/');
    return res.json({ ok: true, file: await github.getFileContent(owner, repo, path, ref) });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

// Workflow GitOps complet : crée une branche depuis baseBranch, y committe le
// nouveau contenu du fichier, ouvre une MR/PR vers baseBranch. Un seul appel
// pour rester atomique côté UI (pas d'état intermédiaire "branche créée mais
// pas de MR" si l'utilisateur ferme la popup entre deux étapes).
router.post('/:key/propose-change', asyncHandler(async (req, res) => {
  const { provider, id } = parseKey(req.params.key);
  const { path, content, baseBranch, sha, message, title } = req.body || {};
  if (!path || content === undefined || !baseBranch) return res.status(400).json({ ok: false, error: 'path, content et baseBranch requis' });
  const branch = `nexus/manifest-${Date.now()}`;
  const commitMessage = message || `Modifie ${path} depuis Nexus Console`;
  const prTitle = title || commitMessage;

  if (provider === 'gitlab') {
    await gitlab.createBranch(id, branch, baseBranch);
    await gitlab.commitFile(id, branch, path, content, commitMessage);
    const mr = await gitlab.createMergeRequest(id, branch, baseBranch, prTitle);
    logAudit(req, 'manifest.change.proposed', { provider, repo: id, path, branch, mrIid: mr.iid });
    return res.status(201).json({ ok: true, branch, mergeRequest: mr });
  }
  if (provider === 'github') {
    const [owner, repo] = id.split('/');
    await github.createBranch(owner, repo, branch, baseBranch);
    await github.commitFile(owner, repo, branch, path, content, commitMessage, sha);
    const pr = await github.createPullRequest(owner, repo, branch, baseBranch, prTitle);
    logAudit(req, 'manifest.change.proposed', { provider, repo: id, path, branch, prNumber: pr.number });
    return res.status(201).json({ ok: true, branch, mergeRequest: { iid: pr.number, webUrl: pr.webUrl } });
  }
  res.status(400).json({ ok: false, error: 'Fournisseur inconnu' });
}));

export default router;
