import axios from 'axios';
import * as store from '../store/proxyStore.js';
import { writeDynamicRoute, removeDynamicRoute } from './integrations/traefikService.js';
import { applyProxyBackend, attachProxyToFrontend } from './integrations/haproxyService.js';

export function list() {
  return store.listProxies();
}

export function create(payload) {
  validate(payload);
  return store.createProxy(payload);
}

export function update(id, payload) {
  validate({ ...store.getProxy(id), ...payload });
  const updated = store.updateProxy(id, payload);
  if (!updated) throw notFound(id);
  return updated;
}

export function remove(id) {
  const proxy = store.getProxy(id);
  if (!proxy) throw notFound(id);
  try {
    removeDynamicRoute(proxy);
  } catch {
    // best-effort: on ne bloque pas la suppression locale si Traefik est injoignable
  }
  store.deleteProxy(id);
  return { ok: true };
}

// Applique la configuration du proxy sur le moteur choisi (Traefik ou HAProxy)
// et journalise le résultat/erreur sur l'entrée pour affichage dans l'UI.
export async function apply(id) {
  const proxy = store.getProxy(id);
  if (!proxy) throw notFound(id);
  try {
    const result = proxy.engine === 'haproxy' ? await applyProxyBackend(proxy) : writeDynamicRoute(proxy);
    store.setProxyState(id, { status: 'applied', lastError: null, lastAppliedAt: new Date().toISOString() });
    return { ok: true, message: result.message };
  } catch (err) {
    store.setProxyState(id, { status: 'error', lastError: err.message });
    throw err;
  }
}

export async function attachToFrontend(id, frontendName) {
  const proxy = store.getProxy(id);
  if (!proxy) throw notFound(id);
  if (proxy.engine !== 'haproxy') {
    throw Object.assign(new Error('Le rattachement à un frontend ne concerne que les proxies gérés par HAProxy'), { status: 400 });
  }
  if (!frontendName) throw Object.assign(new Error('Frontend requis'), { status: 400 });
  return attachProxyToFrontend(proxy, frontendName);
}

export async function testConnection(id) {
  const proxy = store.getProxy(id);
  if (!proxy) throw notFound(id);
  const url = `${proxy.tls ? 'https' : 'http'}://${proxy.domain}`;
  const startedAt = Date.now();
  try {
    const res = await axios.get(url, { timeout: 5000, validateStatus: () => true, maxRedirects: 2 });
    return { ok: res.status < 500, statusCode: res.status, latencyMs: Date.now() - startedAt, url };
  } catch (err) {
    return { ok: false, error: err.code || err.message, latencyMs: Date.now() - startedAt, url };
  }
}

// Ces champs sont interpolés tels quels dans un fragment YAML écrit sur disque
// (traefikService.writeDynamicRoute) puis lu en direct par Traefik : une valeur
// non validée permettrait à n'importe quel utilisateur authentifié (la création
// de proxy n'est pas réservée aux admins) d'injecter des clés YAML arbitraires
// et de détourner du routage. On valide donc strictement leur format, pas
// seulement leur présence.
function validate(payload) {
  const required = ['name', 'domain', 'targetService', 'targetPort'];
  const missing = required.filter((f) => !payload[f]);
  if (missing.length) {
    const err = new Error(`Champs requis manquants: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(payload.domain)) {
    invalid('domaine', payload.domain);
  }
  if (!/^[a-z0-9.-]+$/i.test(payload.targetService)) {
    invalid('service cible', payload.targetService);
  }
  const port = Number(payload.targetPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    invalid('port cible', payload.targetPort);
  }
  if (payload.certResolver && !/^[a-z0-9-]+$/i.test(payload.certResolver)) {
    invalid('resolver de certificat', payload.certResolver);
  }
}

function invalid(field, value) {
  const err = new Error(`Valeur invalide pour ${field}: ${value}`);
  err.status = 400;
  throw err;
}

function notFound(id) {
  const err = new Error(`Proxy introuvable: ${id}`);
  err.status = 404;
  return err;
}
