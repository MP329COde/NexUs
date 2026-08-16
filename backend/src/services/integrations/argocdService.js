import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

function client() {
  const cfg = getRawIntegration('argocd');
  if (!cfg.baseUrl) return null;
  return { http: buildClient(cfg.baseUrl, { headers: { Authorization: cfg.token ? `Bearer ${cfg.token}` : undefined } }), cfg };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('Argo CD');
  const data = await request(c.http, { method: 'GET', url: '/api/v1/applications' }, 'Argo CD');
  return { configured: true, ok: true, message: `${data.items?.length ?? 0} applications suivies`, baseUrl: c.cfg.baseUrl };
}

export async function listApplications() {
  const c = client();
  if (!c) throw new IntegrationError('Argo CD non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/api/v1/applications' }, 'Argo CD');
  return (data.items || []).map((app) => ({
    name: app.metadata.name,
    project: app.spec.project,
    repo: app.spec.source?.repoURL,
    path: app.spec.source?.path,
    targetRevision: app.spec.source?.targetRevision,
    destinationNamespace: app.spec.destination?.namespace,
    syncStatus: app.status?.sync?.status,
    healthStatus: app.status?.health?.status,
    revision: app.status?.sync?.revision?.slice(0, 7)
  }));
}

export async function getApplication(name) {
  const c = client();
  if (!c) throw new IntegrationError('Argo CD non configuré', { status: 409 });
  return request(c.http, { method: 'GET', url: `/api/v1/applications/${encodeURIComponent(name)}` }, 'Argo CD');
}

export async function syncApplication(name, revision) {
  const c = client();
  if (!c) throw new IntegrationError('Argo CD non configuré', { status: 409 });
  const data = revision ? { revision } : {};
  await request(c.http, { method: 'POST', url: `/api/v1/applications/${encodeURIComponent(name)}/sync`, data }, 'Argo CD');
  return { ok: true, message: revision ? `Synchronisation vers ${revision.slice(0, 7)} déclenchée pour ${name}` : `Synchronisation déclenchée pour ${name}` };
}

// L'historique de déploiement (status.history) est ce que syncApplication a
// déjà appliqué avec succès par le passé — utilisé pour proposer un retour
// arrière réel (pas une simple resynchronisation de l'état courant).
export async function getApplicationHistory(name) {
  const app = await getApplication(name);
  return (app.status?.history || []).map((h) => ({
    id: h.id,
    revision: h.revision,
    deployedAt: h.deployedAt,
    source: h.source
  })).reverse();
}

// Argo CD calcule déjà lui-même l'écart entre l'état voulu (Git) et l'état
// réel (cluster) pour chaque ressource qu'il gère — managed-resources expose
// ce calcul directement, on n'a pas besoin de le refaire. targetState = ce
// que Git déclare ; liveState = ce qui tourne réellement.
export async function getManagedResourcesDiff(name) {
  const c = client();
  if (!c) throw new IntegrationError('Argo CD non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/api/v1/applications/${encodeURIComponent(name)}/managed-resources` }, 'Argo CD');
  return (data.items || []).map((r) => ({
    kind: r.kind, name: r.name, namespace: r.namespace,
    outOfSync: Boolean(r.diff) || r.hook === false && r.targetState !== r.normalizedLiveState,
    targetState: r.targetState ? JSON.parse(r.targetState) : null,
    liveState: r.normalizedLiveState ? JSON.parse(r.normalizedLiveState) : null
  }));
}

// Crée ou met à jour (upsert=true côté API Argo CD) l'Application elle-même
// depuis Nexus : une fois Argo CD connecté, l'admin ne devrait plus avoir à
// la créer/reconfigurer manuellement dans l'interface Argo CD — la console
// reste la seule source de vérité (voir base-dev/developement item 15).
// Sync automatisée (prune + self-heal) par défaut, cohérent avec un usage
// GitOps standard ; désactivable via automatedSync: false pour un
// déploiement piloté manuellement.
export async function upsertApplication({ name, project = 'default', repoURL, path, targetRevision = 'HEAD', destinationServer = 'https://kubernetes.default.svc', destinationNamespace, automatedSync = true }) {
  const c = client();
  if (!c) throw new IntegrationError('Argo CD non configuré', { status: 409 });
  const body = {
    metadata: { name },
    spec: {
      project,
      source: { repoURL, path: path || '.', targetRevision },
      destination: { server: destinationServer, namespace: destinationNamespace },
      syncPolicy: automatedSync
        ? { automated: { prune: true, selfHeal: true }, syncOptions: ['CreateNamespace=true'] }
        : undefined
    }
  };
  await request(c.http, { method: 'POST', url: '/api/v1/applications', params: { upsert: true }, data: body }, 'Argo CD');
  return { ok: true, name };
}

export async function rollbackApplication(name, historyId) {
  const c = client();
  if (!c) throw new IntegrationError('Argo CD non configuré', { status: 409 });
  await request(c.http, { method: 'POST', url: `/api/v1/applications/${encodeURIComponent(name)}/rollback`, data: { id: historyId } }, 'Argo CD');
  return { ok: true, message: `Retour arrière déclenché pour ${name}` };
}
