import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

function client() {
  const cfg = getRawIntegration('gitlab');
  if (!cfg.baseUrl) return null;
  return { http: buildClient(`${cfg.baseUrl.replace(/\/$/, '')}/api/v4`, { headers: { 'PRIVATE-TOKEN': cfg.token || '' } }), cfg };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('GitLab');
  const user = await request(c.http, { method: 'GET', url: '/user' }, 'GitLab');
  return { configured: true, ok: true, message: `Connecté en tant que ${user.username}` };
}

export async function listProjects() {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/projects', params: { membership: true, per_page: 50, order_by: 'last_activity_at' } }, 'GitLab');
  return data.map((p) => ({ id: p.id, name: p.name, path: p.path_with_namespace, defaultBranch: p.default_branch, webUrl: p.web_url, lastActivity: p.last_activity_at }));
}

export async function listPipelines(projectId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/pipelines`, params: { per_page: 20 } }, 'GitLab');
  return data.map((p) => ({ id: p.id, ref: p.ref, status: p.status, sha: p.sha?.slice(0, 8), createdAt: p.created_at, webUrl: p.web_url }));
}

export async function listMergeRequests(projectId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/merge_requests`, params: { state: 'opened', per_page: 20 } }, 'GitLab');
  return data.map((m) => ({ iid: m.iid, title: m.title, sourceBranch: m.source_branch, targetBranch: m.target_branch, author: m.author?.username, webUrl: m.web_url }));
}

// Miroir de sauvegarde (push mirror natif GitLab) : GitLab pousse lui-même
// vers l'URL distante à intervalle régulier, on n'a pas à gérer le git
// push nous-mêmes. Utilisé par le miroir automatique GitLab → GitHub
// (services/gitMirrorService.js).
export async function listRemoteMirrors(projectId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/remote_mirrors` }, 'GitLab');
  return data.map((m) => ({ id: m.id, url: m.safe_url || m.url, enabled: m.enabled, lastUpdateAt: m.last_update_at, lastError: m.last_error }));
}

export async function createRemoteMirror(projectId, url) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const m = await request(c.http, { method: 'POST', url: `/projects/${projectId}/remote_mirrors`, data: { url, enabled: true } }, 'GitLab');
  return { id: m.id, url: m.safe_url || m.url, enabled: m.enabled };
}

export async function retryPipeline(projectId, pipelineId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  await request(c.http, { method: 'POST', url: `/projects/${projectId}/pipelines/${pipelineId}/retry` }, 'GitLab');
  return { ok: true, message: `Pipeline ${pipelineId} relancé` };
}
