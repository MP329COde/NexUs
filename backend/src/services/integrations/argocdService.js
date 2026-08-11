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
  return { configured: true, ok: true, message: `${data.items?.length ?? 0} applications suivies` };
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

export async function syncApplication(name) {
  const c = client();
  if (!c) throw new IntegrationError('Argo CD non configuré', { status: 409 });
  await request(c.http, { method: 'POST', url: `/api/v1/applications/${encodeURIComponent(name)}/sync`, data: {} }, 'Argo CD');
  return { ok: true, message: `Synchronisation déclenchée pour ${name}` };
}
