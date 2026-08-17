// Schéma déclaratif des formulaires d'intégration : ajouter une intégration future
// ne nécessite qu'une entrée ici + le service backend correspondant.
// `guide` : étapes affichées dans "Comment obtenir ces informations ?" (repliable)
// dans Paramètres. `hint` sur un champ : aide courte affichée sous le champ.
export const INTEGRATION_FORMS = {
  kubernetes: {
    label: 'Kubernetes',
    hint: 'Accès au serveur API du cluster (K3s/K8s) via un ServiceAccount dédié.',
    guide: [
      "Créez un ServiceAccount dédié : kubectl create serviceaccount nexus-console -n kube-system",
      "Donnez-lui les droits nécessaires (view pour consulter, edit pour redémarrer un déploiement) : kubectl create clusterrolebinding nexus-console --clusterrole=edit --serviceaccount=kube-system:nexus-console",
      "Générez un token durable (Kubernetes ≥ 1.24) : kubectl create token nexus-console -n kube-system --duration=8760h",
      "Récupérez l'URL du serveur API : kubectl cluster-info (ou server: dans votre kubeconfig)",
      "Si le certificat du cluster n'est pas reconnu (CA auto-signée), cochez « Ignorer la vérification TLS » (labo uniquement)."
    ],
    fields: [
      { key: 'apiServer', label: 'URL du serveur API', placeholder: 'https://10.0.0.10:6443', hint: 'Visible avec `kubectl cluster-info`.' },
      { key: 'namespace', label: 'Namespace par défaut', placeholder: 'default' },
      { key: 'token', label: 'Token du ServiceAccount', type: 'password', secret: true, hint: 'Généré via `kubectl create token`.' },
      { key: 'insecureSkipTlsVerify', label: 'Ignorer la vérification TLS (labo uniquement)', type: 'checkbox' }
    ]
  },
  argocd: {
    label: 'Argo CD',
    hint: 'Utilisé pour lister les applications et déclencher des synchronisations.',
    guide: [
      "Connectez-vous à Argo CD avec la CLI : argocd login argocd.homelab.local",
      "Créez un compte de service dédié dans argocd-cm (accounts.nexus-console: apiKey), ou réutilisez votre compte.",
      "Générez un token : argocd account generate-token --account nexus-console",
      "L'URL du serveur est celle de votre interface Argo CD (avec https://)."
    ],
    fields: [
      { key: 'baseUrl', label: 'URL du serveur', placeholder: 'https://argocd.homelab.local' },
      { key: 'token', label: 'Token API', type: 'password', secret: true, hint: 'Généré via `argocd account generate-token`.' }
    ],
    hostSuggestion: { field: 'baseUrl', subdomain: 'argocd' }
  },
  haproxy: {
    label: 'HAProxy',
    hint: 'Data Plane API pour piloter backends et serveurs à chaud.',
    guide: [
      "Nécessite la HAProxy Data Plane API (v2/v3), distincte de HAProxy lui-même — voir haproxy.com/documentation/dataplaneapi.",
      "Installez-la sur le même hôte que HAProxy et démarrez-la (par défaut sur le port 5555).",
      "Définissez un utilisateur/mot de passe dans son fichier de configuration (dataplaneapi.yaml, section userlist).",
      "L'URL à renseigner ici est celle de la Data Plane API, pas celle de HAProxy lui-même."
    ],
    fields: [
      { key: 'dataPlaneUrl', label: 'URL Data Plane API', placeholder: 'https://haproxy.homelab.local:5555' },
      { key: 'username', label: "Nom d'utilisateur" },
      { key: 'password', label: 'Mot de passe', type: 'password', secret: true }
    ],
    hostSuggestion: { field: 'dataPlaneUrl', subdomain: 'haproxy', port: 5555 }
  },
  gitlab: {
    label: 'GitLab',
    hint: 'Projets, pipelines et merge requests.',
    guide: [
      "Dans GitLab : avatar (en haut à droite) → Edit profile → Access Tokens.",
      "Créez un token avec le scope « api » (accès complet à l'API).",
      "Copiez-le immédiatement : GitLab ne l'affichera plus jamais ensuite.",
      "L'URL de l'instance est la racine de votre GitLab (ex: https://gitlab.homelab.local), sans /api ni chemin de projet."
    ],
    fields: [
      { key: 'baseUrl', label: 'URL de l\'instance', placeholder: 'https://gitlab.homelab.local' },
      { key: 'token', label: 'Token d\'accès personnel', type: 'password', secret: true, hint: 'Scope « api » requis.' }
    ],
    hostSuggestion: { field: 'baseUrl', subdomain: 'gitlab' }
  },
  github: {
    label: 'GitHub',
    hint: "Dépôts, GitHub Actions et pull requests. Utilise l'API publique api.github.com.",
    guide: [
      "Rendez-vous sur github.com → Settings → Developer settings → Personal access tokens.",
      "Créez un token (classic) avec les scopes « repo » et « workflow », ou un token « fine-grained » scopé aux dépôts voulus avec les permissions Contents/Actions/Pull requests en lecture.",
      "Copiez-le immédiatement : GitHub ne l'affichera plus jamais ensuite."
    ],
    fields: [
      { key: 'token', label: 'Token d\'accès personnel (scope repo + workflow)', type: 'password', secret: true }
    ]
  },
  gitea: {
    label: 'Gitea',
    hint: 'Dépôts et pull requests (lecture + approbation). Auto-hébergé, alternative légère à GitLab/GitHub.',
    guide: [
      "Dans Gitea : icône de profil → Paramètres → Applications.",
      "Générez un token avec les portées repo (lecture) et pull_request (approbation).",
      "Copiez-le immédiatement : Gitea ne l'affichera plus jamais ensuite.",
      "L'URL de l'instance est la racine de votre Gitea (ex: https://gitea.homelab.local), sans /api."
    ],
    fields: [
      { key: 'baseUrl', label: 'URL de l\'instance', placeholder: 'https://gitea.homelab.local' },
      { key: 'token', label: 'Token d\'accès', type: 'password', secret: true, hint: 'Portées repo + pull_request requises.' }
    ],
    hostSuggestion: { field: 'baseUrl', subdomain: 'gitea' }
  },
  proxmox: {
    label: 'Proxmox VE',
    hint: 'Nœuds, VM et conteneurs LXC.',
    guide: [
      "Dans l'interface Proxmox : Datacenter → Permissions → API Tokens → Add.",
      "Choisissez un utilisateur (ex: root@pam) et un nom de token (ex: nexus).",
      "Décochez « Privilege Separation » si vous voulez que le token hérite des droits de l'utilisateur, sinon assignez des permissions dédiées au token.",
      "Le Token ID est au format utilisateur@royaume!nomdutoken (ex: root@pam!nexus) ; le Token Secret n'est affiché qu'une seule fois à la création."
    ],
    fields: [
      { key: 'baseUrl', label: 'URL de l\'API', placeholder: 'https://pve.homelab.local:8006' },
      { key: 'tokenId', label: 'Token ID', placeholder: 'root@pam!nexus', hint: 'Format utilisateur@royaume!nomdutoken.' },
      { key: 'tokenSecret', label: 'Token Secret', type: 'password', secret: true, hint: "Affiché une seule fois à la création du token." }
    ],
    hostSuggestion: { field: 'baseUrl', subdomain: 'pve', port: 8006 }
  },
  traefik: {
    label: 'Traefik',
    hint: 'API en lecture + dossier de configuration dynamique pour les proxies créés depuis la console.',
    guide: [
      "Activez l'API dans la configuration statique de Traefik (traefik.yml) : api: { dashboard: true }, et exposez un entrypoint dédié ou protégez-la (basic auth) plutôt que d'utiliser api.insecure en production.",
      "Activez le provider de fichiers dynamiques : providers: { file: { directory: /etc/traefik/dynamic, watch: true } }.",
      "Le dossier renseigné ici doit être exactement ce chemin, accessible en écriture par le compte qui exécute la console (ou partagé via un volume si Traefik tourne dans un autre conteneur)."
    ],
    fields: [
      { key: 'apiUrl', label: 'URL de l\'API', placeholder: 'https://traefik.homelab.local' },
      { key: 'username', label: "Nom d'utilisateur (optionnel)" },
      { key: 'password', label: 'Mot de passe (optionnel)', type: 'password', secret: true },
      { key: 'dynamicConfigDir', label: 'Dossier de configuration dynamique', placeholder: '/etc/traefik/dynamic', hint: 'Doit correspondre au provider "file" de Traefik.' }
    ],
    hostSuggestion: { field: 'apiUrl', subdomain: 'traefik' }
  },
  certManager: {
    label: 'Cert-Manager',
    hint: 'Ne nécessite aucune configuration propre : utilise l\'accès Kubernetes ci-dessus.',
    guide: [
      "Configurez d'abord l'intégration Kubernetes ci-dessus : Cert-Manager est lu via les CustomResourceDefinitions du cluster (certificates.cert-manager.io), pas via une API séparée.",
      "Le ServiceAccount Kubernetes utilisé doit pouvoir lister les ressources « certificates » (le rôle « view » suffit)."
    ],
    fields: []
  },
  grafana: {
    label: 'Grafana',
    hint: 'Tableaux de bord et alertes.',
    guide: [
      "Dans Grafana : Administration → Service accounts (ou API Keys sur les versions plus anciennes).",
      "Créez un compte de service avec le rôle Viewer (lecture seule des tableaux de bord/alertes suffit).",
      "Générez un token pour ce compte de service et copiez-le : il ne sera plus affiché ensuite."
    ],
    fields: [
      { key: 'baseUrl', label: 'URL de l\'instance', placeholder: 'https://grafana.homelab.local' },
      { key: 'apiKey', label: 'Clé API', type: 'password', secret: true, hint: 'Service account token, rôle Viewer suffisant.' }
    ],
    hostSuggestion: { field: 'baseUrl', subdomain: 'grafana' }
  },
  wazuh: {
    label: 'Wazuh',
    hint: 'Agents, alertes de sécurité et conformité (API du gestionnaire, port 55000 par défaut).',
    guide: [
      "L'API du gestionnaire Wazuh écoute par défaut sur le port 55000 (distinct de l'interface web Wazuh Dashboard).",
      "Un utilisateur « wazuh-wui » existe par défaut (mot de passe généré à l'installation, dans wazuh-install-files.tar sur le serveur) — créez plutôt un utilisateur API dédié en lecture seule via /security/users si possible.",
      "L'URL à renseigner est celle du gestionnaire (manager), pas celle du tableau de bord web."
    ],
    fields: [
      { key: 'baseUrl', label: 'URL de l\'API', placeholder: 'https://wazuh.homelab.local:55000' },
      { key: 'username', label: "Nom d'utilisateur", placeholder: 'wazuh-wui' },
      { key: 'password', label: 'Mot de passe', type: 'password', secret: true }
    ],
    hostSuggestion: { field: 'baseUrl', subdomain: 'wazuh', port: 55000 }
  },
  registry: {
    label: 'Registre privé',
    hint: 'Registre d\'images Docker privé (service "registry" de docker-compose.yml) — pour vos builds propriétaires.',
    guide: [
      "Activez le registre lors de l'installation (./install.sh, question « Activer un registre d'images privé ? ») — il génère les identifiants automatiquement.",
      "Depuis la console elle-même (dans le réseau Docker interne) : http://registry:5000.",
      "Depuis une autre machine (docker push/pull) : http://<IP-de-cette-machine>:5000, avec le compte défini à l'installation (voir .env, REGISTRY_USERNAME/REGISTRY_PASSWORD).",
      "Sans certificat TLS, ajoutez cette adresse aux \"insecure-registries\" du démon Docker de chaque machine qui doit y pousser des images."
    ],
    fields: [
      { key: 'baseUrl', label: 'URL du registre', placeholder: 'http://registry:5000', hint: 'http://registry:5000 depuis la console elle-même.' },
      { key: 'username', label: "Nom d'utilisateur" },
      { key: 'password', label: 'Mot de passe', type: 'password', secret: true }
    ]
  },
  notificationsWebhook: {
    label: 'Notifications sortantes',
    hint: 'Relaie vers Slack, Discord ou Microsoft Teams chaque alerte de sécurité que la console génère déjà (verrouillage de compte, IP bannie, secret committé, vulnérabilité critique...) — plus besoin d\'avoir la console ouverte pour les voir.',
    guide: [
      "Slack : Créez une app (api.slack.com/apps) → Incoming Webhooks → activez-les → « Add New Webhook to Workspace » → copiez l'URL (https://hooks.slack.com/services/...).",
      "Discord : Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → copiez l'URL du webhook.",
      "Microsoft Teams : dans le canal, « ... » → Connecteurs → Incoming Webhook → configurez-le → copiez l'URL générée.",
      "Le format du message (Slack/Discord) est détecté automatiquement depuis l'URL — rien d'autre à choisir."
    ],
    fields: [
      { key: 'url', label: 'URL du webhook', type: 'password', secret: true, placeholder: 'https://hooks.slack.com/services/…' }
    ]
  },
  ovh: {
    label: 'OVH (DNS)',
    hint: 'Gestion des zones DNS de vos domaines OVH — permet de pointer un domaine vers cette infrastructure directement depuis Réseaux → Proxies & domaines.',
    guide: [
      "Créez une application API sur https://api.ovh.com/createApp/ (choisissez la région correspondant à votre compte : Europe = ovh-eu, Amérique du Nord = ovh-ca, US = ovh-us).",
      "Notez l'Application Key et l'Application Secret générés.",
      "Générez un Consumer Key avec les droits nécessaires sur https://api.ovh.com/createToken/ (ou via l'API) : GET/PUT/POST sur /domain/zone/*, méthode simple : cochez GET, PUT, POST pour la route /domain/zone/*.",
      "Validez la demande de Consumer Key en suivant le lien de confirmation envoyé — il expire après un délai court."
    ],
    fields: [
      { key: 'endpoint', label: 'Région', type: 'select', options: [{ value: 'ovh-eu', label: 'Europe (ovh-eu)' }, { value: 'ovh-ca', label: 'Amérique du Nord (ovh-ca)' }, { value: 'ovh-us', label: 'États-Unis (ovh-us)' }] },
      { key: 'appKey', label: 'Application Key' },
      { key: 'appSecret', label: 'Application Secret', type: 'password', secret: true },
      { key: 'consumerKey', label: 'Consumer Key', type: 'password', secret: true, hint: 'Généré et validé via api.ovh.com/createToken/.' }
    ]
  },
  duckdns: {
    label: 'DuckDNS',
    hint: 'DNS dynamique gratuit pour les sous-domaines *.duckdns.org — pratique derrière une IP publique qui change (accès domicile/labo).',
    guide: [
      "Connectez-vous sur https://www.duckdns.org (via GitHub/Google/Reddit/Twitter).",
      "Créez un ou plusieurs sous-domaines depuis la page d'accueil du compte.",
      "Copiez le token affiché en haut de page (un seul token pour tous vos sous-domaines DuckDNS)."
    ],
    fields: [
      { key: 'token', label: 'Token DuckDNS', type: 'password', secret: true }
    ]
  }
};

export const INTEGRATION_ORDER = ['kubernetes', 'argocd', 'haproxy', 'gitlab', 'github', 'gitea', 'proxmox', 'traefik', 'certManager', 'grafana', 'wazuh', 'registry', 'notificationsWebhook', 'ovh', 'duckdns'];
