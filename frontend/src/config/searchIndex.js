// Entrées statiques de la recherche globale (Cmd+K). Chaque entrée pointe vers
// une route déjà déclarée dans App.jsx. `adminOnly` masque l'entrée aux comptes
// non-admin, comme le fait déjà DomainNav pour la navigation latérale.
export const STATIC_SEARCH_ITEMS = [
  { label: 'Vue générale', group: 'Pages', path: '/', keywords: 'accueil dashboard tableau de bord santé' },
  { label: 'Développement', group: 'Pages', path: '/deployments', keywords: 'dev gitlab github argocd ci cd pipeline' },
  { label: 'Infrastructure — Proxmox', group: 'Pages', path: '/infrastructure', keywords: 'vm lxc nœuds proxmox' },
  { label: 'Infrastructure — Hôtes & agents', group: 'Pages', path: '/infrastructure/hosts', keywords: 'ssh agent wazuh node exporter', adminOnly: true },
  { label: 'Kubernetes', group: 'Pages', path: '/kubernetes', keywords: 'k8s cluster pods namespaces deployments' },
  { label: 'Réseaux — Proxies & domaines', group: 'Pages', path: '/network', keywords: 'reverse proxy domaine traefik haproxy' },
  { label: 'Réseaux — HAProxy', group: 'Pages', path: '/network/haproxy', keywords: 'backend serveur drain maint' },
  { label: 'Réseaux — Topologie', group: 'Pages', path: '/network/topology', keywords: 'schéma réseau graphe' },
  { label: 'Réseaux — Certificats', group: 'Pages', path: '/network/certificates', keywords: 'cert-manager tls ssl renouvellement' },
  { label: 'Monitoring', group: 'Pages', path: '/monitoring', keywords: 'grafana alertes métriques' },
  { label: 'Cybersécurité', group: 'Pages', path: '/security', keywords: 'wazuh agents sécurité' },
  { label: 'Stockage', group: 'Pages', path: '/storage', keywords: 'volumes nas sauvegardes' },
  { label: 'Mon compte', group: 'Pages', path: '/account', keywords: 'profil mot de passe avatar thème' },
  { label: "Manuel d'utilisation", group: 'Pages', path: '/manual', keywords: 'aide documentation guide manuel help' },
  { label: 'Rapport de santé', group: 'Pages', path: '/report', keywords: 'rapport pdf export imprimer santé' },
  { label: 'Paramètres — Intégrations', group: 'Administration', path: '/settings', keywords: 'kubernetes argocd haproxy gitlab github proxmox traefik grafana wazuh token', adminOnly: true },
  { label: 'Paramètres — Utilisateurs', group: 'Administration', path: '/settings?tab=users', keywords: 'comptes rôles admin utilisateur', adminOnly: true },
  { label: 'Paramètres — Système', group: 'Administration', path: '/settings?tab=system', keywords: 'version mise à jour sauvegarde backup restaurer', adminOnly: true },
  { label: 'Paramètres — Journal', group: 'Administration', path: '/settings?tab=audit', keywords: 'audit log historique actions', adminOnly: true }
];
