import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

// Intégration via la HAProxy Data Plane API (v2/v3), standard pour piloter
// HAProxy par API REST plutôt qu'en éditant haproxy.cfg à la main.
function client() {
  const cfg = getRawIntegration('haproxy');
  if (!cfg.dataPlaneUrl) return null;
  return { http: buildClient(cfg.dataPlaneUrl, { auth: cfg.username ? { username: cfg.username, password: cfg.password || '' } : undefined }), cfg };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('HAProxy');
  const info = await request(c.http, { method: 'GET', url: '/v2/info' }, 'HAProxy');
  return { configured: true, ok: true, message: `Data Plane API v${info.api?.version || '?'} joignable` };
}

export async function listBackends() {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/v2/services/haproxy/configuration/backends' }, 'HAProxy');
  return (data.data || []).map((b) => ({ name: b.name, mode: b.mode, balance: b.balance?.algorithm }));
}

export async function listServers(backend) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/v2/services/haproxy/configuration/servers', params: { backend } }, 'HAProxy');
  return (data.data || []).map((s) => ({ name: s.name, address: s.address, port: s.port, check: s.check, maxconn: s.maxconn }));
}

export async function listRuntimeServerStates(backend) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/v2/services/haproxy/runtime/servers', params: { backend } }, 'HAProxy');
  return (data.data || []).map((s) => ({ name: s.name, adminState: s.admin_state, operationalState: s.operational_state }));
}

export async function setServerState(backend, server, state) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const version = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: `/v2/services/haproxy/runtime/servers/${encodeURIComponent(server)}`,
    params: { backend, version },
    data: { admin_state: state } // ready | maint | drain
  }, 'HAProxy');
  return { ok: true, message: `Serveur ${server} → ${state}` };
}

async function getConfigVersion(c) {
  const data = await request(c.http, { method: 'GET', url: '/v2/services/haproxy/configuration/version' }, 'HAProxy');
  return data;
}

// Crée (ou remplace) un backend + un serveur pour un proxy géré par la console.
// Limitation assumée du scaffold: le rattachement au frontend (ACL/use_backend)
// n'est pas automatisé ici et doit être câblé manuellement ou dans une évolution
// future — la création/mise à jour du backend applicatif l'est en revanche.
export async function applyProxyBackend(proxy) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const backendName = `nexus_${proxy.id}`;
  const version = await getConfigVersion(c);
  await request(c.http, {
    method: 'POST',
    url: '/v2/services/haproxy/configuration/backends',
    params: { version, force_reload: true },
    data: { name: backendName, mode: 'http', balance: { algorithm: 'roundrobin' } }
  }, 'HAProxy').catch((err) => {
    if (err.status !== 502) throw err; // tolère "existe déjà", géré par le PUT ci-dessous
  });
  const version2 = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: `/v2/services/haproxy/configuration/servers/srv1`,
    params: { backend: backendName, version: version2, force_reload: true },
    data: { name: 'srv1', address: proxy.targetService, port: Number(proxy.targetPort), check: 'enabled' }
  }, 'HAProxy');
  return { ok: true, message: `Backend HAProxy ${backendName} appliqué (rattachement au frontend à finaliser manuellement)` };
}
