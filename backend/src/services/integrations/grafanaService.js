import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

function client() {
  const cfg = getRawIntegration('grafana');
  if (!cfg.baseUrl) return null;
  return { http: buildClient(cfg.baseUrl, { headers: { Authorization: cfg.apiKey ? `Bearer ${cfg.apiKey}` : undefined } }), cfg };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('Grafana');
  const health = await request(c.http, { method: 'GET', url: '/api/health' }, 'Grafana');
  return { configured: true, ok: health.database === 'ok', message: `Grafana ${health.version || ''} · base ${health.database}` };
}

export async function listDashboards() {
  const c = client();
  if (!c) throw new IntegrationError('Grafana non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/api/search', params: { type: 'dash-db' } }, 'Grafana');
  return data.map((d) => ({ uid: d.uid, title: d.title, url: d.url, folderTitle: d.folderTitle, tags: d.tags }));
}

export async function listAlerts() {
  const c = client();
  if (!c) throw new IntegrationError('Grafana non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/api/alertmanager/grafana/api/v2/alerts' }, 'Grafana');
  return (data || []).map((a) => ({
    name: a.labels?.alertname,
    severity: a.labels?.severity,
    status: a.status?.state,
    startsAt: a.startsAt
  }));
}
