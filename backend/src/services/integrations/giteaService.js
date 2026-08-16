import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

// API Gitea (https://docs.gitea.com/api/1.20/), auth par token applicatif.
// Périmètre volontairement limité à la lecture + approbation de PR (aligné
// sur ce que consomment repos.routes.js et reviews.routes.js) : contrairement
// à GitLab/GitHub, l'éditeur de manifests GitOps (arborescence/commit/PR
// création) n'est pas branché ici — pas de valeur réelle démontrée sans un
// vrai dépôt Gitea de test, à ajouter si le besoin se confirme.
function client() {
  const cfg = getRawIntegration('gitea');
  if (!cfg.baseUrl || !cfg.token) return null;
  return {
    http: buildClient(cfg.baseUrl.replace(/\/$/, ''), { headers: { Authorization: `token ${cfg.token}` } }),
    cfg
  };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('Gitea');
  const user = await request(c.http, { method: 'GET', url: '/api/v1/user' }, 'Gitea');
  return { configured: true, ok: true, message: `Connecté en tant que ${user.login}` };
}

export async function listRepos() {
  const c = client();
  if (!c) throw new IntegrationError('Gitea non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/api/v1/user/repos', params: { limit: 50 } }, 'Gitea');
  return data.map((r) => ({
    id: r.id, name: r.name, fullName: r.full_name, defaultBranch: r.default_branch,
    private: r.private, webUrl: r.html_url, pushedAt: r.updated_at
  }));
}

export async function listBranches(owner, repo) {
  const c = client();
  if (!c) throw new IntegrationError('Gitea non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/api/v1/repos/${owner}/${repo}/branches`, params: { limit: 50 } }, 'Gitea');
  return data.map((b) => ({ name: b.name, protected: b.protected, commitSha: b.commit?.id?.slice(0, 8) }));
}

export async function listCommits(owner, repo, sha) {
  const c = client();
  if (!c) throw new IntegrationError('Gitea non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/api/v1/repos/${owner}/${repo}/commits`, params: sha ? { sha, limit: 20 } : { limit: 20 } }, 'Gitea');
  return data.map((cm) => ({ sha: cm.sha?.slice(0, 8), message: cm.commit?.message?.split('\n')[0], author: cm.commit?.author?.name, date: cm.commit?.author?.date, webUrl: cm.html_url }));
}

export async function listPullRequests(owner, repo) {
  const c = client();
  if (!c) throw new IntegrationError('Gitea non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/api/v1/repos/${owner}/${repo}/pulls`, params: { state: 'open', limit: 20 } }, 'Gitea');
  return data.map((p) => ({ number: p.number, title: p.title, sourceBranch: p.head?.ref, targetBranch: p.base?.ref, author: p.user?.login, webUrl: p.html_url, createdAt: p.created_at }));
}

// Gitea n'a pas de notion native d'« approbation » distincte de la revue :
// POST /pulls/{index}/reviews avec event=APPROVED est l'équivalent direct.
export async function approvePullRequest(owner, repo, number, body) {
  const c = client();
  if (!c) throw new IntegrationError('Gitea non configuré', { status: 409 });
  await request(c.http, {
    method: 'POST',
    url: `/api/v1/repos/${owner}/${repo}/pulls/${number}/reviews`,
    data: { event: 'APPROVED', body: body || 'Approuvé depuis Nexus Console' }
  }, 'Gitea');
  return { ok: true, message: `Pull request #${number} approuvée` };
}
