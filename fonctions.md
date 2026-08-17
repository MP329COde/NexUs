# Fonctions de Nexus Console

Inventaire des fonctionnalités réellement présentes dans le projet (backend `backend/`, frontend `frontend/`). Ce fichier doit être mis à jour à chaque fonctionnalité ajoutée/modifiée — ne documente que ce qui existe réellement dans le code, jamais ce qui est prévu (voir la section "Propositions" pour ça).

## Backend — Routes (`backend/src/routes/*.js`)

- **argocd.routes.js** — Statut ArgoCD, liste des applications, détail d'une application (sync status).
- **audit.routes.js** — Consultation du journal d'audit (liste + export CSV).
- **auth.routes.js** — Connexion (e-mail **ou nom d'utilisateur**)/déconnexion, session (`/me`), profil, mot de passe, onboarding première connexion. Verrouillage de compte après échecs répétés + bannissement IP automatique en cas d'attaque ciblée (voir `usersStore.js`).
- **backups.routes.js** — Liste, création, import, téléchargement, restauration, suppression de sauvegardes ; **sauvegarde Git** (`POST /git/push` : crée une sauvegarde et la pousse vers le dépôt configuré, `GET /git/list` : liste les sauvegardes du dépôt distant, `POST /git/import/:file` : les rapatrie localement pour restauration via le circuit habituel avec ré-authentification).
- **certmanager.routes.js** — Statut cert-manager, liste des certificats (CRD Kubernetes), renouvellement forcé.
- **console.routes.js** — Info console minimale (authentifiée).
- **deployments.routes.js** — CRUD de liens de déploiement (projet↔dépôt↔cible), pipeline associé, sync GitOps, diff, historique, rollback, **provisionnement direct de l'application Argo CD** (`POST /:id/provision-argocd-app` : crée/met à jour l'Application dans Argo CD depuis le dépôt déjà lié — repo résolu automatiquement, sync automatisée par défaut — sans passer par l'interface Argo CD).
- **devtools.routes.js** — Détection des outils dev présents sur la machine backend (git, docker, kubectl, node...).
- **dns.routes.js** — Liste des zones OVH (`GET /ovh/zones`) et synchronisation DNS réelle d'un domaine (`POST /sync`, admin) : détecte le fournisseur (DuckDNS pour `*.duckdns.org`, sinon zone OVH correspondante) et crée/met à jour l'enregistrement A vers l'adresse cible fournie — sans que l'admin ait à choisir explicitement le fournisseur.
- **domains.routes.js** — Liste des domaines gérés.
- **github.routes.js** — Statut, dépôts, workflow runs, pull requests GitHub.
- **gitea.routes.js** — Statut, dépôts, pull requests Gitea (lecture + approbation ; pas d'éditeur GitOps arborescence/commit, contrairement à GitLab/GitHub).
- **gitlab.routes.js** — Statut, projets, pipelines, merge requests GitLab, miroirs GitLab→GitHub (admin).
- **grafana.routes.js** — Statut Grafana, dashboards, alertes.
- **groups.routes.js** — CRUD des groupes d'utilisateurs.
- **haproxy.routes.js** — Statut, backends, serveurs (état runtime + changement d'état admin), frontends (Data Plane API).
- **hosts.routes.js** — Clé publique SSH console, catalogue d'agents, CRUD hôtes, hôtes critiques, installation d'agent via SSH, **installation de service complet** (`GET /services/catalog`, `GET /services/:serviceId/preview`, `POST /:id/services/:serviceId/install` — même catalogue que l'assistant de première installation, `serviceCatalog.js`, réutilisable a posteriori sur un hôte déjà géré).
- **dockerHub.routes.js** — Consultation du registre public Docker Hub (tags, métadonnées), sans authentification.
- **imageScans.routes.js** — Scan de vulnérabilités d'une image via Trivy (admin), historique des scans.
- **dastScans.routes.js** — DAST réel via OWASP ZAP (`zap-baseline.py`, admin) : cible strictement limitée à un domaine déjà déclaré dans Réseaux → Proxies (jamais une URL arbitraire, pour ne jamais servir de scanner ouvert), historique, notification critique si alertes à risque élevé.
- **codeScans.routes.js** — Analyse statique de code via Semgrep sur le code source de la plateforme (admin), historique des scans.
- **iacScans.routes.js** — Analyse IaC (Dockerfiles) via Checkov sur la plateforme (admin), historique des scans.
- **iac.routes.js** — Infrastructure as Code réelle (admin) : CRUD d'espaces de travail Terraform (`workspaces`), génération des fichiers `.tf`/`terraform.tfvars` (provider `bpg/proxmox`, identifiants issus de l'intégration Proxmox déjà configurée), `plan`/`apply`/`destroy` en exécutant le binaire `terraform` réel sur la machine backend.
- **notifications.routes.js** — Alertes de sécurité persistantes (admin) : liste, marquage lu/tout lu.
- **identity.routes.js** — Config d'identité (OIDC/LDAP), test de connexion OIDC.
- **incidents.routes.js** — Liste globale des incidents.
- **inventory.routes.js** — CRUD inventaire matériel/logiciel.
- **jobs.routes.js** — Liste (admin) et suivi d'un job asynchrone.
- **kubernetes.routes.js** — Namespaces, pods, deployments, services, logs/describe/metrics/owners de pod, restart/scale/rollback/purge deployment, suppression de pod, **remontée vers le lien de déploiement** (`GET /deployments/:namespace/:name/links` : dépôt Git et application Argo CD qui déploient cette ressource, s'il existe un lien correspondant dans `deploymentStore`).
- **networkTopology.routes.js** — Topologie réseau agrégée (proxies, HAProxy, Traefik, Proxmox — nœuds **et** VM/LXC réels de chaque nœud —, K8s), construite uniquement à partir des intégrations réellement configurées.
- **organizations.routes.js** — Liste/création/modification d'organisations, projets d'une organisation, **suppression** (`DELETE /:id`, réservée owner/admin, irréversible — exige `?force=true` si l'organisation contient encore des projets plutôt que de les supprimer silencieusement via la cascade SQL), **membres de l'organisation** (`GET`/`POST /:id/members`, `PUT`/`DELETE /:id/members/:userId` — absent jusqu'ici : une organisation ne pouvait avoir que son créateur, aucun moyen d'y ajouter un collègue, ce qui bloquait tout usage à plusieurs ; protection contre le retrait du dernier propriétaire).
- **pipelines.routes.js** — Vue agrégée des runs CI (GitLab+GitHub), relance d'un run, **détail jobs/étapes d'un run** (`GET /runs/:id/jobs`, GitHub Actions uniquement).
- **projects.routes.js** — CRUD projets (allowlist stricte des champs modifiables), membres, environnements, espace de travail, webhook & rotation secret, déploiements liés, jobs, incidents, changements, fenêtres de maintenance, tâches, raccourcis, coffre-fort projet, **mot de passe de coffre-fort projet** (`PUT`/`DELETE /:id/vault-password`), **scans de sécurité par projet** (`GET`/`POST /:id/security-scans` : SAST/SCA/IaC réels sur les dépôts liés, maintainer+).
- **proxies.routes.js** — CRUD proxies, test de connexion, application HAProxy/Traefik, marquage critique.
- **proxmox.routes.js** — Statut, nœuds, VMs, actions (start/shutdown/reboot).
- **repos.routes.js** — Dépôts GitLab+GitHub+Gitea (Gitea en lecture seule, sans éditeur GitOps), métadonnées locales, arborescence/fichier, proposition de changement (branche+commit+MR/PR), **structure de développement d'un dépôt** (`GET /:key/structure` : stack détectée depuis les fichiers racine, gestionnaire de paquets, présence de CI/Docker Compose, scripts npm si `package.json` présent — rien d'inventé, uniquement lu en direct sur la branche par défaut), **génération de workflow GitHub Actions** (`POST /:key/workflows/generate-ci`, GitHub uniquement : construit un `.github/workflows/ci.yml` adapté à la stack détectée — lint/test/build + jobs SAST Semgrep, SCA Trivy, secret scanning GitGuardian via de vraies actions GitHub tierces — et l'ouvre en pull request, jamais appliqué directement sur la branche par défaut).
- **reviews.routes.js** — MR/PR ouvertes (GitLab+GitHub+Gitea), assignation locale de relecteur, approbation proxifiée, **planification de créneaux de revue récurrents** (`GET/POST /schedules`, `PUT`/`DELETE /schedules/:id` : jour de semaine + plage horaire + relecteurs désignés, écriture admin).
- **security.routes.js** — Banlist IP, scans sécurité (nmap), vue d'ensemble sécurité, trafic + blocage automatique.
- **settings.routes.js** — Paramètres généraux console, config par intégration.
- **setup.routes.js** — Statut d'installation initiale, création admin+config, provisioning.
- **shortcuts.routes.js** — CRUD raccourcis globaux "Accès aux outils".
- **status.routes.js** — Santé, vue d'ensemble plateforme, statuts par service, charge infra en direct.
- **system.routes.js** — Version, vérification de mise à jour (git), overview système.
- **teams.routes.js** — Équipes par organisation, gestion membres.
- **terminal.routes.js** — Permissions terminal par palier utilisateur, exécution de commande via grammaire fixe, **demande d'accès self-service** avec approbation/refus admin.
- **traefik.routes.js** — Statut, routeurs, services Traefik.
- **users.routes.js** — CRUD utilisateurs, palier terminal.
- **vault.routes.js** — Coffres dev/prod, révélation avec vérification de mot de passe (compte, ou mot de passe de projet dédié pour tier `project`), édition/suppression, **rotation automatique configurable (2-5 min)** des secrets prod/projet avec échéance exposée au reveal.
- **volumes.routes.js** — CRUD stockage (volumes, NAS, pools ZFS, partages).
- **networkServices.routes.js** — CRUD déclaratif VLAN/sous-réseaux, plages DHCP, enregistrements DNS internes, IPs VPN (`/network-services/{vlans,dhcp-ranges,dns-records,vpn-clients}`) — même principe que le stockage : aucune intégration DHCP/DNS/VPN réelle branchée.
- **wazuh.routes.js** — Statut, agents, résumé Wazuh.
- **webhooks.routes.js** — Réception de webhooks entrants GitLab/GitHub par projet.
- **wiki.routes.js** — Wiki d'équipe : CRUD de pages par organisation (optionnellement liées à un projet), historique des révisions (`GET /:id/revisions`), recherche (`?q=`). Contenu réellement stocké en base (socle Postgres, `wiki_pages`/`wiki_page_revisions`, migration `0012_wiki.sql`) — à la différence du lien runbook des incidents qui pointe vers une doc externe. Lecture/écriture ouvertes à tout membre de l'organisation, suppression réservée à owner/admin d'organisation ou admin plateforme.

## Backend — Services (`backend/src/services/**/*.js`)

- **agentCatalog.js** — Catalogue fermé de scripts d'installation d'agents.
- **auditService.js** — Journalisation des actions admin sensibles (1000 entrées max).
- **backupService.js** — Sauvegarde/restauration complètes, rétention 14 jours, planifiée quotidiennement (3h).
- **gitBackupService.js** — Pousse les sauvegardes vers un dépôt Git du propriétaire (GitHub/GitLab/Gitea/tout HTTPS), token jamais écrit en clair sur disque (URL authentifiée construite en mémoire à chaque `git push`, jamais persistée dans `.git/config`), token redacté de tout message d'erreur remonté. `pullAndList()`/`importFromRepo()` permettent de retrouver et réimporter une sauvegarde depuis une machine différente de celle d'origine.
- **deploymentService.js** — Liens de déploiement, agrégation pipeline, sync GitOps via ArgoCD/K8s.
- **devToolsService.js** — Détection d'outils dev locaux (`which`), inclut désormais Trivy.
- **trivyService.js** — Scan de vulnérabilités réel via le binaire Trivy (Aqua Security, open source) installé sur la machine backend ; jamais de service tiers hébergé.
- **terraformService.js** — Infrastructure as Code réelle : génère des espaces de travail Terraform (provider `bpg/proxmox`) dans `data/terraform/<id>/`, exécute le binaire `terraform` réel (`init`/`plan`/`apply`/`destroy`) sur la machine backend — erreur explicite (503) si le binaire n'est pas installé, jamais de résultat simulé.
- **dastService.js** — DAST réel via le binaire OWASP ZAP (`zap-baseline.py`, open source) sur la machine backend ; cible validée contre les domaines déjà déclarés (`proxyStore`), jamais une URL arbitraire.
- **gitMirrorService.js** — Miroir automatique GitLab→GitHub.
- **hostMetricsService.js** — Sonde TCP + métriques SSH, rafraîchissement 30s.
- **infraLoadService.js** — Échantillonnage en mémoire (6h) de la charge Proxmox, **détail par nœud** (`nodes: { [node]: { cpuPct, ramPct } }` dans chaque échantillon) en plus de la moyenne globale.
- **integrationRegistry.js** — Registre central des intégrations disponibles.
- **jobService.js** — Exécution asynchrone en process, suivi persisté.
- **networkScanService.js** — Scan nmap sur cible validée strictement.
- **networkTopologyService.js** — Agrégation topologie depuis les intégrations configurées, y compris les VM/LXC réels de chaque nœud Proxmox (`proxmox.listVMs`).
- **pgDumpService.js** — Export/import JSON du socle relationnel Postgres.
- **pipelineNormalizer.js** — Normalisation commune des runs CI GitLab/GitHub Actions.
- **projectWorkspaceService.js** — Agrégation de l'état des dépôts liés à un projet.
- **provisioningService.js** — Suivi des jobs d'installation de l'assistant setup.
- **proxyService.js** — CRUD proxies + application vers Traefik/HAProxy.
- **serviceCatalog.js** — Catalogue fermé de scripts d'installation de services complets.
- **sshExecutor.js** — Exécution de scripts catalogués via clé SSH unique console.
- **statusHistoryService.js** — Relevé horaire de disponibilité des services critiques (30 jours), planifié.
- **terminalService.js** — Grammaire de commandes fixe routée vers kubernetesService. **`apply` refuse tout namespace de production** (environnement Postgres marqué `is_production`, résolu via `deploymentStore`/`orgStore`) : impose de passer par une revue de code (proposition de changement sur le dépôt) plutôt qu'une application directe.
- **trafficMonitorService.js** — Tampon circulaire du trafic API, détection IPs suspectes.
- **updateService.js** — Vérification des mises à jour via git.
- **vaultRotationService.js** — Vérifie toutes les 30s les entrées de coffre dont la rotation (2-5 min) est due et régénère leur secret.
- **secretLeakScanService.js** — Scan quotidien (4h) des dépôts liés à un projet, rotation automatique immédiate si un secret prod/projet connu est trouvé en clair.
- **projectScanService.js** — SAST/SCA/IaC réels par projet (Semgrep/Trivy fs/Checkov) : clone superficiel (`git clone --depth 1`, jeton Git déjà configuré) de chaque dépôt lié dans un dossier temporaire, scan, suppression du clone — jamais de chemin fourni par le client, jamais de résultat simulé.
- **kubernetesAlertService.js** — Vérification toutes les 60s de l'état de tous les pods du cluster (`listPods`) : notification (`notificationsStore`) sur redémarrages excessifs (proxy CrashLoopBackOff, seuil 5) et pod en Pending depuis plus de 10 min ; chaque franchissement de seuil n'est notifié qu'une fois.
- **integrations/argocdService.js** — API REST ArgoCD réelle, **création/mise à jour d'Application** (`upsertApplication`, `POST /api/v1/applications?upsert=true`).
- **integrations/certManagerService.js** — CRD Kubernetes cert-manager.
- **integrations/githubService.js** — API REST GitHub réelle (repos, runs, PR, arborescence/fichier, commit, branche, PR), **jobs/étapes d'un run** (`listWorkflowRunJobs`).
- **integrations/gitlabService.js** — API v4 GitLab réelle (projects, pipelines, MR, branches, commits, mirrors, arborescence/fichier, commit, branche, MR).
- **integrations/grafanaService.js** — API REST Grafana réelle.
- **integrations/haproxyService.js** — Data Plane API v2/v3 réelle.
- **integrations/httpClient.js** — Client HTTP axios normalisé + erreur commune.
- **integrations/kubernetesService.js** — Le plus complet : namespaces, pods, deployments, services, logs, describe, metrics, restart/scale/rollback/purge, exec.
- **integrations/proxmoxService.js** — API2 JSON réelle, `listNodes()` expose désormais aussi `maxcpu`/`disk`/`maxdisk`, **`listStorage()`** agrège l'état réel de chaque stockage (`/nodes/{node}/storage` : type, used/avail/total en octets, actif) sur tous les nœuds.
- **integrations/traefikService.js** — API REST réelle, écriture de routes dynamiques.
- **integrations/wazuhService.js** — API REST avec cache JWT (token 14min), **`listAgentSCA()`/`getSCASummary()`** : conformité (Security Configuration Assessment, CIS Benchmarks) par agent actif, bornée à 25 agents par cycle avec troncature signalée (`agentsScanned`/`agentsTotal`).
- **integrations/ovhService.js** — API OVH réelle (gestion de zones DNS) : authentification signée (application key/secret + consumer key, calcul du décalage d'horloge via `/auth/time`), `listZones`/`listRecords`/`upsertRecord` (crée ou met à jour l'enregistrement A puis rafraîchit la zone).
- **integrations/duckdnsService.js** — API DuckDNS réelle (`GET /update`), met à jour un sous-domaine `*.duckdns.org` vers une IP donnée (ou laisse DuckDNS détecter l'IP publique sortante si aucune n'est fournie).

Toutes les intégrations suivent le même patron : `notConfigured()` si non paramétrées côté Paramètres, sinon appel API réel — aucune donnée simulée/mockée.

## Backend — Stores (`backend/src/store/*.js`, pertinents)

- **projectsStore.js — bug critique corrigé** : `updateProject()` fusionnait `{...existant, ...payload}` sans filtrer les valeurs `undefined`. Comme `routes/projects.routes.js` déstructure `req.body` selon un allowlist explicite avant de repasser l'objet complet, tout champ absent du corps de la requête devenait une clé `undefined` explicite — écrasant silencieusement (perte de données réelle) `name`/`description`/`tags`/`memberIds`/`repoKeys`/`icon`/`color` à chaque mise à jour partielle (ex. changer uniquement le statut). Trouvé en testant réellement le nouveau sélecteur de statut de la fiche projet, qui a fait planter la page (`repoKeys.length` sur `undefined`) et corrompu un projet réel — restauré depuis une sauvegarde locale. Corrigé en ne fusionnant que les valeurs réellement définies. Les autres stores avec un merge similaire (`groupsStore`, `incidentStore`, `usersStore.updateUser`) vérifient déjà `!== undefined` champ par champ et n'étaient pas affectés ; les routes qui passent `req.body` tel quel sans déstructuration allowlist (hosts, proxies, inventory, volumes, réseaux internes, revues, déploiements) ne sont pas non plus concernées par ce mécanisme précis. Même famille de bug trouvée et corrigée dans `orgStore.updateOrganization()` (SQL) : `icon` n'était pas protégé par `COALESCE` (contrairement à `name`/`color`), effacé à `NULL` par tout renommage ou changement de couleur seul — reproduit et vérifié avant/après correction.
- **usersStore.js** — Comptes utilisateurs, hash de mot de passe, **verrouillage de compte** (`failedAttempts`/`lockUntil`, fenêtre glissante 15 min, seuil 5 échecs).
- **vaultStore.js** — Coffres dev/prod/projet chiffrés AES-256-GCM, **rotation automatique** (`rotationMinutes`, `rotatedAt`, `secretVersion`).
- **projectsStore.js** — Projets, backlog, **mot de passe de coffre-fort projet** (`vaultPasswordHash`, jamais exposé au client — retiré par `middleware/projectAccess.js`).
- **banlistStore.js** — Liste d'IPs bannies, normalisation IPv4/IPv6.
- **notificationsStore.js** — Alertes de sécurité persistantes (verrouillage de compte, bannissement IP auto, secret committé, vulnérabilité critique), visibles par les admins même après reconnexion.
- **terminalAccessRequestsStore.js** — Demandes d'accès au terminal sécurisé (self-service), une par utilisateur en attente à la fois.

## Frontend — Pages (`frontend/src/pages/**/*.jsx`)

### Accueil

- **HomePage.jsx** — Tableau de bord principal.
- **AdminOverviewPanel.jsx** — Vue admin : intégrations en erreur, incidents ouverts, jobs en échec, fraîcheur backup.
- **MyProjectsOverviewPanel.jsx** — Équivalent non-admin, filtré sur les projets de l'utilisateur.
- **CriticalHostsPanel.jsx** — Hôtes critiques (sonde TCP + métriques SSH), admin uniquement.
- **InfraLoadPanels.jsx** — Charge CPU/RAM Proxmox + répartition VM/LXC/Pods.
- **LiveActivityPanel.jsx** — Flux fusionné audit + sauvegardes, admin uniquement.
- **OpenAlertsPanel.jsx** — Alertes Grafana + agents Wazuh déconnectés.
- **BlockedFeaturesPanel.jsx** — Liste grisée des intégrations non configurées ou en échec, avec raison exacte (issue de `/status/overview`) et lien de correction pour les admins.
- **ServiceAvailabilityPanel.jsx** — Disponibilité 24h par service important.

### Développement (Deployments)

- **ProjectsPage.jsx** — Liste/création de projets, **icône (emoji) et couleur personnalisées**, **recherche texte + filtre par statut** (Tous/Actifs/En pause/Archivés), KPIs calculés sur l'ensemble des projets visibles (indépendants du filtre affiché).
- **ProjectDetailPage.jsx** — Fiche projet complète. Rôles granulaires (viewer/developer/maintainer/owner) **+ octroi ponctuel d'accès au coffre-fort du projet** par membre (lecture / lecture+édition), indépendant du rôle global — un viewer peut ainsi consulter ou éditer des secrets sans être promu sur tout le reste. **SecurityScansPanel** : SAST/SCA/IaC réels par dépôt lié (Semgrep/Trivy/Checkov), déclenchement manuel (maintainer+), historique des scans. **Sélecteur de statut** (Actif/En pause/Archivé) et **bouton de suppression** ajoutés dans l'en-tête (réservé owner/admin pour la suppression), **retrait d'un membre du projet** ajouté (`DELETE /projects/:id/members/:userId` existait côté backend, jamais appelé côté frontend — seul le changement de rôle l'était), réservé owner/maintainer/admin — le backend le supportait déjà, seule l'interface manquait. Bug corrigé : 12 boutons/éléments avec un `className` dupliqué (`className="btn-outline" className="pd-...-btn"` — le second écrasait silencieusement le premier en JSX) perdaient leur style de base ("Déclarer", "Résoudre", "Proposer", "Approuver", "Marquer exécuté", "Planifier", "Ajouter" équipe, "Chemin réseau", "Rattacher", sélecteur de pod et bloc de logs de `ApiPreviewPanel`) — corrigés en une seule classe combinée, vérifiés un par un via Playwright.
- **OrganizationsPage.jsx / OrgMembersModal.jsx** — Organisations (socle PostgreSQL), **suppression** (owner uniquement, confirmation renforcée si des projets seraient supprimés en cascade), **gestion des membres de l'organisation** (ajout depuis la liste complète des comptes — admin uniquement, cohérent avec le sélecteur de membres de ProjectsPage.jsx —, changement de rôle propriétaire/admin/membre, retrait, protection du dernier propriétaire). Bug corrigé : le `pattern` HTML du champ Identifiant cassait la validation native dans Chrome récent (mode unicode-sets — tiret final non échappé dans une classe de caractères).
- **WikiPage.jsx** — Wiki d'équipe par organisation : liste/recherche de pages, édition (titre + texte), historique des révisions, suppression. Socle PostgreSQL (`GET/POST/PUT/DELETE /api/wiki`).
- **GitReposPage.jsx** — Dépôts GitLab+GitHub, étiquetage manuel, bouton **« Structure »** ouvrant `RepoStructureModal.jsx` (stack détectée, CI, Docker Compose, scripts `package.json`, arborescence racine, via `GET /repos/:key/structure`), bouton **« Générer CI »** (dépôts GitHub) ouvrant `GenerateCiModal` qui déclenche `POST /repos/:key/workflows/generate-ci` et affiche le lien de la pull request créée.
- **PipelinesPage.jsx / PipelineView.jsx / GitOpsDiffPanel.jsx** — Pipelines CI agrégés, détail, diff GitOps ; bouton **« Jobs »** (runs GitHub) ouvrant le détail jobs/étapes d'une exécution ; bouton **« Provisionner »** sur l'étape Argo CD non liée (admin) ouvrant `ProvisionArgocdModal` qui crée l'Application Argo CD depuis le lien existant.
- **ManifestExplorerModal.jsx** — Navigation/édition YAML → commit → MR/PR.
- **CodeReviewsPage.jsx** — MR/PR réelles, assignation locale de relecteurs. **ReviewSchedulePanel.jsx** : créneaux récurrents de revue (jour + plage horaire + relecteurs), CRUD admin.
- **ContainersPage.jsx** — Pods Kubernetes réels ; Docker non intégré.
- **EnvironmentsPage.jsx** — Réel : environnements du socle relationnel (production/staging créés automatiquement par projet) agrégés tous projets confondus, liaison à une application Argo CD existante, promotion réelle (revision lue sur l'environnement source via l'API Argo CD, synchronisée sur l'environnement cible), historique des promotions (succès/échecs réels, jamais inventés).
- **ImagesRegistryPage.jsx** — Tableau "Dépôt d'images" du haut de page en démonstration, mais **scanner Trivy réel** (TrivyScanPanel.jsx, à la demande + planifié horaire), **recherche Docker Hub en direct** (DockerHubLookupPanel.jsx, registre public réel), **génération + signature de SBOM réelles** (SbomPanel.jsx, Syft pour le SBOM, cosign/Sigstore pour la signature) et **registre d'images privé réel et optionnel** (PrivateRegistryPanel.jsx, Docker Distribution — service Compose sous profil `registry`, activé via `install.sh`).
- **ReleasesPage.jsx** — Réel : applications suivies, pipeline complet, diff GitOps (déjà réels) + panneau "Fichiers à corriger" alimenté par le dernier scan Semgrep réel (`/code-scans`), lien vers Supply Chain pour lancer un scan.
- **IacPage.jsx** — Infrastructure as Code (admin) : déclaration de VM Proxmox (formulaire), génération/consultation du `main.tf`, `terraform plan` (sortie affichée), `apply`/`destroy` avec confirmation typée (`ActionConfirmModal`), via `GET/POST /iac/workspaces*`.
- **SupplyChainPage.jsx** — Pipeline avec badges honnêtes (Réel/Partiel/Non intégré) ; **CodeScanPanel.jsx** (Semgrep), **DastScanPanel.jsx** (OWASP ZAP, cible limitée aux domaines déjà déclarés), **IacScanPanel.jsx** (Checkov), **SBOM, signature et registre** (Syft + cosign + registre privé, voir Images & registry) réels. Seule la signature d'*image* (par opposition à la signature du SBOM) reste hors périmètre — nécessiterait de pousser une image via la console elle-même, qu'elle ne construit pas.
- **TestsQualityPage.jsx** — Réel, recadré : "fiabilité des pipelines" dérivée de l'historique CI réel (`/pipelines/runs`, GitLab+GitHub), pas de "couverture de tests" inventée en l'absence d'un framework de tests/format JUnit intégré. Taux de succès, tendance quotidienne 30j, détail par dépôt.
- **ToolsAccessPage.jsx** — Intégrations réelles + raccourcis manuels.
- **SecretsPage.jsx / VaultPanel.jsx** — Coffre dev/prod, triple vérification prod, **champs symboles autorisés/interdits**, **rotation automatique configurable**, compte à rebours de rotation.
- **SecretLeakScanPanel.jsx** — Historique du **scan quotidien de secrets committés** dans les dépôts liés aux projets (rotation auto en cas de détection), déclenchement manuel.
- **ProjectVaultPanel.jsx** — Coffre-fort par projet, **mot de passe de coffre-fort dédié** (session déverrouillée tant que la page reste ouverte), rotation.
- **ProjectShortcutsPanel.jsx** — Raccourcis manuels propres à un projet.
- **PasswordGeneratorPanel.jsx** — Générateur (aléatoire/passphrase), entropie + estimation de temps de cassage, symboles personnalisés, enregistrement direct en coffre.
- **DevToolsPanel.jsx** — Détection des outils sur la machine backend.
- **DeploymentFormDialog.jsx / DeploymentsLayout.jsx** — Formulaire de lien de déploiement / layout.

### Infrastructure

- **HostsPage.jsx / HostFormDialog.jsx / InstallAgentDialog.jsx** — CRUD hôtes, installation d'agents.
- **ProxmoxPage.jsx** — Nœuds/VMs Proxmox, actions avec confirmation, jauge disque par nœud, nombre de vCPU, **historique CPU/RAM par nœud** (sparklines, `NodeHistoryPanel`, ~6h via `/status/infra-load`).
- **InfrastructureLayout.jsx** — Layout de section.

### Kubernetes

- **KubernetesPage.jsx** — Namespaces/pods/deployments/services.
- **PodDetailDialog.jsx / PodLogsDialog.jsx / DiagnosticsModal.jsx** — Détail, logs, diagnostic d'un pod/deployment ; **DiagnosticsModal** ouvre aussi, si un lien de déploiement correspond, des raccourcis directs vers le dépôt Git et l'application Argo CD (`GET /kubernetes/deployments/:namespace/:name/links`).
- **ServicesPage.jsx** — Services Kubernetes.
- **TerminalPage.jsx** — Terminal sécurisé, grammaire de commandes fixe, **formulaire de demande d'accès self-service** si aucun palier n'est attribué.
- **KubernetesLayout.jsx** — Layout de section.

### Réseau

- **NetworkPage.jsx / ProxyFormDialog.jsx / AttachFrontendDialog.jsx** — Proxies et domaines, **action « DNS » par domaine** (modale « Pointer ce domaine ») qui appelle `POST /dns/sync` : détecte OVH ou DuckDNS selon le domaine/la configuration, crée/met à jour l'enregistrement réel.
- **HAProxyPage.jsx** — Backends/frontends/servers en direct.
- **CertificatesPage.jsx** — Certificats cert-manager, renouvellement.
- **FirewallPage.jsx** — Trafic API temps réel, IPs suspectes, blocage.
- **TopologyPage.jsx** — Topologie depuis les intégrations configurées, **couche « Machines virtuelles & conteneurs »** listant les VM/LXC réels de chaque nœud Proxmox (pas seulement les nœuds eux-mêmes).
- **NetworkLayout.jsx** — Layout de section.

### Monitoring / Stockage / Sécurité / autres

- **MonitoringPage.jsx / InstallGrafanaDialog.jsx** — Statut/dashboards/alertes Grafana, **filtre texte sur les alertes** (en plus du filtre par sévérité), **tendance de charge CPU/RAM** (sparklines ~6h, `/status/infra-load`), **hôtes triés par charge la plus élevée d'abord** avec icône d'alerte au-delà de 85%. Quand Grafana n'est pas configuré : bouton **« Installer Grafana automatiquement »** sur un hôte déjà géré (Infrastructure → Hôtes), avec aperçu du script avant exécution et indication du branchement restant (créer un compte de service Grafana, puis renseigner Paramètres → Grafana).
- **StoragePage.jsx** — CRUD volumes/NAS/pools ZFS/partages (local, suivi déclaratif mis à jour à la main) **+ panneau « Stockage Proxmox »** avec l'état réel (used/avail par nœud, rafraîchi toutes les 30s, `GET /proxmox/storage`) quand Proxmox est configuré — masqué sinon, jamais de valeur inventée.
- **NetworkServicesPage.jsx** — Réseaux internes : VLAN/sous-réseaux, DHCP, DNS interne, VPN (4 onglets, CRUD déclaratif, local, pas d'intégration réelle).
- **SecurityPage.jsx** — Scans nmap, overview sécurité, agents Wazuh, **panneau « Conformité (SCA) »** (audits CIS Benchmarks remontés par les agents actifs, score/réussis/échoués par politique).
- **ReportPage.jsx** — Rapport imprimable.
- **ManualPage.jsx** — Documentation intégrée, incluant un groupe **« Manuel de code »** (structure du dépôt, conventions JSX/React, patrons backend — services/integrations, strangler pattern Postgres/JSON, jobService, rôles projet) destiné aux contributeurs du code de Nexus Console lui-même.
- **AccountPage.jsx** — Profil utilisateur, préférences, **import d'image de profil** (redimensionnement client 256×256, mutuellement exclusif avec l'emoji), **gestion des clés d'accès (passkeys WebAuthn)** — enregistrement/suppression réels via @simplewebauthn, **couleur d'accent** (7 teintes dont bleu Windows 11 par défaut, persistée par utilisateur, appliquée en clair et sombre via `data-accent` sur `<html>`).

### Connexion / Onboarding / Installation

- **LoginPage.jsx / LoginVisual.jsx** — Connexion par e-mail ou nom d'utilisateur, **ou par clé d'accès (passkey WebAuthn/FIDO2)**, réelle (@simplewebauthn/server, ECDSA/RSA selon l'authentificateur) — jamais un remplacement obligatoire du mot de passe.
- **OnboardingPage.jsx** — Écran de première connexion.
- **SetupPage.jsx** — Assistant de première installation.
- **InstallScreen.jsx** — Suivi des jobs d'installation.

### Paramètres

- **SettingsPage.jsx** — Layout des panneaux.
- **IntegrationPanel.jsx** — Configuration/test de chaque intégration.
- **GitServicesPanel.jsx** — Configuration GitLab/GitHub.
- **IdentityPanel.jsx** — Configuration OIDC/LDAP.
- **UsersPanel.jsx / GroupsPanel.jsx** — CRUD utilisateurs et groupes, **file d'approbation des demandes d'accès terminal**.
- **InventoryPanel.jsx** — Inventaire matériel/logiciel.
- **AuditPanel.jsx** — Journal d'audit centralisé.
- **SystemPanel.jsx** — Version, mise à jour, overview, sauvegardes locales, **panneau « Sauvegarde Git »** (pousser maintenant, lister les sauvegardes du dépôt distant, les réimporter pour restauration).
- **PlatformPanel.jsx** — Paramètres généraux, **restriction de la Vue générale aux administrateurs** (masque le lien de nav + bloque l'accès direct par URL pour les non-admins).
- **InfrastructureStatusPanel.jsx** — Statut de chaque intégration.
- **RestoreBackupDialog.jsx** — Import/restauration de sauvegarde.

## Frontend — Composants partagés notables

- **components/vault/RotationCountdown.jsx** — Compte à rebours avant rotation automatique d'un secret, ré-authentification silencieuse tant que le panneau reste ouvert.
- **components/ui/Avatar.jsx** — Avatar utilisateur à trois niveaux (image importée > emoji > initiales), utilisé par Header.jsx et AccountPage.jsx.
- **components/layout/DomainNav.jsx** — Navigation par domaines ; le point rouge "accès administrateur" sur Paramètres disparaît définitivement dès le premier clic (persisté en localStorage), au lieu d'être affiché en permanence.
- **components/layout/RequireHomeAccess.jsx** — Garde de route pour la Vue générale quand `homeRestrictedToAdmins` est actif.

## Intégrations externes

| Intégration | Niveau | Détail |
| --- | --- | --- |
| GitHub | Complet | repos, workflow runs, PR, création de dépôt (miroir) |
| GitLab | Complet | projects, pipelines, MR, branches, commits, push mirrors |
| Gitea | Partiel | repos, PR, approbation ; pas d'éditeur GitOps (arborescence/commit) ni de pipelines |
| Bitbucket | Absent | Jamais intégré |
| Proxmox | Complet | nodes, VMs, actions start/shutdown/reboot |
| Kubernetes | Complet | namespaces, pods, deployments, services, logs, exec, scale, rollback |
| ArgoCD | Complet | applications, sync status, diff GitOps |
| Grafana | Complet | dashboards, alertes, health |
| HAProxy | Complet | Data Plane API : backends, frontends, servers |
| Traefik | Complet | routers, services, écriture de routes dynamiques |
| Wazuh | Complet | agents, résumé, auth JWT cachée |
| cert-manager | Complet (dépendant) | Via CRD Kubernetes |
| Docker | Absent | Jamais intégré |
| Registre d'images privé | Complet (optionnel) | Service `registry:2` (Docker Distribution), profil Compose `registry`, activé via `install.sh` |
| Notifications sortantes (Slack/Discord/Teams) | Complet | Webhook, branché sur toutes les notifications de sécurité serveur (verrouillage compte, IP bannie, secret committé, CVE critique, alertes K8s...) via `createNotification()` |
| Scanners sécurité (SAST/SCA) | Complet | Semgrep + Checkov, voir ci-dessous |
| Frameworks de tests | Stub | Page en anticipation |
| Multi-environnements | Complet | Environnements réels (socle relationnel) + promotion via Argo CD |
| nmap | Complet | Exécution réelle, validation stricte de cible |
| Trivy | Complet | Binaire local (Aqua Security, open source), scan d'image à la demande **+ re-scan automatique horaire** de chaque image déjà vue, avec alerte si nouvelle vulnérabilité critique |
| Docker Hub (public) | Complet | API v2 publique, sans authentification, recherche de tags en direct |
| Semgrep | Complet | Binaire local (open source, règles communautaires gratuites), scan à la demande sur le code de la plateforme |
| Checkov | Complet | Binaire local (open source, Bridgecrew CE), scan IaC (Dockerfiles) à la demande |
| Syft | Complet | Binaire local (Anchore, open source), génération de SBOM à la demande sur n'importe quelle image accessible |
| cosign | Complet | Binaire local (Sigstore, open source), signature/vérification réelle des SBOM via paire de clés locale (bundle + journal de transparence Rekor public) |
| SSH (agents/services) | Complet | Clé unique console, catalogue fermé de scripts |

## Sécurité des secrets (état détaillé)

- Secrets jamais renvoyés en clair par défaut (métadonnées seules) ; révélation via endpoint dédié avec ré-authentification.
- Chiffrement AES-256-GCM au repos (clé maître locale).
- Trois paliers : `dev` (accès large), `prod` (admin, génération auto 256 car., triple vérification), `project` (scopé par projet, rôles viewer/developer/maintainer/owner).
- **Rotation automatique** configurable 2-5 min par entrée prod/projet (job serveur `vaultRotationService.js`).
- **Mot de passe de coffre-fort dédié par projet**, distinct du mot de passe personnel, session déverrouillée en mémoire tant que la page reste ouverte.
- **Verrouillage de compte** après 5 échecs de connexion en 15 min ; **bannissement IP automatique** après 12 échecs consécutifs ciblant un même compte (distingue attaque concentrée vs trafic distribué).
- Générateur de mots de passe : longueur jusqu'à 128, symboles personnalisés autorisés/interdits, exclusion des caractères ambigus, mode passphrase, entropie + estimation de temps de cassage affichées.

## Propositions — fonctionnalités à ajouter

Cette section liste des pistes non implémentées, à prioriser avec l'utilisateur avant tout développement :

- MFA obligatoire, restriction par réseau (CIDR) et déconnexion sur inactivité — retirés de l'assistant de configuration initiale car ils n'étaient reliés à aucune application réelle (voir commit "Retire les réglages décoratifs..."). De vraies pistes si un durcissement de l'authentification est voulu au-delà des passkeys WebAuthn déjà réelles.
- OIDC/LDAP (Connexion & identité) : le formulaire enregistre et teste réellement la connexion au fournisseur, mais ne sert pas encore de second chemin de connexion actif (voir le manuel intégré, section identité) — à finir si l'onboarding d'une organisation via un annuaire existant (Entra ID, Okta, Google Workspace) est voulu plutôt que la création manuelle de comptes.
- Bitbucket non intégré (GitLab/GitHub/Gitea le sont).

### Pistes pour une vraie plateforme "Internal Developer Platform" (audit du 2026-08-17)

Nexus Console couvre bien l'observation/pilotage d'une infrastructure déjà existante (lecture + actions ponctuelles sur K8s/ArgoCD/Traefik/HAProxy/GitLab-GitHub-Gitea, scans de sécurité réels, coffres de secrets). Ce qui manque pour devenir une IDP au sens Backstage/Port/Cortex (self-service développeur, pas seulement pilotage admin) :

- **Golden path / scaffolding** : un assistant "Nouvelle application" qui génère un dépôt depuis un template (repo Git + Dockerfile + pipeline CI + Application Argo CD + entrée catalogue), en un clic pour un développeur — aujourd'hui chaque brique (dépôt, déploiement, Argo CD) se relie manuellement pièce par pièce.
- **Catalogue de services avec propriétaire et graphe de dépendances** : les "Projets" existent mais restent un regroupement organisationnel, pas un catalogue technique (quel service appelle quel autre, qui le possède, quel est son SLA/sa criticité).
- **Environnements éphémères par Pull/Merge Request** (preview deployments), avec nettoyage automatique — utile pour les revues visuelles avant merge.
- **Visibilité coût** par projet/namespace (même approximative, dérivée des requêtes de ressources Kubernetes déjà lisibles).
- **API/CLI publique documentée** avec jetons d'API par utilisateur, pour scripter la plateforme depuis la CI/CD externe plutôt que seulement depuis le navigateur.
- **Documentation-as-code (TechDocs)** : le Wiki d'équipe est une page indépendante ; un vrai IDP affiche la doc rendue directement depuis un dossier `docs/` du dépôt de chaque service.
- ~~Politique de sécurité réellement bloquante~~ — fait : `environmentPromotionService.js` refuse désormais (422) une promotion vers un environnement de production si le dernier scan Semgrep contient une ERROR ou le dernier scan ZAP une alerte High, avant tout appel à Argo CD (pas seulement l'indicateur visuel de Supply Chain Security). Non testé en conditions réelles faute de socle relationnel (Postgres) configuré dans cet environnement de développement — vérifié par lecture de code et correspondance exacte des clés `counts.ERROR`/`counts.High` avec `semgrepService.js`/`dastService.js`.

Déjà fait (retiré de cette liste après vérification du code) : redirection directe vers ArgoCD (lien par application, `deploymentService.js`) et vers Proxmox (`ProxmoxPage.jsx`) ; icônes personnalisées pour les organisations ; rôles de projet à granularité fine par ressource (coffre-fort) ; matrice de permissions par groupe (RBAC domaine + niveau, câblée) ; Security Gate rendu réel (calculé sur les derniers scans, plus de chiffres en dur) ; tableau "Dépôt d'images" factice supprimé (doublonnait le vrai registre privé).
