// Domaines de la console, repris de la navigation du mockup (base/Nexus Console.dc.html).
// Chaque domaine pointe vers une route ; les domaines marqués `stub` affichent un
// espace réservé prêt à être développé sans toucher au reste de l'architecture.
export const DOMAINS = [
  { id: 'home', code: 'HUB', label: 'Vue générale', sub: "État global de l'infrastructure", path: '/' },
  { id: 'dev', code: 'DEV', label: 'Développement', sub: 'Code, CI/CD et déploiements', path: '/deployments' },
  { id: 'inf', code: 'INF', label: 'Infrastructure', sub: 'Proxmox, VM et LXC', path: '/infrastructure' },
  { id: 'k8s', code: 'K8S', label: 'Kubernetes', sub: 'Cluster, charges et GitOps', path: '/kubernetes' },
  { id: 'net', code: 'NET', label: 'Réseaux', sub: 'Reverse proxy, domaines et certificats', path: '/network' },
  { id: 'mon', code: 'MON', label: 'Monitoring', sub: 'Métriques, alertes et logs', path: '/monitoring' },
  { id: 'sec', code: 'SEC', label: 'Cybersécurité', sub: 'Vulnérabilités, accès et audit', path: '/security', stub: true },
  { id: 'sto', code: 'STO', label: 'Stockage', sub: 'Volumes, NAS et sauvegardes', path: '/storage', stub: true },
  { id: 'adm', code: 'ADM', label: 'Paramètres', sub: 'Intégrations et console', path: '/settings' }
];
