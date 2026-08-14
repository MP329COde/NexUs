import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

function client() {
  const cfg = getRawIntegration('github');
  if (!cfg.token) return null;
  return {
    http: buildClient('https://api.github.com', { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } }),
    cfg
  };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('GitHub');
  const user = await request(c.http, { method: 'GET', url: '/user' }, 'GitHub');
  return { configured: true, ok: true, message: `Connecté en tant que ${user.login}` };
}

export async function getAuthenticatedUser() {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const user = await request(c.http, { method: 'GET', url: '/user' }, 'GitHub');
  return { login: user.login };
}

// Utilisé par le miroir automatique GitLab → GitHub (services/gitMirrorService.js) :
// crée le dépôt de sauvegarde s'il n'existe pas encore. 422 = existe déjà,
// toléré (idempotent) plutôt que remonté comme une erreur.
export async function createRepo(name, { private: isPrivate = true, description } = {}) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  try {
    const repo = await request(c.http, { method: 'POST', url: '/user/repos', data: { name, private: isPrivate, description, auto_init: false } }, 'GitHub');
    return { created: true, fullName: repo.full_name, cloneUrl: repo.clone_url };
  } catch (err) {
    if (err.status === 502 && /422/.test(err.message)) {
      const user = await getAuthenticatedUser();
      return { created: false, fullName: `${user.login}/${name}`, cloneUrl: `https://github.com/${user.login}/${name}.git` };
    }
    throw err;
  }
}

export async function listRepos() {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/user/repos', params: { per_page: 50, sort: 'pushed' } }, 'GitHub');
  return data.map((r) => ({ id: r.id, name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private, webUrl: r.html_url, pushedAt: r.pushed_at }));
}

export async function listWorkflowRuns(owner, repo) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/repos/${owner}/${repo}/actions/runs`, params: { per_page: 20 } }, 'GitHub');
  return (data.workflow_runs || []).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    conclusion: r.conclusion,
    branch: r.head_branch,
    sha: r.head_sha?.slice(0, 8),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    webUrl: r.html_url
  }));
}

export async function listPullRequests(owner, repo) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/repos/${owner}/${repo}/pulls`, params: { state: 'open', per_page: 20 } }, 'GitHub');
  return data.map((p) => ({ number: p.number, title: p.title, sourceBranch: p.head?.ref, targetBranch: p.base?.ref, author: p.user?.login, webUrl: p.html_url, createdAt: p.created_at }));
}

// Revue de code approuvée directement depuis la console, sans quitter
// l'interface — équivaut à cliquer "Approve" dans l'UI GitHub.
export async function approvePullRequest(owner, repo, number, body) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  await request(c.http, {
    method: 'POST',
    url: `/repos/${owner}/${repo}/pulls/${number}/reviews`,
    data: { event: 'APPROVE', body: body || 'Approuvé depuis Nexus Console' }
  }, 'GitHub');
  return { ok: true, message: `Pull request #${number} approuvée` };
}

export async function rerunWorkflow(owner, repo, runId) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  await request(c.http, { method: 'POST', url: `/repos/${owner}/${repo}/actions/runs/${runId}/rerun` }, 'GitHub');
  return { ok: true, message: `Workflow ${runId} relancé` };
}

// --- Explorateur de manifests (mêmes fonctions que gitlabService.js, API
// GitHub Contents/Git) pour le workflow GitOps éditer → valider → diff →
// committer → MR → CI → Argo CD.

export async function listTree(owner, repo, path = '', ref) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/repos/${owner}/${repo}/contents/${path}`, params: ref ? { ref } : {} }, 'GitHub');
  const items = Array.isArray(data) ? data : [data];
  return items.map((f) => ({ path: f.path, name: f.name, type: f.type === 'dir' ? 'dir' : 'file' }));
}

export async function getFileContent(owner, repo, path, ref) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/repos/${owner}/${repo}/contents/${path}`, params: ref ? { ref } : {} }, 'GitHub');
  return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha, ref: ref || null };
}

export async function createBranch(owner, repo, branch, fromRef) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const base = await request(c.http, { method: 'GET', url: `/repos/${owner}/${repo}/git/ref/heads/${fromRef}` }, 'GitHub');
  await request(c.http, { method: 'POST', url: `/repos/${owner}/${repo}/git/refs`, data: { ref: `refs/heads/${branch}`, sha: base.object.sha } }, 'GitHub');
  return { ok: true };
}

export async function commitFile(owner, repo, branch, path, content, message, sha) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  await request(c.http, {
    method: 'PUT', url: `/repos/${owner}/${repo}/contents/${path}`,
    data: { message, content: Buffer.from(content, 'utf8').toString('base64'), branch, sha }
  }, 'GitHub');
  return { ok: true };
}

export async function createPullRequest(owner, repo, sourceBranch, targetBranch, title) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const pr = await request(c.http, { method: 'POST', url: `/repos/${owner}/${repo}/pulls`, data: { head: sourceBranch, base: targetBranch, title } }, 'GitHub');
  return { number: pr.number, webUrl: pr.html_url };
}
