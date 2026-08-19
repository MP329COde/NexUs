// Format commun pour une exécution CI, qu'elle vienne d'un pipeline GitLab
// ou d'un workflow run GitHub Actions — partagé entre routes/pipelines.routes.js
// (vue globale, tous dépôts) et services/projectWorkspaceService.js (vue par
// projet, dépôts liés uniquement) pour ne jamais faire diverger les deux.
const GITLAB_STATUS = { success: 'success', failed: 'failed', running: 'running', pending: 'running', canceled: 'cancelled', skipped: 'cancelled' };

export function normalizePipelineRun(provider, run, repoName, a, b) {
  if (provider === 'gitlab') {
    const projectId = a;
    const durationSeconds = run.duration ?? (run.updatedAt && run.createdAt && ['success', 'failed', 'canceled'].includes(run.status)
      ? Math.max(0, Math.round((new Date(run.updatedAt) - new Date(run.createdAt)) / 1000)) : null);
    const status = GITLAB_STATUS[run.status] || 'other';
    return {
      id: `gitlab:${projectId}:${run.id}`, provider: 'gitlab', repo: repoName, branch: run.ref,
      sha: run.sha || null, author: run.author || null, pullRequestNumber: null,
      status, durationSeconds, createdAt: run.createdAt, webUrl: run.webUrl, trigger: 'push',
      retryable: ['failed', 'cancelled'].includes(status), jobsSupported: true
    };
  }
  if (provider === 'github') {
    const owner = a;
    const repo = b;
    const status = run.status === 'completed'
      ? (run.conclusion === 'success' ? 'success' : run.conclusion === 'cancelled' ? 'cancelled' : 'failed')
      : 'running';
    const durationSeconds = run.updatedAt && run.createdAt && status !== 'running'
      ? Math.max(0, Math.round((new Date(run.updatedAt) - new Date(run.createdAt)) / 1000)) : null;
    return {
      id: `github:${owner}/${repo}:${run.id}`, provider: 'github', repo: repoName, branch: run.branch,
      sha: run.sha || null, author: run.author || null, pullRequestNumber: run.pullRequestNumber || null,
      status, durationSeconds, createdAt: run.createdAt, webUrl: run.webUrl, trigger: 'push',
      retryable: status === 'failed', jobsSupported: true
    };
  }
  throw new Error(`Fournisseur de pipeline inconnu : ${provider}`);
}
