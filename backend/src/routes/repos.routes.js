import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as gitlab from '../services/integrations/gitlabService.js';
import * as github from '../services/integrations/githubService.js';
import * as meta from '../store/repoMetaStore.js';

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

export default router;
