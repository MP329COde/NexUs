import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

export function listProxies() {
  return readStore('proxies');
}

export function getProxy(id) {
  return listProxies().find((p) => p.id === id);
}

export function createProxy(payload) {
  const proxies = listProxies();
  const proxy = {
    id: uuid(),
    name: payload.name,
    domain: payload.domain,
    targetService: payload.targetService,
    targetPort: Number(payload.targetPort),
    tls: Boolean(payload.tls),
    certResolver: payload.certResolver || 'default',
    engine: payload.engine || 'traefik', // traefik | haproxy
    status: 'draft', // draft | applied | error
    lastError: null,
    lastAppliedAt: null,
    createdAt: new Date().toISOString()
  };
  proxies.push(proxy);
  writeStore('proxies', proxies);
  return proxy;
}

export function updateProxy(id, payload) {
  const proxies = listProxies();
  const idx = proxies.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  proxies[idx] = { ...proxies[idx], ...payload, targetPort: payload.targetPort ? Number(payload.targetPort) : proxies[idx].targetPort, status: 'draft' };
  writeStore('proxies', proxies);
  return proxies[idx];
}

export function setProxyState(id, patch) {
  const proxies = listProxies();
  const idx = proxies.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  proxies[idx] = { ...proxies[idx], ...patch };
  writeStore('proxies', proxies);
  return proxies[idx];
}

export function deleteProxy(id) {
  const proxies = listProxies();
  const next = proxies.filter((p) => p.id !== id);
  writeStore('proxies', next);
  return next.length !== proxies.length;
}
