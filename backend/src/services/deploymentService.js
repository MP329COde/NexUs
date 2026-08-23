import * as store from '../store/deploymentStore.js';
import * as gitlab from './integrations/gitlabService.js';
import * as github from './integrations/githubService.js';
import * as argocd from './integrations/argocdService.js';
import * as kubernetes from './integrations/kubernetesService.js';
import { getProxy } from '../store/proxyStore.js';
import { getRawIntegration } from '../store/settingsStore.js';

export function list() {
  return store.listLinks();
}

export function create(payload) {
  if (!payload.name) {
    const err = new Error('Le nom de l\'application est requis');
    err.status = 400;
    throw err;
  }
  return store.createLink(payload);
}

export function update(id, payload) {
  const updated = store.updateLink(id, payload);
  if (!updated) throw notFound(id);
  return updated;
}

export function remove(id) {
  if (!store.deleteLink(id)) throw notFound(id);
  return { ok: true };
}

// Reconstitue, pour une application, l'état de chaque étape du workflow
// développement → Git → CI/CD → Argo CD → Kubernetes → reverse proxy.
// Chaque étape est résolue indépendamment: l'absence/échec d'une intégration
// ne doit pas empêcher d'afficher les autres. webUrl permet au frontend
// d'ouvrir directement le bon outil (GitLab/GitHub, Argo CD) sans dupliquer
// la logique de construction d'URL côté client.
export async function getPipeline(id) {
  const link = store.getLink(id);
  if (!link) throw notFound(id);
  const isGithub = link.gitProvider === 'github';

  const [pipelines, application, deployments, proxy] = await Promise.all([
    safe(() => (isGithub
      ? (link.githubOwner && link.githubRepo ? github.listWorkflowRuns(link.githubOwner, link.githubRepo) : null)
      : (link.gitlabProjectId ? gitlab.listPipelines(link.gitlabProjectId) : null))),
    safe(() => (link.argocdAppName ? argocd.getApplication(link.argocdAppName) : null)),
    safe(() => (link.k8sNamespace ? kubernetes.listDeployments(link.k8sNamespace) : null)),
    safe(() => (link.proxyId ? getProxy(link.proxyId) : null))
  ]);

  const deployment = deployments.value?.find((d) => d.name === link.k8sDeployment) ?? null;
  const gitConfigured = isGithub ? Boolean(link.githubOwner && link.githubRepo) : Boolean(link.gitlabProjectId);
  const latest = pipelines.value?.[0] || null;
  const argocdCfg = getRawIntegration('argocd');
  const k8sCfg = getRawIntegration('kubernetes');

  // webUrl doit être une adresse joignable depuis le NAVIGATEUR de l'admin,
  // pas depuis le backend NexUs. Pour les outils "vraiment externes" (GitHub/
  // GitLab), `webUrl` est déjà une URL publique fournie telle quelle par leur
  // API. Pour les outils internes (Argo CD, Kubernetes), l'URL configurée
  // (`baseUrl`/`apiServer`) est celle utilisée par le backend pour APPELER
  // l'API — souvent une IP privée / DNS interne / VPN, jamais pensée pour
  // être ouverte dans un navigateur externe. C'est la cause identifiée du
  // bug "impossible d'accéder depuis une redirection" (Lot C3) : le frontend
  // réutilisait tel quel `argocdCfg.baseUrl` comme lien cliquable. On préfère
  // désormais un champ `publicUrl`/`dashboardUrl` distinct, dédié au lien
  // navigateur, quand l'admin l'a renseigné — sinon on retombe sur l'URL API
  // (comportement historique, inchangé si non configuré différemment).
  const argocdWebBase = argocdCfg.publicUrl || argocdCfg.baseUrl;
  const k8sDashboardBase = k8sCfg.dashboardUrl || null;

  return {
    link,
    stages: {
      git: {
        configured: gitConfigured,
        provider: link.gitProvider,
        latestPipeline: isGithub
          ? (latest ? { id: latest.id, ref: latest.branch, status: latest.conclusion || latest.status, sha: latest.sha, createdAt: latest.createdAt, webUrl: latest.webUrl } : null)
          : latest,
        error: pipelines.error
      },
      argocd: {
        configured: Boolean(link.argocdAppName),
        syncStatus: application.value?.status?.sync?.status,
        healthStatus: application.value?.status?.health?.status,
        webUrl: link.argocdAppName && argocdWebBase ? `${argocdWebBase.replace(/\/$/, '')}/applications/${link.argocdAppName}` : null,
        error: application.error
      },
      kubernetes: {
        configured: Boolean(link.k8sNamespace && link.k8sDeployment),
        deployment,
        // Absent tant qu'aucune `dashboardUrl` n'est configurée : NexUs n'a
        // aucune URL de tableau de bord Kubernetes à proposer par défaut
        // (l'URL du serveur API n'en est pas une — voir commentaire ci-dessus).
        webUrl: k8sDashboardBase && link.k8sNamespace ? `${k8sDashboardBase.replace(/\/$/, '')}/#/workloads?namespace=${encodeURIComponent(link.k8sNamespace)}` : null,
        error: deployments.error
      },
      proxy: { configured: Boolean(link.proxyId), proxy: proxy.value, error: proxy.error }
    }
  };
}

async function safe(fn) {
  try {
    const value = await fn();
    return { value, error: null };
  } catch (err) {
    return { value: null, error: err.message };
  }
}

function notFound(id) {
  const err = new Error(`Application introuvable: ${id}`);
  err.status = 404;
  return err;
}
