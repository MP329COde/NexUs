import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Une "app link" relie les différents maillons du workflow pour une même application,
// afin que la console puisse en afficher le pipeline complet en une seule vue.
export function listLinks() {
  return readStore('deployments') || [];
}

export function createLink(payload) {
  const links = listLinks();
  const link = {
    id: uuid(),
    name: payload.name,
    gitlabProjectId: payload.gitlabProjectId || null,
    argocdAppName: payload.argocdAppName || null,
    k8sNamespace: payload.k8sNamespace || null,
    k8sDeployment: payload.k8sDeployment || null,
    proxyId: payload.proxyId || null,
    createdAt: new Date().toISOString()
  };
  links.push(link);
  writeStore('deployments', links);
  return link;
}

export function updateLink(id, payload) {
  const links = listLinks();
  const idx = links.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  links[idx] = { ...links[idx], ...payload };
  writeStore('deployments', links);
  return links[idx];
}

export function deleteLink(id) {
  const links = listLinks();
  const next = links.filter((l) => l.id !== id);
  writeStore('deployments', next);
  return next.length !== links.length;
}

export function getLink(id) {
  return listLinks().find((l) => l.id === id);
}
