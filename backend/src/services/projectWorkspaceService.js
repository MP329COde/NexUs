import * as gitlab from './integrations/gitlabService.js';
import * as github from './integrations/githubService.js';
import { normalizePipelineRun } from './pipelineNormalizer.js';

// Agrège, pour un projet Nexus donné, l'état réel de ses dépôts liés
// (project.repoKeys, au format `${provider}:${identifiant}` — voir
// store/projectsStore.js) : branches, derniers commits, MR/PR ouvertes,
// dernières exécutions CI. Un dépôt inaccessible (forge non configurée,
// token invalide, dépôt supprimé) n'interrompt jamais les autres — son
// erreur est renvoyée dans `error` au lieu de faire échouer tout
// l'espace de travail (Promise.allSettled).
export async function buildProjectWorkspace(repoKeys) {
  const results = await Promise.allSettled((repoKeys || []).map((key) => loadRepoWorkspace(key)));
  return results.map((r, i) => (
    r.status === 'fulfilled' ? r.value : { key: repoKeys[i], error: r.reason?.message || 'Dépôt inaccessible' }
  ));
}

async function loadRepoWorkspace(key) {
  const [provider, ...rest] = key.split(':');
  const id = rest.join(':');

  if (provider === 'gitlab') {
    const project = await gitlab.getProject(id);
    const [branches, commits, mergeRequests, pipelines] = await Promise.all([
      gitlab.listBranches(id).catch(() => []),
      gitlab.listCommits(id, project.defaultBranch).catch(() => []),
      gitlab.listMergeRequests(id).catch(() => []),
      gitlab.listPipelines(id).catch(() => [])
    ]);
    return {
      key, provider, id, name: project.path, defaultBranch: project.defaultBranch, webUrl: project.webUrl,
      branches, commits,
      mergeRequests: mergeRequests.map((m) => ({ id: m.iid, title: m.title, sourceBranch: m.sourceBranch, targetBranch: m.targetBranch, author: m.author, webUrl: m.webUrl, createdAt: m.createdAt })),
      pipelines: pipelines.slice(0, 10).map((p) => normalizePipelineRun('gitlab', p, project.path, id))
    };
  }

  if (provider === 'github') {
    const [owner, repo] = id.split('/');
    const project = await github.getRepo(owner, repo);
    const [branches, commits, pullRequests, runs] = await Promise.all([
      github.listBranches(owner, repo).catch(() => []),
      github.listCommits(owner, repo, project.defaultBranch).catch(() => []),
      github.listPullRequests(owner, repo).catch(() => []),
      github.listWorkflowRuns(owner, repo).catch(() => [])
    ]);
    return {
      key, provider, id, name: project.fullName, defaultBranch: project.defaultBranch, webUrl: project.webUrl,
      branches, commits,
      mergeRequests: pullRequests.map((p) => ({ id: p.number, title: p.title, sourceBranch: p.sourceBranch, targetBranch: p.targetBranch, author: p.author, webUrl: p.webUrl, createdAt: p.createdAt })),
      pipelines: runs.slice(0, 10).map((r) => normalizePipelineRun('github', r, project.fullName, owner, repo))
    };
  }

  throw new Error(`Fournisseur de dépôt inconnu : ${provider}`);
}
