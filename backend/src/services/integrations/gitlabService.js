import { getRawIntegration } from '../../store/settingsStore.js';
import { revealPersonalToken } from '../../store/personalGitTokensStore.js';
import { buildClient, request, notConfigured, IntegrationError, buildHttpsAgentFromConfig } from './httpClient.js';

function client() {
  const cfg = getRawIntegration('gitlab');
  if (!cfg.baseUrl) return null;
  return { http: buildClient(`${cfg.baseUrl.replace(/\/$/, '')}/api/v4`, { headers: { 'PRIVATE-TOKEN': cfg.token || '' }, httpsAgent: buildHttpsAgentFromConfig(cfg) }), cfg };
}

// Résolution "au nom de l'utilisateur" : pour les actions qui représentent un
// geste personnel (approuver une revue, committer...), on préfère le token
// GitLab personnel de l'utilisateur connecté (store/personalGitTokensStore.js,
// géré depuis sa page Compte) — GitLab l'attribue alors correctement à SON
// compte plutôt qu'au compte de service partagé de la plateforme. Repli
// silencieux sur le client d'instance existant si l'utilisateur n'a pas
// renseigné de token personnel, pour ne rien casser des usages actuels.
// Base minimale (Lot A6 du plan) : seule l'URL d'instance de la plateforme
// est réutilisée, l'utilisateur n'a que le token à fournir — le Lot B2
// (vault multi-niveaux) pourra étendre ceci si un utilisateur a besoin
// d'une instance GitLab différente de celle de la plateforme.
function clientForUser(userId) {
  const personalToken = userId ? revealPersonalToken(userId, 'gitlab') : null;
  if (!personalToken) return client();
  const cfg = getRawIntegration('gitlab');
  if (!cfg.baseUrl) return null;
  return { http: buildClient(`${cfg.baseUrl.replace(/\/$/, '')}/api/v4`, { headers: { 'PRIVATE-TOKEN': personalToken }, httpsAgent: buildHttpsAgentFromConfig(cfg) }), cfg, personal: true };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('GitLab');
  const user = await request(c.http, { method: 'GET', url: '/user' }, 'GitLab');
  return { configured: true, ok: true, message: `Connecté en tant que ${user.username}`, baseUrl: c.cfg.baseUrl };
}

// Exposé pour repositoryProvisioningService.js.
export function getClient() {
  return client();
}

// Provisioning réel (Priorité 1) : initialize_with_readme crée directement
// une branche par défaut + README, condition préalable aux protections de
// branche et webhooks ci-dessous (comportement analogue à auto_init côté
// GitHub). 400 "has already been taken" = idempotent, on relit le projet.
export async function createProject(name, { visibility = 'private', description, namespaceId } = {}) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  try {
    const p = await request(c.http, {
      method: 'POST', url: '/projects',
      data: { name, path: name, visibility, description, initialize_with_readme: true, namespace_id: namespaceId || undefined }
    }, 'GitLab');
    return { created: true, id: p.id, path: p.path_with_namespace, webUrl: p.web_url, cloneUrl: p.http_url_to_repo, defaultBranch: p.default_branch || 'main' };
  } catch (err) {
    if (err.status === 502 && /has already been taken/i.test(err.message)) {
      const data = await request(c.http, { method: 'GET', url: '/projects', params: { search: name, membership: true } }, 'GitLab');
      const p = data.find((x) => x.path === name);
      if (!p) throw err;
      return { created: false, id: p.id, path: p.path_with_namespace, webUrl: p.web_url, cloneUrl: p.http_url_to_repo, defaultBranch: p.default_branch || 'main' };
    }
    throw err;
  }
}

// Protection de branche par défaut : seuls maintainers peuvent merger/push
// directement — équivalent GitLab de protectDefaultBranch() côté GitHub.
export async function protectBranch(projectId, branch) {
  const cl = client();
  await request(cl.http, {
    method: 'POST', url: `/projects/${projectId}/protected_branches`,
    data: { name: branch, push_access_level: 40, merge_access_level: 40, allow_force_push: false }
  }, 'GitLab').catch((err) => { if (!/already protected|404/i.test(err.message)) throw err; });
}

export async function createLabels(projectId, labels) {
  const cl = client();
  for (const label of labels) {
    await request(cl.http, { method: 'POST', url: `/projects/${projectId}/labels`, data: label }, 'GitLab')
      .catch((err) => { if (!/already exists|400/.test(err.message)) throw err; });
  }
}

// Variables CI GitLab (non masquées — même portée que createCiVariables()
// côté GitHub : valeurs de configuration, pas des secrets).
export async function createCiVariables(projectId, variables = {}) {
  const cl = client();
  for (const [key, value] of Object.entries(variables)) {
    await request(cl.http, {
      method: 'POST', url: `/projects/${projectId}/variables`, data: { key, value: String(value) }
    }, 'GitLab').catch((err) => { if (!/already exists|400/.test(err.message)) throw err; });
  }
}

export async function createWebhook(projectId, webhookUrl, secret) {
  if (!webhookUrl) return null;
  const cl = client();
  return request(cl.http, {
    method: 'POST', url: `/projects/${projectId}/hooks`,
    data: { url: webhookUrl, token: secret, push_events: true, merge_requests_events: true }
  }, 'GitLab');
}

export async function listProjects() {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/projects', params: { membership: true, per_page: 50, order_by: 'last_activity_at' } }, 'GitLab');
  return data.map((p) => ({ id: p.id, name: p.name, path: p.path_with_namespace, defaultBranch: p.default_branch, webUrl: p.web_url, lastActivity: p.last_activity_at, visibility: p.visibility }));
}

// Lecture directe d'un projet par id, sans balayer listProjects() en entier —
// utilisé par l'espace de travail projet (routes/projects.routes.js) qui ne
// connaît que les repoKeys attachés au projet Nexus, pas la liste complète.
export async function getProject(projectId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const p = await request(c.http, { method: 'GET', url: `/projects/${projectId}` }, 'GitLab');
  return { id: p.id, name: p.name, path: p.path_with_namespace, defaultBranch: p.default_branch, webUrl: p.web_url, lastActivity: p.last_activity_at };
}

export async function listPipelines(projectId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/pipelines`, params: { per_page: 20 } }, 'GitLab');
  return data.map((p) => ({ id: p.id, ref: p.ref, status: p.status, sha: p.sha?.slice(0, 8), author: p.user?.username || null, createdAt: p.created_at, updatedAt: p.updated_at, duration: p.duration ?? null, webUrl: p.web_url }));
}

// Détail par job d'un pipeline — équivalent GitLab de
// githubService.listWorkflowRunJobs(). L'API GitLab n'expose pas de niveau
// "step" séparé du job (contrairement à GitHub Actions) : un job GitLab EST
// déjà l'unité la plus fine, ses logs bruts restent sur la page GitLab
// native (webUrl), pas de viewer de logs dupliqué ici.
export async function listPipelineJobs(projectId, pipelineId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/pipelines/${pipelineId}/jobs`, params: { per_page: 50 } }, 'GitLab');
  return data.map((j) => ({
    id: j.id,
    name: j.name,
    stage: j.stage,
    status: j.status,
    startedAt: j.started_at,
    completedAt: j.finished_at,
    webUrl: j.web_url,
    steps: []
  }));
}

export async function listBranches(projectId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/repository/branches`, params: { per_page: 50 } }, 'GitLab');
  return data.map((b) => ({ name: b.name, default: b.default, protected: b.protected, commitSha: b.commit?.short_id, commitDate: b.commit?.committed_date, webUrl: b.web_url }));
}

export async function listCommits(projectId, ref) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/repository/commits`, params: { ref_name: ref, per_page: 20 } }, 'GitLab');
  return data.map((cm) => ({ sha: cm.short_id, message: cm.title, author: cm.author_name, date: cm.committed_date, webUrl: cm.web_url }));
}

export async function listMergeRequests(projectId) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/merge_requests`, params: { state: 'opened', per_page: 20 } }, 'GitLab');
  return data.map((m) => ({ iid: m.iid, title: m.title, sourceBranch: m.source_branch, targetBranch: m.target_branch, author: m.author?.username, webUrl: m.web_url, createdAt: m.created_at }));
}

// Revue de code approuvée directement depuis la console — équivaut à
// cliquer "Approve" dans l'UI GitLab. Nécessite que les approbations soient
// activées sur le projet (fonctionnalité GitLab Premium/Ultimate côté
// serveur) ; sinon l'API répond 404, remonté tel quel par request().
// userId optionnel : si fourni et que cet utilisateur a un token GitLab
// personnel, l'approbation est faite avec SON identité GitLab plutôt qu'avec
// le compte de service de la plateforme (voir clientForUser ci-dessus).
export async function approveMergeRequest(projectId, iid, userId) {
  const c = clientForUser(userId);
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  await request(c.http, { method: 'POST', url: `/projects/${projectId}/merge_requests/${iid}/approve` }, 'GitLab');
  return { ok: true, message: `Merge request !${iid} approuvée`, asPersonalAccount: c.personal === true };
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

// --- Explorateur de manifests : arborescence, lecture/écriture de fichier,
// branche et merge request, pour le workflow GitOps (éditer → valider →
// diff → committer → MR → CI → Argo CD).

export async function listTree(projectId, path = '', ref) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/repository/tree`, params: { path, ref, per_page: 100 } }, 'GitLab');
  return data.map((f) => ({ path: f.path, name: f.name, type: f.type === 'tree' ? 'dir' : 'file' }));
}

export async function getFileContent(projectId, filePath, ref) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/projects/${projectId}/repository/files/${encodeURIComponent(filePath)}`, params: { ref } }, 'GitLab');
  return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.blob_id, ref: data.ref };
}

export async function createBranch(projectId, branch, ref) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  await request(c.http, { method: 'POST', url: `/projects/${projectId}/repository/branches`, params: { branch, ref } }, 'GitLab');
  return { ok: true };
}

export async function commitFile(projectId, branch, filePath, content, commitMessage) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  await request(c.http, {
    method: 'POST', url: `/projects/${projectId}/repository/commits`,
    data: { branch, commit_message: commitMessage, actions: [{ action: 'update', file_path: filePath, content }] }
  }, 'GitLab');
  return { ok: true };
}

export async function createMergeRequest(projectId, sourceBranch, targetBranch, title) {
  const c = client();
  if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
  const mr = await request(c.http, {
    method: 'POST', url: `/projects/${projectId}/merge_requests`,
    data: { source_branch: sourceBranch, target_branch: targetBranch, title }
  }, 'GitLab');
  return { iid: mr.iid, webUrl: mr.web_url };
}
