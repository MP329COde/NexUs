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
    webUrl: r.html_url
  }));
}

export async function listPullRequests(owner, repo) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/repos/${owner}/${repo}/pulls`, params: { state: 'open', per_page: 20 } }, 'GitHub');
  return data.map((p) => ({ number: p.number, title: p.title, sourceBranch: p.head?.ref, targetBranch: p.base?.ref, author: p.user?.login, webUrl: p.html_url }));
}

export async function rerunWorkflow(owner, repo, runId) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub non configuré', { status: 409 });
  await request(c.http, { method: 'POST', url: `/repos/${owner}/${repo}/actions/runs/${runId}/rerun` }, 'GitHub');
  return { ok: true, message: `Workflow ${runId} relancé` };
}
