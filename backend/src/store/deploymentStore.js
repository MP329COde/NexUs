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
    // 'gitlab' utilise gitlabProjectId ; 'github' utilise githubOwner + githubRepo.
    gitProvider: payload.gitProvider === 'github' ? 'github' : 'gitlab',
    gitlabProjectId: payload.gitlabProjectId || null,
    githubOwner: payload.githubOwner || null,
    githubRepo: payload.githubRepo || null,
    argocdAppName: payload.argocdAppName || null,
    k8sNamespace: payload.k8sNamespace || null,
    k8sDeployment: payload.k8sDeployment || null,
    proxyId: payload.proxyId || null,
    // Rattachement optionnel à un projet Nexus (id legacy du store JSON — voir
    // store/projectsStore.js) et à l'un de ses environnements relationnels
    // (id Postgres — voir store/orgStore.js#listEnvironments). Permet aux
    // routes scopées /projects/:id/deployments/* (routes/projects.routes.js)
    // de vérifier l'appartenance avant toute action de synchronisation ou de
    // rollback, et d'exiger le rôle owner sur un environnement de production.
    projectId: payload.projectId || null,
    environmentId: payload.environmentId || null,
    // Ferme la chaîne Registry ↔ Projets côté Deployment (voir migration
    // 0045_component_images.sql / catalog.routes.js) : rattachement optionnel
    // à un composant du catalog et à l'image qu'il déploie effectivement.
    // Non obligatoire — un lien créé avant ce chantier reste valide sans ces
    // champs, jamais de valeur inventée si non fournie.
    componentId: payload.componentId || null,
    imageRepository: payload.imageRepository || null,
    imageTag: payload.imageTag || null,
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
