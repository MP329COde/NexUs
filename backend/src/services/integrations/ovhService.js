import crypto from 'node:crypto';
import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

// Intégration API OVH (gestion de zones DNS) — voir https://api.ovh.com/g934.first_step_with_api
// pour le mécanisme d'authentification signé (application key/secret + consumer key).
// Endpoints régionaux documentés sur https://api.ovh.com/ : ovh-eu, ovh-ca, ovh-us.
const ENDPOINTS = {
  'ovh-eu': 'https://eu.api.ovh.com/1.0',
  'ovh-ca': 'https://ca.api.ovh.com/1.0',
  'ovh-us': 'https://api.us.ovhcloud.com/1.0'
};

function client() {
  const cfg = getRawIntegration('ovh');
  if (!cfg.appKey || !cfg.appSecret || !cfg.consumerKey) return null;
  const baseURL = ENDPOINTS[cfg.endpoint] || ENDPOINTS['ovh-eu'];
  return { http: buildClient(baseURL), cfg, baseURL };
}

// L'API OVH refuse les requêtes dont l'horodatage dérive de plus de quelques
// minutes par rapport à ses serveurs : on interroge /auth/time (endpoint
// public, non signé) pour calculer le décalage plutôt que de supposer
// l'horloge locale synchronisée (labo self-hosted, souvent pas de NTP fiable).
async function serverTimeDeltaSeconds(http) {
  const res = await http.request({ method: 'GET', url: '/auth/time' });
  if (res.status >= 400 || !res.data) return 0;
  return Number(res.data) - Math.floor(Date.now() / 1000);
}

function sign(appSecret, consumerKey, method, url, body, timestamp) {
  const toHash = `${appSecret}+${consumerKey}+${method}+${url}+${body}+${timestamp}`;
  return `$1$${crypto.createHash('sha1').update(toHash).digest('hex')}`;
}

async function signedRequest(c, method, path, data) {
  const delta = await serverTimeDeltaSeconds(c.http).catch(() => 0);
  const timestamp = Math.floor(Date.now() / 1000) + delta;
  const url = `${c.baseURL}${path}`;
  const body = data ? JSON.stringify(data) : '';
  const signature = sign(c.cfg.appSecret, c.cfg.consumerKey, method, url, body, timestamp);
  return request(c.http, {
    method,
    url: path,
    data: data || undefined,
    headers: {
      'X-Ovh-Application': c.cfg.appKey,
      'X-Ovh-Consumer': c.cfg.consumerKey,
      'X-Ovh-Signature': signature,
      'X-Ovh-Timestamp': String(timestamp),
      'Content-Type': 'application/json'
    }
  }, 'OVH');
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('OVH');
  const me = await signedRequest(c, 'GET', '/me');
  return { configured: true, ok: true, message: `Authentifié en tant que ${me.nichandle || me.email || 'compte OVH'}` };
}

export async function listZones() {
  const c = client();
  if (!c) throw new IntegrationError('OVH non configuré', { status: 409 });
  return signedRequest(c, 'GET', '/domain/zone');
}

export async function listRecords(zoneName, fieldType) {
  const c = client();
  if (!c) throw new IntegrationError('OVH non configuré', { status: 409 });
  const ids = await signedRequest(c, 'GET', `/domain/zone/${encodeURIComponent(zoneName)}/record${fieldType ? `?fieldType=${fieldType}` : ''}`);
  const records = await Promise.all(ids.map((id) => signedRequest(c, 'GET', `/domain/zone/${encodeURIComponent(zoneName)}/record/${id}`)));
  return records;
}

// Crée l'enregistrement s'il n'existe pas, ou met à jour sa cible sinon —
// c'est l'opération recherchée par "pointer ce domaine vers cette machine"
// depuis la page Réseaux, sans que l'admin ait à connaître l'ID OVH interne.
export async function upsertRecord(zoneName, subdomain, target, fieldType = 'A', ttl = 3600) {
  const c = client();
  if (!c) throw new IntegrationError('OVH non configuré', { status: 409 });
  const existing = await listRecords(zoneName, fieldType);
  const match = existing.find((r) => (r.subDomain || '') === subdomain);
  if (match) {
    await signedRequest(c, 'PUT', `/domain/zone/${encodeURIComponent(zoneName)}/record/${match.id}`, { target, ttl });
  } else {
    await signedRequest(c, 'POST', `/domain/zone/${encodeURIComponent(zoneName)}/record`, { fieldType, subDomain: subdomain, target, ttl });
  }
  await signedRequest(c, 'POST', `/domain/zone/${encodeURIComponent(zoneName)}/refresh`);
  return { ok: true, message: `${subdomain ? `${subdomain}.` : ''}${zoneName} → ${target} (${fieldType})` };
}
