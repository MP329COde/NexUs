// Cluster Kubernetes actif (Lot C4 — multi-cluster) : sélection persistée
// côté navigateur (localStorage), partagée par toute la page Kubernetes
// (tableau principal + dialogues logs/describe/metrics/owners/diagnostics...)
// sans avoir à faire passer un prop `clusterId` dans chacun d'eux. Lu par
// lib/apiClient.js qui l'ajoute automatiquement en `?cluster=` à tout appel
// vers /kubernetes/* — absent (aucun cluster choisi, ou un seul cluster
// configuré), le backend résout le cluster marqué par défaut, ce qui
// reproduit exactement le comportement mono-cluster d'avant ce lot.
const STORAGE_KEY = 'nexus.activeK8sCluster';

let current = (() => {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
})();

const listeners = new Set();

export function getActiveK8sCluster() {
  return current;
}

export function setActiveK8sCluster(id) {
  current = id || '';
  try {
    if (current) localStorage.setItem(STORAGE_KEY, current);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* stockage indisponible (navigation privée...) — perte de la persistance seulement */ }
  listeners.forEach((fn) => fn(current));
}

export function subscribeActiveK8sCluster(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
