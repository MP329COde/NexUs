// Contenu du manuel : structure de données plutôt que du JSX répété, pour que
// chaque section reste facile à relire/étendre sans toucher au composant.
// type 'p' = paragraphe, 'ul' = liste à puces, 'ol' = liste numérotée,
// 'code' = bloc de code/commande, 'note' = encadré ton "info".
export const MANUAL_SECTIONS = [
  {
    id: 'overview',
    group: 'Démarrage',
    title: "Vue d'ensemble",
    blocks: [
      { type: 'p', text: "Nexus Console centralise le pilotage de votre infrastructure homelab : Kubernetes, Argo CD, HAProxy, Traefik, GitLab, GitHub, Proxmox, Wazuh et Grafana, depuis une seule interface, derrière votre propre reverse proxy." },
      { type: 'p', text: "Le frontend (React) ne parle jamais directement à vos services d'infrastructure : toutes les requêtes passent par le backend (Express), qui détient les identifiants chiffrés et fait le lien avec chaque outil." },
      { type: 'note', text: "Principe important : tant qu'une intégration n'est pas configurée dans Paramètres, la page correspondante affiche « Non configuré » plutôt que de planter. La console est utilisable dès l'installation, sans dépendre d'une infrastructure déjà branchée." }
    ]
  },
  {
    id: 'first-run',
    group: 'Démarrage',
    title: 'Premier démarrage',
    blocks: [
      { type: 'p', text: "Au tout premier accès, si aucun compte n'existe encore, la console affiche automatiquement un assistant de configuration (/setup) : nom de la console, votre nom, e-mail et mot de passe (8 caractères minimum). Le compte créé est administrateur." },
      { type: 'note', text: "Cet assistant ne peut apparaître qu'une seule fois : dès qu'un compte existe, /setup redirige vers la page de connexion. Il n'y a pas de mot de passe par défaut devinable." },
      { type: 'p', text: "Alternative pour un déploiement automatisé (Docker, script d'installation) : définissez ADMIN_EMAIL et ADMIN_PASSWORD dans les variables d'environnement du backend avant le premier démarrage — le compte admin sera créé automatiquement, sans passer par l'assistant." }
    ]
  },
  {
    id: 'roles',
    group: 'Démarrage',
    title: 'Rôles et permissions',
    blocks: [
      { type: 'p', text: 'Chaque compte a un rôle :' },
      { type: 'ul', items: [
        'Administrateur : accès complet, y compris Paramètres (intégrations, utilisateurs, système, journal d\'audit) et l\'installation d\'agents via SSH.',
        'Utilisateur : accède à la console et à toutes les pages opérationnelles (Kubernetes, Réseaux, Infrastructure, Développement, Monitoring...), mais pas à Paramètres ni à la gestion des hôtes SSH.'
      ] },
      { type: 'p', text: "Chaque utilisateur gère son propre profil (nom, avatar, thème, mot de passe) depuis Mon compte, quel que soit son rôle." },
      { type: 'p', text: "Ce que le rôle contrôle concrètement dans l'interface : les entrées de menu et boutons réservés à l'administration (Paramètres, gestion des hôtes SSH, IPs bannies, scans réseau) sont masqués côté navigation pour un compte Utilisateur, et les routes correspondantes du serveur refusent la requête (erreur 403) même en cas d'accès direct à l'URL — la protection n'est donc pas seulement visuelle." },
      { type: 'note', text: "Protection intégrée : impossible de supprimer, désactiver ou rétrograder le dernier compte administrateur — la console ne peut jamais se retrouver sans admin." },
      { type: 'note', text: "Paramètres → Groupes & permissions permet de préparer une matrice de droits plus fine (Aucun/Lecture/Écriture/Admin par domaine), mais cette matrice n'est aujourd'hui qu'enregistrée : elle ne modifie pas encore ce qu'un compte peut réellement voir ou faire. Seul le rôle Administrateur/Utilisateur est appliqué en pratique — voir la section Sécurité de la console pour le détail." }
    ]
  },
  {
    id: 'dashboard',
    group: 'Démarrage',
    title: 'Vue générale (tableau de bord)',
    blocks: [
      { type: 'p', text: "Quatre indicateurs en tête de page : score de santé pondéré, nombre de nœuds Proxmox en ligne, alertes ouvertes (Grafana + agents Wazuh déconnectés) et heure de dernière actualisation." },
      { type: 'p', text: "« Charge de l'infrastructure » (badge LIVE) trace en direct le CPU et la RAM moyens de vos nœuds Proxmox en ligne, échantillonnés côté serveur toutes les 30 secondes ; « Répartition des charges » compte vos machines virtuelles et conteneurs LXC (Proxmox) et vos pods (Kubernetes) sous forme de donut. Ces deux cartes affichent « Non configuré » tant que Proxmox (et Kubernetes pour les pods) ne le sont pas — il n'existe pas d'intégration Docker dans la console, ce segment reste donc toujours vide." },
      { type: 'p', text: "« Hôtes critiques » (réservé aux administrateurs) liste les hôtes cochés « Hôte critique » depuis Infrastructure → Hôtes & agents : rôle, joignabilité (sonde réseau réelle), et — quand l'hôte le permet (Linux, lecture via SSH) — CPU, RAM et uptime en direct. « Activité en direct » fusionne le journal d'audit et les sauvegardes créées, triés du plus récent au plus ancien." },
      { type: 'p', text: "« Disponibilité 24h » affiche une ligne par service coché « Important » depuis Réseaux → Proxies & domaines (nom à gauche, 24 points à droite, un par heure), avec un bouton légende en haut à droite du panneau. « Alertes ouvertes » reprend les alertes Grafana et les agents Wazuh déconnectés, triées par sévérité (P1/P2/P3, déduite du label de sévérité Grafana)." },
      { type: 'note', text: "Rien de tout cela n'est fabriqué : quand une donnée n'existe pas encore (aucun hôte/service marqué important, intégration non configurée), la carte l'indique explicitement plutôt que d'afficher un chiffre inventé. Les relevés horaires (disponibilité par service) démarrent à l'installation de la console et se remplissent heure après heure." },
      { type: 'note', text: "Le statut détaillé de chaque intégration (Kubernetes, Argo CD, HAProxy, GitLab, GitHub, Proxmox, Traefik, Cert-Manager, Grafana, Wazuh) a été déplacé dans Paramètres → Intégrations & outils, juste au-dessus des formulaires de configuration — il n'apparaît plus sur la page d'accueil." }
    ]
  },
  {
    id: 'search',
    group: 'Démarrage',
    title: 'Recherche globale',
    blocks: [
      { type: 'p', text: "Le champ de recherche du bandeau (ou le raccourci ⌘K sur Mac, Ctrl K sur Windows/Linux) ouvre une palette de commandes pour atteindre n'importe quelle page, proxy, hôte ou dépôt Git sans naviguer dans les menus." },
      { type: 'p', text: "La recherche tolère les fautes de frappe et d'orthographe courantes (un ou deux caractères manquants, inversés ou en trop) : elle reste utile même si vous ne vous souvenez plus exactement du nom d'un module. Les résultats les plus proches de votre saisie remontent en premier." },
      { type: 'ul', items: [
        'Pages : toutes les pages de la console, y compris les onglets de Paramètres pour les administrateurs.',
        'Proxies et hôtes : chargés dynamiquement depuis vos données réelles (pas une liste figée), donc à jour dès que vous en ajoutez.',
        'Dépôts : vos projets GitLab/GitHub accessibles, si ces intégrations sont configurées.',
        'Mon compte / Paramètres → Plateforme : trouvables aussi en tapant votre propre nom, e-mail, ou le nom de votre organisation.'
      ] },
      { type: 'note', text: "Les entrées réservées aux administrateurs (Paramètres et ses onglets) n'apparaissent pas dans les résultats d'un compte Utilisateur." }
    ]
  },
  {
    id: 'notifications',
    group: 'Démarrage',
    title: 'Notifications',
    blocks: [
      { type: 'p', text: "L'icône cloche du bandeau affiche l'historique des notifications reçues pendant la session en cours (alertes, résultats d'actions, erreurs) : elle se vide au rechargement de la page, ce n'est pas un journal persistant — pour un historique durable des actions d'administration, voir Paramètres → Journal." },
      { type: 'p', text: "Un point rouge sur la cloche signale qu'au moins une notification est en attente ; « Effacer » vide la liste sans rien supprimer côté serveur." }
    ]
  },
  {
    id: 'account',
    group: 'Démarrage',
    title: 'Mon compte',
    blocks: [
      { type: 'p', text: "Accessible depuis l'avatar en haut à droite, cette page regroupe trois blocs, pour tous les rôles :" },
      { type: 'ul', items: [
        'Profil : nom affiché et avatar (emoji ou initiales colorées).',
        'Apparence : bascule entre thème clair et sombre (aussi accessible via l\'icône soleil/lune du bandeau), mémorisée par compte.',
        'Sécurité : changement de votre propre mot de passe (ancien mot de passe requis).'
      ] },
      { type: 'note', text: "Un administrateur peut réinitialiser le mot de passe d'un autre compte depuis Paramètres → Utilisateurs, mais ne peut pas voir votre mot de passe actuel — les mots de passe ne sont jamais stockés en clair." }
    ]
  },
  {
    id: 'report',
    group: 'Démarrage',
    title: 'Rapport de santé',
    blocks: [
      { type: 'p', text: "Vue imprimable en une page, indépendante du thème clair/sombre pour rester lisible sur papier : score de santé global, statut de chaque intégration, alertes Grafana actives et résumé Wazuh au moment de l'ouverture de la page." },
      { type: 'p', text: "Pour l'exporter en PDF : ouvrez Rapport, puis utilisez l'impression du navigateur (⌘P / Ctrl P) et choisissez « Enregistrer en PDF » comme destination. Aucune génération PDF ne se fait côté serveur." }
    ]
  },
  {
    id: 'settings-integrations',
    group: 'Modules opérationnels',
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
    group: 'Modules opérationnels',
    title: 'Kubernetes',
    blocks: [
      { type: 'p', text: "Liste les namespaces, pods et deployments du cluster configuré (onglet Charges de travail), et les services réseau (onglet Services : ClusterIP, NodePort, LoadBalancer). Le bouton Redémarrer sur un deployment déclenche un rolling restart (nouvelle annotation, sans changer l'image)." },
      { type: 'p', text: "Le bouton Logs sur un pod affiche ses 300 dernières lignes de log (rafraîchissable), utile pour diagnostiquer un pod en erreur sans quitter la console." },
      { type: 'p', text: "Basculer de namespace (sélecteur en haut de page) recharge la liste des pods et deployments pour ce namespace uniquement — utile pour isoler un environnement (ex. « prod » vs « staging ») sur un même cluster." },
      { type: 'note', text: "Le ServiceAccount utilisé doit avoir le rôle « edit » (pas seulement « view ») pour pouvoir redémarrer ou supprimer un pod/deployment — voir le guide dans Paramètres → Kubernetes." },
      { type: 'note', text: "Actuellement, toute personne connectée (rôle Utilisateur inclus) peut redémarrer un deployment ou supprimer un pod depuis cette page : ce n'est pas réservé aux administrateurs. Gardez-en compte si vous invitez des comptes Utilisateur sur un cluster de production." }
    ]
  },
  {
    id: 'network',
    group: 'Modules opérationnels',
    title: 'Réseaux',
    blocks: [
      { type: 'p', text: "Cinq onglets, Topologie en page d'arrivée :" },
      { type: 'ul', items: [
        'Topologie : schéma reconstitué automatiquement à partir de ce qui est réellement configuré (proxies, HAProxy, Traefik, Kubernetes, Proxmox — nœuds ET machines virtuelles/conteneurs LXC réels de chaque nœud) — rien n\'est illustré tant qu\'aucune donnée réelle n\'est disponible. Cliquez sur un nœud pour aller directement le gérer.',
        'Proxies & domaines : créez un reverse proxy (domaine → service:port), Appliquez-le (écrit la configuration sur Traefik ou HAProxy selon le moteur choisi), Testez la connexion HTTP, ou Supprimez-le. Cochez Important pour qu\'il apparaisse dans la carte « Disponibilité 24h » de l\'accueil (relevé horaire réel de la même URL testée manuellement). Bouton DNS par domaine : pointe le domaine vers une adresse cible en écrivant réellement l\'enregistrement chez le fournisseur DNS configuré (OVH pour une zone classique, DuckDNS pour un domaine *.duckdns.org — voir Paramètres → Intégrations).',
        'HAProxy : liste des backends et bascule d\'état des serveurs en temps réel (ready / drain / maint).',
        'Certificats : statut de renouvellement des certificats cert-manager (dépend de l\'intégration Kubernetes).',
        'Pare-feu : trafic API de la console en temps réel (rafraîchi toutes les 5 s) et détection des adresses qui accumulent des requêtes en échec (401/403/429). Réservé aux administrateurs pour la détection et le blocage ; le trafic récent reste visible par tous.'
      ] },
      { type: 'note', text: "Pour un proxy sur moteur HAProxy, Appliquer crée le backend/serveur mais pas le routage : cliquez ensuite sur Frontend (visible uniquement pour les proxies HAProxy) pour choisir un frontend HAProxy et compléter automatiquement le rattachement (ACL sur l'en-tête Host + règle de commutation). Sur Traefik, l'application écrit directement un fichier dans le dossier de configuration dynamique (voir Paramètres → Traefik), sans étape supplémentaire." },
      { type: 'note', text: "Comme pour Kubernetes, créer/appliquer/supprimer un proxy ou basculer un serveur HAProxy (ready/drain/maint) n'est pas réservé aux administrateurs aujourd'hui : tout compte connecté peut le faire." },
      { type: 'note', text: "Pare-feu : le blocage automatique (bouton en haut de la page) bannit une adresse dès qu'elle dépasse le seuil de requêtes suspectes, en s'appuyant sur la même liste que Cybersécurité → IPs bannies — les deux pages partagent le même banlist." }
    ]
  },
  {
    id: 'infrastructure',
    group: 'Modules opérationnels',
    title: 'Infrastructure',
    blocks: [
      { type: 'p', text: 'Deux onglets :' },
      { type: 'ul', items: [
        'Proxmox : nœuds, VM et conteneurs LXC, avec actions démarrer/arrêter/redémarrer.',
        'Hôtes & agents : installation d\'agents (Prometheus Node Exporter, agent Wazuh) sur vos serveurs via SSH — réservé aux administrateurs.'
      ] },
      { type: 'p', text: "Pour les hôtes & agents : copiez la clé publique affichée dans ~/.ssh/authorized_keys de l'utilisateur SSH de chaque hôte, ajoutez l'hôte (nom, adresse, port, utilisateur), puis Installer un agent." },
      { type: 'p', text: "Chaque hôte peut aussi recevoir un Rôle (texte libre, ex. « Hyperviseur Proxmox ») et être coché Hôte critique : les hôtes critiques apparaissent alors dans la carte « Hôtes critiques » de la page d'accueil, avec un test de joignabilité réel et — sur un hôte Linux joignable en SSH — CPU/RAM/uptime lus en direct toutes les 30 secondes." },
      { type: 'note', text: "Sécurité : le catalogue d'agents est fermé — l'interface ne peut jamais soumettre de commande arbitraire. Le script exact est toujours affiché avant exécution, et il faut cliquer explicitement sur Confirmer l'installation." },
      { type: 'note', text: "Démarrer/arrêter/redémarrer une VM ou un conteneur Proxmox n'est, comme pour Kubernetes, pas limité aux administrateurs : tout compte connecté y a accès depuis cette page." }
    ]
  },
  {
    id: 'development',
    group: 'Modules opérationnels',
    title: 'Développement',
    blocks: [
      { type: 'p', text: "Liez une application à un projet GitLab ou GitHub, une application Argo CD et un deployment Kubernetes pour suivre en un coup d'œil tout le pipeline : Git → CI/CD → Argo CD → Kubernetes → reverse proxy." },
      { type: 'p', text: "Le panneau Projets permet de parcourir vos dépôts GitLab/GitHub accessibles et de les ouvrir directement dans l'outil, sans avoir à deviner un identifiant de projet." },
      { type: 'p', text: "Chaque étape du pipeline propose un bouton « Ouvrir dans l'outil » qui pointe directement vers le pipeline/run Git ou l'application Argo CD concernée." },
      { type: 'p', text: "Outils installés : détecte quels outils de développement courants (Git, Docker, kubectl, Node.js, Helm, Terraform...) sont présents sur la machine qui héberge le backend de la console — pas sur vos postes de développement individuels, que la console ne peut pas inspecter." },
      { type: 'p', text: "Générateur de mots de passe : génération 100% locale au navigateur (jamais envoyée au serveur), longueur et jeu de caractères réglables. Adapté à un mot de passe de dev ponctuel." },
      { type: 'note', text: "Pour des secrets de production, utilisez un vrai gestionnaire de secrets dédié (Vault, Bitwarden/Vaultwarden...) plutôt que ce générateur — volontairement simple, il ne remplace pas un coffre-fort avec contrôle d'accès et rotation." },
      { type: 'p', text: "Mots de passe (en bas de la page Développement) : deux niveaux distincts. « Mots de passe dev » sont visibles par tout développeur connecté (accès aux machines de test partagées). « Mots de passe production » sont réservés aux administrateurs, générés automatiquement côté serveur (256 caractères aléatoires) et ne sont révélés qu'après avoir retapé votre propre mot de passe (ré-authentification)." },
      { type: 'note', text: "Cette ré-authentification (« step-up ») protège contre une session laissée ouverte sur un poste partagé : même connecté, il faut reconfirmer son mot de passe pour voir un secret de production en clair." },
      { type: 'note', text: "Sur ces vues globales (tous dépôts confondus), relancer un pipeline et approuver une merge request/pull request sont réservés aux administrateurs — la mise en miroir GitLab → GitHub (Paramètres → Services Git) l'est également. Depuis la fiche d'un projet précis en revanche, ces mêmes actions sont ouvertes dès le rôle developer/maintainer selon le rôle attribué sur ce projet (voir « Organisations et Projets » ci-dessous) — deux niveaux d'accès distincts pour la même action, selon qu'elle est déclenchée globalement ou dans le contexte d'un projet." }
    ]
  },
  {
    id: 'projects-rbac',
    group: 'Modules opérationnels',
    title: 'Organisations et Projets',
    blocks: [
      { type: 'p', text: "Au-delà du rôle global Administrateur/Utilisateur, chaque projet a son propre modèle de permissions à quatre niveaux, du moins au plus privilégié : viewer (lecture seule) < developer (déclarer un incident, proposer un changement, créer des tâches) < maintainer (approuver un changement, gérer les membres, relancer un job) < owner (approuver un changement production, supprimer le projet). Un membre peut être retiré du projet directement depuis le panneau Équipe (icône ✕)." },
      { type: 'note', text: "Un administrateur de plateforme garde toujours un accès owner implicite à tous les projets. Un owner/admin d'organisation a de même un accès owner implicite à tous les projets de son organisation." },
      { type: 'p', text: "Une organisation a elle-même des membres (distincts des membres d'un projet précis) : owner/admin/member, gérés depuis Organisations → icône « Membres » sur chaque carte. Ajouter un membre se fait depuis la liste complète des comptes (réservé aux administrateurs de plateforme). Le dernier propriétaire d'une organisation ne peut pas être rétrogradé ni retiré, pour éviter une organisation sans propriétaire." },
      { type: 'p', text: "Le statut d'un projet (Actif / En pause / Archivé) se change depuis un sélecteur en haut de sa fiche, réservé owner/maintainer. La suppression d'un projet ou d'une organisation est irréversible et réservée à leur owner — supprimer une organisation qui contient encore des projets exige une confirmation renforcée explicite." },
      { type: 'p', text: "Organisations → Projets → Environnements : un projet appartient à une organisation et peut avoir plusieurs environnements (dev, staging, production...). Un environnement marqué production exige le rôle owner pour toute action dessus (synchronisation, rollback, approbation d'un changement le ciblant) — un maintainer peut proposer ou exécuter, mais pas approuver." },
      { type: 'p', text: "Incidents : suivi d'un problème survenu (gravité, état, ressource affectée), avec un lien optionnel vers un runbook externe (wiki, Confluence) affiché directement sur la fiche. Clore un incident exige de documenter sa résolution — impossible de le fermer silencieusement." },
      { type: 'p', text: "Changements contrôlés : une modification planifiée (pas un problème), avec impact attendu, décision et exécution distinctes. Proposer est ouvert à developer+ ; approuver/rejeter exige maintainer+ (owner si l'environnement visé est en production) ; exécuter reste bloqué tant que le changement n'est pas approuvé." },
      { type: 'p', text: "Fenêtres de maintenance : période annoncée sur un projet, purement informative — elle n'accorde aucune dispense sur les autres garde-fous (une fenêtre active ne contourne jamais l'approbation owner requise sur un changement production)." },
      { type: 'p', text: "Jobs asynchrones : les opérations longues (synchronisation/rollback Argo CD, scan réseau) s'exécutent en tâche de fond et sont suivies dans le panneau « Jobs » de la fiche projet. Un job en échec peut être relancé explicitement (mêmes droits que l'action d'origine) sans jamais perdre la trace de l'échec initial — la relance crée un nouveau job, l'original reste consultable." },
      { type: 'note', text: "Un compte qui n'est membre d'aucun projet voit sa page d'accueil afficher « Mes projets » (incidents ouverts, changements en attente de sa décision, maintenances à venir sur ses propres projets) au lieu de la vue d'ensemble administrateur, réservée aux comptes admin." }
    ]
  },
  {
    id: 'monitoring-security',
    group: 'Modules opérationnels',
    title: 'Monitoring et Cybersécurité',
    blocks: [
      { type: 'p', text: "Monitoring affiche les alertes actives (filtrables par sévérité), les tableaux de bord Grafana, et — si Proxmox est aussi configuré — la charge CPU/RAM en direct de chaque hôte. Si Grafana n'est pas encore configuré, un bouton « Installer Grafana automatiquement » propose de déployer un conteneur Grafana officiel sur un hôte déjà géré (Infrastructure → Hôtes), avec aperçu du script exécuté avant confirmation." },
      { type: 'p', text: "Cybersécurité affiche les agents Wazuh (actifs/déconnectés) et leur dernier contact, ainsi qu'un panneau « Conformité (SCA) » : audits de configuration (CIS Benchmarks) réellement remontés par chaque agent actif, avec score de réussite par politique." },
      { type: 'p', text: "Deux outils supplémentaires, réservés aux administrateurs, apparaissent en bas de la page Cybersécurité :" },
      { type: 'ul', items: [
        'IPs bannies : bloque une adresse IPv4 à l\'entrée de la console (toutes les routes, avant même l\'authentification). Impossible de bannir sa propre adresse — la console refuse pour éviter un verrouillage accidentel.',
        'Scans réseau : lance un vrai scan nmap (-sV) sur une IP ou un CIDR IPv4 de votre choix, pour découvrir les hôtes et services exposés sur votre réseau. Nécessite que nmap soit installé sur la machine qui héberge le backend ; sinon un message clair l\'indique. Limité à 5 scans toutes les 10 minutes (opération coûteuse en CPU/réseau).'
      ] }
    ]
  },
  {
    id: 'storage',
    group: 'Modules opérationnels',
    title: 'Stockage',
    blocks: [
      { type: 'p', text: "Suivi déclaratif de vos volumes, NAS, pools ZFS et partages : une liste que vous tenez à jour manuellement (nom, type, hôte, capacité et espace utilisé en Go) — utile pour du stockage hors Proxmox." },
      { type: 'p', text: "Chaque volume affiche une barre de progression colorée selon le taux de remplissage (vert en dessous de 65 %, orange entre 65 et 85 %, rouge au-delà de 85 %) et une icône d'alerte au-delà de 85 %." },
      { type: 'p', text: "Si Proxmox est configuré, un panneau « Stockage Proxmox » distinct affiche l'état réel de chaque stockage (dir, lvmthin, zfspool, nfs...) par nœud — used/avail rapportés directement par l'API, rafraîchi toutes les 30 s, pas de saisie manuelle." },
      { type: 'p', text: "Le panneau « Sauvegardes de la console » (administrateurs uniquement) résume les sauvegardes de la base Nexus elle-même (nexus.db) — nombre conservé, taille totale, date de la plus récente — avec un lien direct vers Paramètres → Système pour les gérer." },
      { type: 'note', text: "Le suivi déclaratif (volumes/NAS/pools/partages) n'est pas mesuré automatiquement : si la capacité affichée est fausse, c'est qu'elle n'a pas été mise à jour depuis le dernier changement réel. Le panneau « Stockage Proxmox », lui, reflète toujours l'état réel." }
    ]
  },
  {
    id: 'code-overview',
    group: 'Manuel de code',
    title: 'Structure du dépôt',
    blocks: [
      { type: 'p', text: "Nexus Console est un monorepo à deux couches : « backend/ » (API Node.js/Express, seule couche autorisée à parler aux services d'infrastructure) et « frontend/ » (console React/Vite, qui ne parle qu'au backend via /api). Le frontend ne contacte jamais Kubernetes, Proxmox, GitLab, etc. directement." },
      { type: 'code', text: "backend/\n  src/routes/*.routes.js        un fichier de routes par domaine\n  src/services/*.js             logique métier\n  src/services/integrations/*   un module par outil externe\n  src/store/*.js                persistance JSON (backend/data, ignoré par git)\n  src/db/                       socle relationnel PostgreSQL + migrations\n  src/middleware/               auth, accès projet, etc.\nfrontend/\n  src/pages/**/*.jsx            une page par écran, groupées par section\n  src/components/**/*.jsx       composants partagés (ui/, vault/, ...)\n  src/App.jsx / router          déclaration des routes et du menu latéral" },
      { type: 'note', text: "Ajouter une intégration future = un fichier dans services/integrations/, une entrée dans settingsStore.js (SECRET_FIELDS), une route — sans toucher au reste. Ce patron est systématique dans tout le backend, à respecter pour toute nouvelle intégration." }
    ]
  },
  {
    id: 'code-jsx-react',
    group: 'Manuel de code',
    title: 'JSX, pages et composants',
    blocks: [
      { type: 'p', text: "Chaque écran est une page fonctionnelle dans frontend/src/pages/<Section>/<Nom>Page.jsx, sans classe, avec des hooks React standards (useState, useEffect) — pas de state manager externe. Les sous-écrans d'une même section (ex. Kubernetes, Réseau) partagent un <Section>Layout.jsx qui pose la barre latérale secondaire et le fil d'ariane de la section." },
      { type: 'p', text: "Les composants réutilisables (boutons, icônes, avatar, cartes) vivent dans components/ui/ ; les composants liés à un domaine précis (ex. coffre-fort) dans components/<domaine>/. Une page compose des composants, elle n'en redéfinit pas la logique en double." },
      { type: 'code', text: "export default function ExamplePage() {\n  const [items, setItems] = useState([]);\n  const [loading, setLoading] = useState(true);\n\n  useEffect(() => {\n    api.get('/example').then((res) => setItems(res.data)).finally(() => setLoading(false));\n  }, []);\n\n  return (\n    <div className=\"card\" style={{ padding: 20 }}>\n      {/* le style inline avec les variables CSS var(--...) est la convention du projet */}\n    </div>\n  );\n}" },
      { type: 'note', text: "Convention du projet : styles en `style={{...}}` inline avec des variables CSS (var(--primary), var(--text-muted), var(--surface-2)...) pour rester compatible thème clair/sombre/auto, plutôt que des classes CSS dédiées par page." },
      { type: 'p', text: "Contenu de type « manuel »/documentation (comme cette page) est séparé du composant d'affichage : un fichier *Content.js exporte des données structurées (groupes, sections, blocs), le composant .jsx ne fait que les afficher. Le même patron est réutilisé pour toute page fortement éditoriale." }
    ]
  },
  {
    id: 'code-backend',
    group: 'Manuel de code',
    title: 'Patrons backend',
    blocks: [
      { type: 'p', text: "Chaque module d'intégration (services/integrations/xService.js) expose au minimum getStatus() et répond { configured: false } plutôt que d'échouer si l'outil n'est pas encore paramétré — la console doit rester utilisable dès l'installation, jamais un écran cassé." },
      { type: 'p', text: "Deux couches de persistance coexistent délibérément (stratégie « strangler ») : le store JSON/SQLite historique (backend/data/, secrets chiffrés AES-256-GCM via src/utils/crypto.js, jamais renvoyés en clair au frontend) et le socle relationnel PostgreSQL (organisations, projets, rôles, environnements) activé par la variable DATABASE_URL. Les routes /api/projects/:id/* passent par middleware/projectAccess.js, avec repli automatique sur l'ancien modèle si le projet n'est pas encore migré vers Postgres." },
      { type: 'p', text: "Rôles projet du moins au plus privilégié : viewer < developer < maintainer < owner (voir « Organisations et Projets » ci-dessus) — toujours vérifier le rôle le plus proche de la ressource visée, jamais seulement requireAuth, pour toute nouvelle route touchant un projet ou un environnement." },
      { type: 'p', text: "Les opérations longues (sync/rollback ArgoCD, scans réseau ou sécurité) passent par services/jobService.js : exécution asynchrone persistée, suivie via GET /api/projects/:id/jobs/:jobId ou GET /api/jobs/:id, jamais bloquantes sur la requête HTTP, jamais de statut fantôme au redémarrage." },
      { type: 'note', text: "Principe non négociable du projet : aucune donnée simulée. Une page pour laquelle l'intégration réelle n'existe pas encore doit afficher clairement « Démonstration » ou « Non intégré » (voir SupplyChainPage, ReleasesPage) plutôt que d'inventer des résultats." }
    ]
  },
  {
    id: 'code-conventions',
    group: 'Manuel de code',
    title: 'Conventions et mise à jour du manuel',
    blocks: [
      { type: 'p', text: "Migrations SQL versionnées et numérotées séquentiellement dans backend/src/db/migrations/, appliquées automatiquement au démarrage (idempotentes, une transaction par fichier) — on ne modifie jamais une migration déjà appliquée, on en ajoute une nouvelle." },
      { type: 'p', text: "fonctions.md, à la racine du dépôt, est l'inventaire des fonctionnalités réellement présentes dans le code (à distinguer des idées encore à l'état de spécification dans base-dev/) — il doit être mis à jour à chaque fonctionnalité ajoutée ou modifiée." },
      { type: 'ul', items: [
        'Nommage : PascalCase pour les composants/pages (ProjectDetailPage.jsx), camelCase pour les services et fonctions (deploymentService.js), kebab/plat pour les routes (projects.routes.js).',
        'Toute nouvelle route sensible doit être ajoutée avec son garde-fou de rôle dès l\'écriture (pas « à sécuriser plus tard ») — voir les failles corrigées documentées dans fonctions.md pour l\'historique des oublis de ce type.',
        'Un composant qui dépasse largement la taille d\'un écran doit être découpé en sous-composants dans le même dossier plutôt que garder toute la logique dans la page.'
      ] },
      { type: 'note', text: "Ce manuel de code documente les patrons déjà en place, pas une cible théorique : à mettre à jour dès qu'un nouveau patron structurant apparaît dans le code (nouvelle convention, nouvelle couche), pas de façon isolée à la fin d'un cycle." }
    ]
  },
  {
    id: 'admin-users',
    group: 'Administration',
    title: 'Administration : Utilisateurs',
    blocks: [
      { type: 'p', text: "Paramètres → Utilisateurs (admin uniquement) : créez un compte (e-mail, nom, mot de passe initial, rôle), promouvez/rétrogradez, activez/désactivez, ou supprimez un compte existant." },
      { type: 'note', text: "Un compte désactivé ne peut plus se connecter, mais reste visible dans la liste (contrairement à une suppression). Utile pour couper temporairement un accès sans perdre l'historique." }
    ]
  },
  {
    id: 'admin-groups',
    group: 'Administration',
    title: 'Administration : Groupes & permissions',
    blocks: [
      { type: 'p', text: "Paramètres → Groupes & permissions : créez des groupes fonctionnels (ex. « ops », « audit »), affectez-leur des membres, et réglez pour chacun un niveau d'accès (Aucun / Lecture / Écriture / Admin) par domaine (Infrastructure, Réseaux, Sécurité, Automatisation)." },
      { type: 'p', text: "Cette page reste utile même sans effet automatique sur les droits : elle sert de document de référence pour décrire, par écrit, quel groupe devrait avoir accès à quoi — un point de départ pour la revue de sécurité, même si l'application technique n'est pas encore branchée." },
      { type: 'note', text: "Cette matrice décrit et enregistre le modèle de droits souhaité ; son application fine à chaque route de la console (au-delà d'admin/utilisateur) est un chantier en cours — voir le Manuel, section Sécurité, pour l'état actuel des rôles réellement appliqués." }
    ]
  },
  {
    id: 'admin-inventory',
    group: 'Administration',
    title: 'Administration : Inventaire',
    blocks: [
      { type: 'p', text: "Paramètres → Inventaire : suivi des actifs matériels (serveurs, stockage, réseau) avec numéro de série, date d'acquisition, garantie et statut. Utile pour anticiper les fins de garantie et estimer la valeur du parc." }
    ]
  },
  {
    id: 'admin-platform',
    group: 'Administration',
    title: 'Administration : Plateforme',
    blocks: [
      { type: 'p', text: "Paramètres → Plateforme : identité de l'organisation (nom, affiché dans l'en-tête), fuseau horaire, langue et format de date par défaut, adresse de contact." },
      { type: 'note', text: "Langue et format de date sont enregistrés pour l'instant sans effet sur l'interface (pas de traduction multilingue à ce stade) ; seul le nom de l'organisation est déjà appliqué." }
    ]
  },
  {
    id: 'admin-identity',
    group: 'Administration',
    title: 'Administration : Connexion & identité',
    blocks: [
      { type: 'p', text: "Paramètres → Connexion & identité : durée de session et longueur minimale de mot de passe (appliquées immédiatement à toute la console), plus une configuration OIDC/LDAP enregistrée et testable (Tester l'issuer effectue une vraie requête vers le document de découverte OpenID)." },
      { type: 'note', text: "Important : configurer un fournisseur OIDC/LDAP ici l'enregistre et permet de le tester, mais n'active pas encore un second chemin de connexion — seul le mot de passe local authentifie aujourd'hui. C'est une limite volontaire (voir Sécurité de la console)." }
    ]
  },
  {
    id: 'admin-git',
    group: 'Administration',
    title: 'Administration : Services Git',
    blocks: [
      { type: 'p', text: "Paramètres → Services Git : choisissez la forge principale (GitLab ou GitHub) utilisée par défaut pour lier de nouveaux projets, et testez la connexion à chaque forge déjà configurée dans Intégrations & outils." },
      { type: 'note', text: "La réplication automatique (miroirs) entre forges n'est pas encore implémentée — l'emplacement est prévu dans l'interface pour quand elle le sera." }
    ]
  },
  {
    id: 'admin-system',
    group: 'Administration',
    title: 'Administration : Système',
    blocks: [
      { type: 'p', text: 'Paramètres → Système regroupe :' },
      { type: 'ul', items: [
        'Version : commit/branche actuels, et Vérifier les mises à jour (compare avec origin en lecture seule — la console ne s\'auto-met-à-jour et ne redémarre jamais elle-même).',
        'Sauvegardes : copie horodatée de la base, planifiée chaque nuit à 3h (14 dernières conservées), ou déclenchée manuellement. Téléchargez un fichier .db, ou Importez-en un pour le rendre disponible à la restauration.',
        'Restaurer une sauvegarde remplace toutes les données actuelles — une sauvegarde de sécurité de l\'état courant est créée automatiquement avant, et votre mot de passe est redemandé pour confirmer.',
        'Sauvegarde Git : pousse les sauvegardes vers un dépôt Git vous appartenant (GitHub/GitLab/Gitea...), configuré dans Paramètres → Intégrations → Sauvegarde Git (URL HTTPS + token, jamais écrit en clair sur disque). « Vérifier le dépôt distant » liste les sauvegardes déjà présentes et permet de les réimporter (utile pour restaurer depuis une machine différente de celle d\'origine) ; « Pousser maintenant » en crée une nouvelle et l\'envoie.'
      ] },
      { type: 'p', text: "Paramètres → Journal liste les 200 dernières actions administratives sensibles (connexions, gestion des comptes, proxies, hôtes, sauvegardes, configuration des intégrations) avec l'auteur et l'horodatage." }
    ]
  },
  {
    id: 'security',
    group: 'Sécurité & déploiement',
    title: 'Sécurité de la console',
    blocks: [
      { type: 'ul', items: [
        'Secrets (tokens, mots de passe d\'intégration) chiffrés au repos (AES-256-GCM) et jamais renvoyés en clair au navigateur.',
        'Sessions par cookie httpOnly signé (JWT), durée configurable dans Paramètres → Connexion & identité (12h par défaut).',
        'Limite de débit sur les routes sensibles (connexion, mot de passe, paramètres, sauvegardes, hôtes, identité) contre le bruteforce.',
        'Restauration de sauvegarde protégée par re-saisie du mot de passe.',
        'Installation d\'agents SSH limitée à un catalogue fermé de scripts, avec clé dédiée à la console (jamais de mot de passe par hôte).',
        'Rôles réellement appliqués aujourd\'hui : administrateur / utilisateur (deux niveaux, vérifiés sur chaque route sensible d\'administration). La matrice de permissions par groupe (Groupes & permissions) enregistre un modèle de droits plus fin, mais son application automatique à chaque route est un chantier en cours.'
      ] },
      { type: 'note', text: "Ce que « rôle appliqué » couvre précisément : toutes les routes d'administration (utilisateurs, groupes, hôtes SSH, sauvegardes, système, identité, journal d'audit, IPs bannies, scans réseau) exigent le rôle Administrateur, côté serveur et pas seulement dans l'affichage. En revanche, les actions sur les pages opérationnelles elles-mêmes (redémarrer un pod Kubernetes, arrêter une VM Proxmox, créer/appliquer un proxy, basculer un serveur HAProxy, approuver une merge/pull request) sont aujourd'hui ouvertes à tout compte connecté, y compris Utilisateur — ce n'est pas un oubli d'affichage, c'est la portée actuelle du modèle à deux rôles, avant que la matrice de groupes ne soit branchée." }
    ]
  },
  {
    id: 'deployment',
    group: 'Sécurité & déploiement',
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
    group: 'Sécurité & déploiement',
    title: 'Dépannage',
    blocks: [
      { type: 'ul', items: [
        '« Non configuré » persiste après avoir enregistré : vérifiez avec Tester la connexion — le message d\'erreur précise généralement la cause (URL injoignable, identifiants invalides...).',
        'Déconnecté(e) de façon inattendue : la session expire après 12h ; reconnectez-vous simplement.',
        'Erreur 403 sur une action : votre compte n\'a pas le rôle administrateur requis pour cette action.',
        'Une sauvegarde restaurée ne semble pas s\'appliquer : rafraîchissez la page — certaines vues sont mises en cache côté navigateur pendant quelques secondes.',
        'Un agent SSH ne s\'installe pas : vérifiez que la clé publique de la console est bien dans ~/.ssh/authorized_keys de l\'utilisateur SSH renseigné, et que cet utilisateur peut exécuter les commandes du script (sudo sans mot de passe si l\'utilisateur n\'est pas root).',
        'La recherche globale (⌘K/Ctrl K) ne trouve rien alors que la page existe : elle tolère les fautes de frappe courantes mais reste sensible à des mots très différents de l\'intitulé réel — essayez un mot-clé plus court ou plus générique (ex. « proxy » plutôt que le nom exact du domaine).',
        'Le widget « Disponibilité 24h » de l\'accueil affiche des points gris : c\'est l\'absence de donnée pour cette heure-là (avant le premier relevé après démarrage, ou coupure prolongée du service), pas une erreur.'
      ] }
    ]
  }
];
