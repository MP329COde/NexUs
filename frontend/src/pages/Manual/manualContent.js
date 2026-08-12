// Contenu du manuel : structure de données plutôt que du JSX répété, pour que
// chaque section reste facile à relire/étendre sans toucher au composant.
// type 'p' = paragraphe, 'ul' = liste à puces, 'ol' = liste numérotée,
// 'code' = bloc de code/commande, 'note' = encadré ton "info".
export const MANUAL_SECTIONS = [
  {
    id: 'overview',
    title: "Vue d'ensemble",
    blocks: [
      { type: 'p', text: "Nexus Console centralise le pilotage de votre infrastructure homelab : Kubernetes, Argo CD, HAProxy, Traefik, GitLab, GitHub, Proxmox, Wazuh et Grafana, depuis une seule interface, derrière votre propre reverse proxy." },
      { type: 'p', text: "Le frontend (React) ne parle jamais directement à vos services d'infrastructure : toutes les requêtes passent par le backend (Express), qui détient les identifiants chiffrés et fait le lien avec chaque outil." },
      { type: 'note', text: "Principe important : tant qu'une intégration n'est pas configurée dans Paramètres, la page correspondante affiche « Non configuré » plutôt que de planter. La console est utilisable dès l'installation, sans dépendre d'une infrastructure déjà branchée." }
    ]
  },
  {
    id: 'first-run',
    title: 'Premier démarrage',
    blocks: [
      { type: 'p', text: "Au tout premier accès, si aucun compte n'existe encore, la console affiche automatiquement un assistant de configuration (/setup) : nom de la console, votre nom, e-mail et mot de passe (8 caractères minimum). Le compte créé est administrateur." },
      { type: 'note', text: "Cet assistant ne peut apparaître qu'une seule fois : dès qu'un compte existe, /setup redirige vers la page de connexion. Il n'y a pas de mot de passe par défaut devinable." },
      { type: 'p', text: "Alternative pour un déploiement automatisé (Docker, script d'installation) : définissez ADMIN_EMAIL et ADMIN_PASSWORD dans les variables d'environnement du backend avant le premier démarrage — le compte admin sera créé automatiquement, sans passer par l'assistant." }
    ]
  },
  {
    id: 'roles',
    title: 'Rôles et permissions',
    blocks: [
      { type: 'p', text: 'Chaque compte a un rôle :' },
      { type: 'ul', items: [
        'Administrateur : accès complet, y compris Paramètres (intégrations, utilisateurs, système, journal d\'audit) et l\'installation d\'agents via SSH.',
        'Utilisateur : accède à la console et à toutes les pages opérationnelles (Kubernetes, Réseaux, Infrastructure, Développement, Monitoring...), mais pas à Paramètres ni à la gestion des hôtes SSH.'
      ] },
      { type: 'p', text: "Chaque utilisateur gère son propre profil (nom, avatar, thème, mot de passe) depuis Mon compte, quel que soit son rôle." },
      { type: 'note', text: "Protection intégrée : impossible de supprimer, désactiver ou rétrograder le dernier compte administrateur — la console ne peut jamais se retrouver sans admin." }
    ]
  },
  {
    id: 'dashboard',
    title: 'Vue générale (tableau de bord)',
    blocks: [
      { type: 'p', text: "La page d'accueil affiche un score de santé global (moyenne pondérée des intégrations configurées) et la liste de toutes les intégrations avec leur statut. Cliquer sur une ligne ouvre directement le domaine correspondant." }
    ]
  },
  {
    id: 'settings-integrations',
    title: 'Configurer une intégration',
    blocks: [
      { type: 'p', text: "Paramètres → Intégrations (réservé aux administrateurs) liste les 9 intégrations disponibles. Pour chacune :" },
      { type: 'ol', items: [
        'Dépliez « Comment obtenir ces informations ? » pour des instructions précises (où trouver l\'URL, comment générer un token...).',
        'Renseignez les champs, puis Enregistrer.',
        'Utilisez Tester la connexion pour vérifier immédiatement que les identifiants fonctionnent.'
      ] },
      { type: 'note', text: "Les secrets (tokens, mots de passe) sont chiffrés (AES-256-GCM) avant d'être stockés et ne sont plus jamais renvoyés au navigateur en clair. Ressaisir un champ secret vide lors d'une sauvegarde conserve la valeur déjà enregistrée." }
    ]
  },
  {
    id: 'kubernetes',
    title: 'Kubernetes',
    blocks: [
      { type: 'p', text: "Liste les namespaces, pods et deployments du cluster configuré (onglet Charges de travail), et les services réseau (onglet Services : ClusterIP, NodePort, LoadBalancer). Le bouton Redémarrer sur un deployment déclenche un rolling restart (nouvelle annotation, sans changer l'image)." },
      { type: 'p', text: "Le bouton Logs sur un pod affiche ses 300 dernières lignes de log (rafraîchissable), utile pour diagnostiquer un pod en erreur sans quitter la console." },
      { type: 'note', text: "Le ServiceAccount utilisé doit avoir le rôle « edit » (pas seulement « view ») pour pouvoir redémarrer un déploiement — voir le guide dans Paramètres → Kubernetes." }
    ]
  },
  {
    id: 'network',
    title: 'Réseaux',
    blocks: [
      { type: 'p', text: 'Quatre onglets :' },
      { type: 'ul', items: [
        'Proxies & domaines : créez un reverse proxy (domaine → service:port), Appliquez-le (écrit la configuration sur Traefik ou HAProxy selon le moteur choisi), Testez la connexion HTTP, ou Supprimez-le.',
        'HAProxy : liste des backends et bascule d\'état des serveurs en temps réel (ready / drain / maint).',
        'Topologie : schéma reconstitué automatiquement à partir de ce qui est réellement configuré (proxies, HAProxy, Traefik, Kubernetes, Proxmox) — rien n\'est illustré tant qu\'aucune donnée réelle n\'est disponible.',
        'Certificats : statut de renouvellement des certificats cert-manager (dépend de l\'intégration Kubernetes).'
      ] },
      { type: 'note', text: "Limite connue : l'application d'un proxy sur HAProxy crée le backend/serveur, mais le rattachement à une règle de frontend (ACL) reste manuel pour l'instant. Sur Traefik, l'application écrit un fichier dans le dossier de configuration dynamique (voir Paramètres → Traefik)." }
    ]
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    blocks: [
      { type: 'p', text: 'Deux onglets :' },
      { type: 'ul', items: [
        'Proxmox : nœuds, VM et conteneurs LXC, avec actions démarrer/arrêter/redémarrer.',
        'Hôtes & agents : installation d\'agents (Prometheus Node Exporter, agent Wazuh) sur vos serveurs via SSH.'
      ] },
      { type: 'p', text: "Pour les hôtes & agents : copiez la clé publique affichée dans ~/.ssh/authorized_keys de l'utilisateur SSH de chaque hôte, ajoutez l'hôte (nom, adresse, port, utilisateur), puis Installer un agent." },
      { type: 'note', text: "Sécurité : le catalogue d'agents est fermé — l'interface ne peut jamais soumettre de commande arbitraire. Le script exact est toujours affiché avant exécution, et il faut cliquer explicitement sur Confirmer l'installation." }
    ]
  },
  {
    id: 'development',
    title: 'Développement',
    blocks: [
      { type: 'p', text: "Liez une application à un projet GitLab ou GitHub, une application Argo CD et un deployment Kubernetes pour suivre en un coup d'œil tout le pipeline : Git → CI/CD → Argo CD → Kubernetes → reverse proxy." },
      { type: 'p', text: "Le panneau Projets permet de parcourir vos dépôts GitLab/GitHub accessibles et de les ouvrir directement dans l'outil, sans avoir à deviner un identifiant de projet." },
      { type: 'p', text: "Chaque étape du pipeline propose un bouton « Ouvrir dans l'outil » qui pointe directement vers le pipeline/run Git ou l'application Argo CD concernée." }
    ]
  },
  {
    id: 'monitoring-security',
    title: 'Monitoring et Cybersécurité',
    blocks: [
      { type: 'p', text: "Monitoring affiche les alertes actives et les tableaux de bord Grafana. Cybersécurité affiche les agents Wazuh (actifs/déconnectés) et leur dernier contact." },
      { type: 'p', text: "Deux outils supplémentaires, réservés aux administrateurs, apparaissent en bas de la page Cybersécurité :" },
      { type: 'ul', items: [
        'IPs bannies : bloque une adresse IPv4 à l\'entrée de la console (toutes les routes, avant même l\'authentification). Impossible de bannir sa propre adresse — la console refuse pour éviter un verrouillage accidentel.',
        'Scans réseau : lance un vrai scan nmap (-sV) sur une IP ou un CIDR IPv4 de votre choix, pour découvrir les hôtes et services exposés sur votre réseau. Nécessite que nmap soit installé sur la machine qui héberge le backend ; sinon un message clair l\'indique. Limité à 5 scans toutes les 10 minutes (opération coûteuse en CPU/réseau).'
      ] }
    ]
  },
  {
    id: 'admin-users',
    title: 'Administration : Utilisateurs',
    blocks: [
      { type: 'p', text: "Paramètres → Utilisateurs (admin uniquement) : créez un compte (e-mail, nom, mot de passe initial, rôle), promouvez/rétrogradez, activez/désactivez, ou supprimez un compte existant." },
      { type: 'note', text: "Un compte désactivé ne peut plus se connecter, mais reste visible dans la liste (contrairement à une suppression). Utile pour couper temporairement un accès sans perdre l'historique." }
    ]
  },
  {
    id: 'admin-groups',
    title: 'Administration : Groupes & permissions',
    blocks: [
      { type: 'p', text: "Paramètres → Groupes & permissions : créez des groupes fonctionnels (ex. « ops », « audit »), affectez-leur des membres, et réglez pour chacun un niveau d'accès (Aucun / Lecture / Écriture / Admin) par domaine (Infrastructure, Réseaux, Sécurité, Automatisation)." },
      { type: 'note', text: "Cette matrice décrit et enregistre le modèle de droits souhaité ; son application fine à chaque route de la console (au-delà d'admin/utilisateur) est un chantier en cours — voir le Manuel, section Sécurité, pour l'état actuel des rôles réellement appliqués." }
    ]
  },
  {
    id: 'admin-inventory',
    title: 'Administration : Inventaire',
    blocks: [
      { type: 'p', text: "Paramètres → Inventaire : suivi des actifs matériels (serveurs, stockage, réseau) avec numéro de série, date d'acquisition, garantie et statut. Utile pour anticiper les fins de garantie et estimer la valeur du parc." }
    ]
  },
  {
    id: 'admin-platform',
    title: 'Administration : Plateforme',
    blocks: [
      { type: 'p', text: "Paramètres → Plateforme : identité de l'organisation (nom, affiché dans l'en-tête), fuseau horaire, langue et format de date par défaut, adresse de contact." },
      { type: 'note', text: "Langue et format de date sont enregistrés pour l'instant sans effet sur l'interface (pas de traduction multilingue à ce stade) ; seul le nom de l'organisation est déjà appliqué." }
    ]
  },
  {
    id: 'admin-identity',
    title: 'Administration : Connexion & identité',
    blocks: [
      { type: 'p', text: "Paramètres → Connexion & identité : durée de session et longueur minimale de mot de passe (appliquées immédiatement à toute la console), plus une configuration OIDC/LDAP enregistrée et testable (Tester l'issuer effectue une vraie requête vers le document de découverte OpenID)." },
      { type: 'note', text: "Important : configurer un fournisseur OIDC/LDAP ici l'enregistre et permet de le tester, mais n'active pas encore un second chemin de connexion — seul le mot de passe local authentifie aujourd'hui. C'est une limite volontaire (voir Sécurité de la console)." }
    ]
  },
  {
    id: 'admin-git',
    title: 'Administration : Services Git',
    blocks: [
      { type: 'p', text: "Paramètres → Services Git : choisissez la forge principale (GitLab ou GitHub) utilisée par défaut pour lier de nouveaux projets, et testez la connexion à chaque forge déjà configurée dans Intégrations & outils." },
      { type: 'note', text: "La réplication automatique (miroirs) entre forges n'est pas encore implémentée — l'emplacement est prévu dans l'interface pour quand elle le sera." }
    ]
  },
  {
    id: 'admin-system',
    title: 'Administration : Système',
    blocks: [
      { type: 'p', text: 'Paramètres → Système regroupe :' },
      { type: 'ul', items: [
        'Version : commit/branche actuels, et Vérifier les mises à jour (compare avec origin en lecture seule — la console ne s\'auto-met-à-jour et ne redémarre jamais elle-même).',
        'Sauvegardes : copie horodatée de la base, planifiée chaque nuit à 3h (14 dernières conservées), ou déclenchée manuellement. Téléchargez un fichier .db, ou Importez-en un pour le rendre disponible à la restauration.',
        'Restaurer une sauvegarde remplace toutes les données actuelles — une sauvegarde de sécurité de l\'état courant est créée automatiquement avant, et votre mot de passe est redemandé pour confirmer.'
      ] },
      { type: 'p', text: "Paramètres → Journal liste les 200 dernières actions administratives sensibles (connexions, gestion des comptes, proxies, hôtes, sauvegardes, configuration des intégrations) avec l'auteur et l'horodatage." }
    ]
  },
  {
    id: 'security',
    title: 'Sécurité de la console',
    blocks: [
      { type: 'ul', items: [
        'Secrets (tokens, mots de passe d\'intégration) chiffrés au repos (AES-256-GCM) et jamais renvoyés en clair au navigateur.',
        'Sessions par cookie httpOnly signé (JWT), durée configurable dans Paramètres → Connexion & identité (12h par défaut).',
        'Limite de débit sur les routes sensibles (connexion, mot de passe, paramètres, sauvegardes, hôtes, identité) contre le bruteforce.',
        'Restauration de sauvegarde protégée par re-saisie du mot de passe.',
        'Installation d\'agents SSH limitée à un catalogue fermé de scripts, avec clé dédiée à la console (jamais de mot de passe par hôte).',
        'Rôles réellement appliqués aujourd\'hui : administrateur / utilisateur (deux niveaux, vérifiés sur chaque route sensible). La matrice de permissions par groupe (Groupes & permissions) enregistre un modèle de droits plus fin, mais son application automatique à chaque route est un chantier en cours.'
      ] }
    ]
  },
  {
    id: 'deployment',
    title: 'Déploiement en production',
    blocks: [
      { type: 'p', text: "Le moyen le plus simple : Docker Compose, à la racine du dépôt." },
      { type: 'code', text: 'cp .env.example .env   # définir au minimum JWT_SECRET\ndocker compose up -d' },
      { type: 'p', text: "Un seul port est exposé (8080 par défaut, configurable via CONSOLE_PORT) : nginx sert le frontend et transmet /api/ au backend en interne. Placez ensuite ce port derrière votre reverse proxy habituel (Traefik/HAProxy) sur un domaine dédié." },
      { type: 'note', text: "Sans ADMIN_EMAIL/ADMIN_PASSWORD dans .env, l'assistant de première configuration s'affichera au premier accès — c'est le comportement recommandé pour ne pas avoir de mot de passe par défaut dans un fichier." }
    ]
  },
  {
    id: 'troubleshooting',
    title: 'Dépannage',
    blocks: [
      { type: 'ul', items: [
        '« Non configuré » persiste après avoir enregistré : vérifiez avec Tester la connexion — le message d\'erreur précise généralement la cause (URL injoignable, identifiants invalides...).',
        'Déconnecté(e) de façon inattendue : la session expire après 12h ; reconnectez-vous simplement.',
        'Erreur 403 sur une action : votre compte n\'a pas le rôle administrateur requis pour cette action.',
        'Une sauvegarde restaurée ne semble pas s\'appliquer : rafraîchissez la page — certaines vues sont mises en cache côté navigateur pendant quelques secondes.',
        'Un agent SSH ne s\'installe pas : vérifiez que la clé publique de la console est bien dans ~/.ssh/authorized_keys de l\'utilisateur SSH renseigné, et que cet utilisateur peut exécuter les commandes du script (sudo sans mot de passe si l\'utilisateur n\'est pas root).'
      ] }
    ]
  }
];
