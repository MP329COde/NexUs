import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

// Registre d'images privé — API HTTP v2 (Docker Distribution / OCI
// Distribution Spec), compatible avec le registre `registry:2` officiel
// fourni par docker-compose.yml (service "registry") ainsi qu'avec Harbor,
// qui expose la même API. Authentification basique (htpasswd côté registre),
// comme Traefik/HAProxy ci-dessus — jamais de mock, un registre non
// accessible remonte une erreur explicite.
const MANIFEST_ACCEPT = 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json';

function client() {
  const cfg = getRawIntegration('registry');
  if (!cfg.baseUrl) return null;
  return {
    http: buildClient(cfg.baseUrl, { auth: cfg.username ? { username: cfg.username, password: cfg.password || '' } : undefined }),
    cfg
  };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('Registre privé');
  await request(c.http, { method: 'GET', url: '/v2/' }, 'Registre privé');
  return { configured: true, ok: true, message: 'Registre privé accessible.' };
}

export async function listCatalog() {
  const c = client();
  if (!c) throw new IntegrationError('Registre privé non configuré (voir Paramètres)', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/v2/_catalog', params: { n: 200 } }, 'Registre privé');
  return data.repositories || [];
}

export async function listTags(repo) {
  const c = client();
  if (!c) throw new IntegrationError('Registre privé non configuré (voir Paramètres)', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/v2/${repo}/tags/list` }, 'Registre privé');
  return data.tags || [];
}

export async function getManifest(repo, tag) {
  const c = client();
  if (!c) throw new IntegrationError('Registre privé non configuré (voir Paramètres)', { status: 409 });
  const http = c.http;
  let res;
  try {
    res = await http.request({ method: 'GET', url: `/v2/${repo}/manifests/${tag}`, headers: { Accept: MANIFEST_ACCEPT } });
  } catch (err) {
    throw new IntegrationError(`Registre privé: connexion impossible (${err.code || err.message})`, { status: 502 });
  }
  if (res.status >= 400) throw new IntegrationError(`Registre privé: ${res.status}`, { status: res.status === 404 ? 404 : 502 });
  const manifest = res.data;
  const layers = manifest.layers || [];
  const sizeBytes = (manifest.config?.size || 0) + layers.reduce((s, l) => s + (l.size || 0), 0);
  return {
    digest: res.headers?.['docker-content-digest'] || null,
    sizeBytes,
    layerCount: layers.length,
    mediaType: manifest.mediaType || null
  };
}

export async function deleteTag(repo, tag) {
  const c = client();
  if (!c) throw new IntegrationError('Registre privé non configuré (voir Paramètres)', { status: 409 });
  const { digest } = await getManifest(repo, tag);
  if (!digest) throw new IntegrationError('Digest introuvable pour cette étiquette', { status: 404 });
  await request(c.http, { method: 'DELETE', url: `/v2/${repo}/manifests/${digest}` }, 'Registre privé');
  return { ok: true };
}
