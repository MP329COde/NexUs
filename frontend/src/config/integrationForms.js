// Schéma déclaratif des formulaires d'intégration : ajouter une intégration future
// ne nécessite qu'une entrée ici + le service backend correspondant.
export const INTEGRATION_FORMS = {
  kubernetes: {
    label: 'Kubernetes',
    hint: 'Accès au serveur API du cluster (K3s/K8s) via un ServiceAccount dédié.',
    fields: [
      { key: 'apiServer', label: 'URL du serveur API', placeholder: 'https://10.0.0.10:6443' },
      { key: 'namespace', label: 'Namespace par défaut', placeholder: 'default' },
      { key: 'token', label: 'Token du ServiceAccount', type: 'password', secret: true },
      { key: 'insecureSkipTlsVerify', label: 'Ignorer la vérification TLS (labo uniquement)', type: 'checkbox' }
    ]
  },
  argocd: {
    label: 'Argo CD',
    hint: 'Utilisé pour lister les applications et déclencher des synchronisations.',
    fields: [
      { key: 'baseUrl', label: 'URL du serveur', placeholder: 'https://argocd.homelab.local' },
      { key: 'token', label: 'Token API', type: 'password', secret: true }
    ]
  },
  haproxy: {
    label: 'HAProxy',
    hint: 'Data Plane API pour piloter backends et serveurs à chaud.',
    fields: [
      { key: 'dataPlaneUrl', label: 'URL Data Plane API', placeholder: 'https://haproxy.homelab.local:5555' },
      { key: 'username', label: "Nom d'utilisateur" },
      { key: 'password', label: 'Mot de passe', type: 'password', secret: true }
    ]
  },
  gitlab: {
    label: 'GitLab',
    hint: 'Projets, pipelines et merge requests.',
    fields: [
      { key: 'baseUrl', label: 'URL de l\'instance', placeholder: 'https://gitlab.homelab.local' },
      { key: 'token', label: 'Token d\'accès personnel', type: 'password', secret: true }
    ]
  },
  github: {
    label: 'GitHub',
    hint: "Dépôts, GitHub Actions et pull requests. Utilise l'API publique api.github.com.",
    fields: [
      { key: 'token', label: 'Token d\'accès personnel (scope repo + workflow)', type: 'password', secret: true }
    ]
  },
  proxmox: {
    label: 'Proxmox VE',
    hint: 'Nœuds, VM et conteneurs LXC.',
    fields: [
      { key: 'baseUrl', label: 'URL de l\'API', placeholder: 'https://pve.homelab.local:8006' },
      { key: 'tokenId', label: 'Token ID', placeholder: 'root@pam!nexus' },
      { key: 'tokenSecret', label: 'Token Secret', type: 'password', secret: true }
    ]
  },
  traefik: {
    label: 'Traefik',
    hint: 'API en lecture + dossier de configuration dynamique pour les proxies créés depuis la console.',
    fields: [
      { key: 'apiUrl', label: 'URL de l\'API', placeholder: 'https://traefik.homelab.local' },
      { key: 'username', label: "Nom d'utilisateur (optionnel)" },
      { key: 'password', label: 'Mot de passe (optionnel)', type: 'password', secret: true },
      { key: 'dynamicConfigDir', label: 'Dossier de configuration dynamique', placeholder: '/etc/traefik/dynamic' }
    ]
  },
  certManager: {
    label: 'Cert-Manager',
    hint: 'Ne nécessite aucune configuration propre : utilise l\'accès Kubernetes ci-dessus.',
    fields: []
  },
  grafana: {
    label: 'Grafana',
    hint: 'Tableaux de bord et alertes.',
    fields: [
      { key: 'baseUrl', label: 'URL de l\'instance', placeholder: 'https://grafana.homelab.local' },
      { key: 'apiKey', label: 'Clé API', type: 'password', secret: true }
    ]
  },
  wazuh: {
    label: 'Wazuh',
    hint: 'Agents, alertes de sécurité et conformité (API du gestionnaire, port 55000 par défaut).',
    fields: [
      { key: 'baseUrl', label: 'URL de l\'API', placeholder: 'https://wazuh.homelab.local:55000' },
      { key: 'username', label: "Nom d'utilisateur", placeholder: 'wazuh-wui' },
      { key: 'password', label: 'Mot de passe', type: 'password', secret: true }
    ]
  }
};

export const INTEGRATION_ORDER = ['kubernetes', 'argocd', 'haproxy', 'gitlab', 'github', 'proxmox', 'traefik', 'certManager', 'grafana', 'wazuh'];
