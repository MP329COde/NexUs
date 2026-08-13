import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Un hôte géré ne stocke aucun secret : l'authentification se fait avec la
// clé privée unique de la console (voir utils/sshKeypair.js), dont la clé
// publique doit être copiée manuellement dans authorized_keys sur l'hôte.
export function listHosts() {
  return readStore('hosts');
}

export function getHost(id) {
  return listHosts().find((h) => h.id === id);
}

export function createHost({ name, address, port, sshUser, role, critical }) {
  const hosts = listHosts();
  const host = {
    id: uuid(),
    name,
    address,
    port: port ? Number(port) : 22,
    sshUser: sshUser || 'root',
    role: role || '',
    critical: Boolean(critical),
    lastInstall: null, // { agentId, ok, message, at }
    createdAt: new Date().toISOString()
  };
  hosts.push(host);
  writeStore('hosts', hosts);
  return host;
}

export function updateHost(id, payload) {
  const hosts = listHosts();
  const idx = hosts.findIndex((h) => h.id === id);
  if (idx === -1) return null;
  hosts[idx] = { ...hosts[idx], ...payload, port: payload.port ? Number(payload.port) : hosts[idx].port };
  writeStore('hosts', hosts);
  return hosts[idx];
}

export function recordInstallResult(id, result) {
  return updateHost(id, { lastInstall: { ...result, at: new Date().toISOString() } });
}

export function deleteHost(id) {
  const hosts = listHosts();
  const next = hosts.filter((h) => h.id !== id);
  writeStore('hosts', next);
  return next.length !== hosts.length;
}
