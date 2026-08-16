# Fonctions de Nexus Console

Inventaire des fonctionnalités réellement présentes dans le projet (backend `backend/`, frontend `frontend/`). Ce fichier doit être mis à jour à chaque fonctionnalité ajoutée/modifiée — ne documente que ce qui existe réellement dans le code, jamais ce qui est prévu (voir la section "Propositions" pour ça).

## Backend — Routes (`backend/src/routes/*.js`)

- **argocd.routes.js** — Statut ArgoCD, liste des applications, détail d'une application (sync status).
- **audit.routes.js** — Consultation du journal d'audit (liste + export CSV).
- **auth.routes.js** — Connexion (e-mail **ou nom d'utilisateur**)/déconnexion, session (`/me`), profil, mot de passe, onboarding première connexion. Verrouillage de compte après échecs répétés + bannissement IP automatique en cas d'attaque ciblée (voir `usersStore.js`).
- **backups.routes.js** — Liste, création, import, téléchargement, restauration, suppression de sauvegardes.
- **certmanager.routes.js** — Statut cert-manager, liste des certificats (CRD Kubernetes), renouvellement forcé.
- **console.routes.js** — Info console minimale (authentifiée).
- **deployments.routes.js** — CRUD de liens de déploiement (projet↔dépôt↔cible), pipeline associé, sync GitOps, diff, historique, rollback.
- **devtools.routes.js** — Détection des outils dev présents sur la machine backend (git, docker, kubectl, node...).
- **domains.routes.js** — Liste des domaines gérés.
- **github.routes.js** — Statut, dépôts, workflow runs, pull requests GitHub.
- **gitlab.routes.js** — Statut, projets, pipelines, merge requests GitLab, miroirs GitLab→GitHub (admin).
- **grafana.routes.js** — Statut Grafana, dashboards, alertes.
- **groups.routes.js** — CRUD des groupes d'utilisateurs.
- **haproxy.routes.js** — Statut, backends, serveurs (état runtime + changement d'état admin), frontends (Data Plane API).
- **hosts.routes.js** — Clé publique SSH console, catalogue d'agents, CRUD hôtes, hôtes critiques, installation d'agent via SSH.
- **dockerHub.routes.js** — Consultation du registre public Docker Hub (tags, métadonnées), sans authentification.
- **imageScans.routes.js** — Scan de vulnérabilités d'une image via Trivy (admin), historique des scans.
- **codeScans.routes.js** — Analyse statique de code via Semgrep sur le code source de la plateforme (admin), historique des scans.
- **iacScans.routes.js** — Analyse IaC (Dockerfiles) via Checkov sur la plateforme (admin), historique des scans.
- **notifications.routes.js** — Alertes de sécurité persistantes (admin) : liste, marquage lu/tout lu.
- **identity.routes.js** — Config d'identité (OIDC/LDAP), test de connexion OIDC.
- **incidents.routes.js** — Liste globale des incidents.
- **inventory.routes.js** — CRUD inventaire matériel/logiciel.
- **jobs.routes.js** — Liste (admin) et suivi d'un job asynchrone.
- **kubernetes.routes.js** — Namespaces, pods, deployments, services, logs/describe/metrics/owners de pod, restart/scale/rollback/purge deployment, suppression de pod.
- **networkTopology.routes.js** — Topologie réseau agrégée (proxies, HAProxy, Traefik, Proxmox, K8s).
- **organizations.routes.js** — Liste/création d'organisations, projets d'une organisation.
- **pipelines.routes.js** — Vue agrégée des runs CI (GitLab+GitHub), relance d'un run.
- **projects.routes.js** — CRUD projets (allowlist stricte des champs modifiables), membres, environnements, espace de travail, webhook & rotation secret, déploiements liés, jobs, incidents, changements, fenêtres de maintenance, tâches, raccourcis, coffre-fort projet, **mot de passe de coffre-fort projet** (`PUT`/`DELETE /:id/vault-password`).
- **proxies.routes.js** — CRUD proxies, test de connexion, application HAProxy/Traefik, marquage critique.
- **proxmox.routes.js** — Statut, nœuds, VMs, actions (start/shutdown/reboot).
- **repos.routes.js** — Dépôts GitLab+GitHub, métadonnées locales, arborescence/fichier, proposition de changement (branche+commit+MR/PR).
- **reviews.routes.js** — MR/PR ouvertes, assignation locale de relecteur, approbation proxifiée.
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
- **wazuh.routes.js** — Statut, agents, résumé Wazuh.
- **webhooks.routes.js** — Réception de webhooks entrants GitLab/GitHub par projet.

## Backend — Services (`backend/src/services/**/*.js`)

- **agentCatalog.js** — Catalogue fermé de scripts d'installation d'agents.
- **auditService.js** — Journalisation des actions admin sensibles (1000 entrées max).
- **backupService.js** — Sauvegarde/restauration complètes, rétention 14 jours, planifiée quotidiennement (3h).
- **deploymentService.js** — Liens de déploiement, agrégation pipeline, sync GitOps via ArgoCD/K8s.
- **devToolsService.js** — Détection d'outils dev locaux (`which`), inclut désormais Trivy.
- **trivyService.js** — Scan de vulnérabilités réel via le binaire Trivy (Aqua Security, open source) installé sur la machine backend ; jamais de service tiers hébergé.
- **gitMirrorService.js** — Miroir automatique GitLab→GitHub.
- **hostMetricsService.js** — Sonde TCP + métriques SSH, rafraîchissement 30s.
- **infraLoadService.js** — Échantillonnage en mémoire (6h) de la charge Proxmox.
- **integrationRegistry.js** — Registre central des intégrations disponibles.
- **jobService.js** — Exécution asynchrone en process, suivi persisté.
- **networkScanService.js** — Scan nmap sur cible validée strictement.
- **networkTopologyService.js** — Agrégation topologie depuis les intégrations configurées.
- **pgDumpService.js** — Export/import JSON du socle relationnel Postgres.
- **pipelineNormalizer.js** — Normalisation commune des runs CI GitLab/GitHub Actions.
- **projectWorkspaceService.js** — Agrégation de l'état des dépôts liés à un projet.
- **provisioningService.js** — Suivi des jobs d'installation de l'assistant setup.
- **proxyService.js** — CRUD proxies + application vers Traefik/HAProxy.
- **serviceCatalog.js** — Catalogue fermé de scripts d'installation de services complets.
- **sshExecutor.js** — Exécution de scripts catalogués via clé SSH unique console.
- **statusHistoryService.js** — Relevé horaire de disponibilité des services critiques (30 jours), planifié.
- **terminalService.js** — Grammaire de commandes fixe routée vers kubernetesService.
- **trafficMonitorService.js** — Tampon circulaire du trafic API, détection IPs suspectes.
- **updateService.js** — Vérification des mises à jour via git.
- **vaultRotationService.js** — Vérifie toutes les 30s les entrées de coffre dont la rotation (2-5 min) est due et régénère leur secret.
- **secretLeakScanService.js** — Scan quotidien (4h) des dépôts liés à un projet, rotation automatique immédiate si un secret prod/projet connu est trouvé en clair.
- **integrations/argocdService.js** — API REST ArgoCD réelle.
- **integrations/certManagerService.js** — CRD Kubernetes cert-manager.
- **integrations/githubService.js** — API REST GitHub réelle (repos, runs, PR, arborescence/fichier, commit, branche, PR).
- **integrations/gitlabService.js** — API v4 GitLab réelle (projects, pipelines, MR, branches, commits, mirrors, arborescence/fichier, commit, branche, MR).
- **integrations/grafanaService.js** — API REST Grafana réelle.
- **integrations/haproxyService.js** — Data Plane API v2/v3 réelle.
- **integrations/httpClient.js** — Client HTTP axios normalisé + erreur commune.
- **integrations/kubernetesService.js** — Le plus complet : namespaces, pods, deployments, services, logs, describe, metrics, restart/scale/rollback/purge, exec.
- **integrations/proxmoxService.js** — API2 JSON réelle.
- **integrations/traefikService.js** — API REST réelle, écriture de routes dynamiques.
- **integrations/wazuhService.js** — API REST avec cache JWT (token 14min).

Toutes les intégrations suivent le même patron : `notConfigured()` si non paramétrées côté Paramètres, sinon appel API réel — aucune donnée simulée/mockée.

## Backend — Stores (`backend/src/store/*.js`, pertinents)

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
- **ServiceAvailabilityPanel.jsx** — Disponibilité 24h par service important.

### Développement (Deployments)

- **ProjectsPage.jsx** — Liste/création de projets, **icône (emoji) et couleur personnalisées**.
- **ProjectDetailPage.jsx** — Fiche projet complète.
- **OrganizationsPage.jsx** — Organisations (socle PostgreSQL).
- **GitReposPage.jsx** — Dépôts GitLab+GitHub, étiquetage manuel.
- **PipelinesPage.jsx / PipelineView.jsx / GitOpsDiffPanel.jsx** — Pipelines CI agrégés, détail, diff GitOps.
- **ManifestExplorerModal.jsx** — Navigation/édition YAML → commit → MR/PR.
- **CodeReviewsPage.jsx** — MR/PR réelles, assignation locale de relecteurs.
- **ContainersPage.jsx** — Pods Kubernetes réels ; Docker non intégré.
- **EnvironmentsPage.jsx** — Démonstration (pas de modèle multi-environnements réel).
- **ImagesRegistryPage.jsx** — Tableau de dépôt d'images en démonstration (aucun registre privé intégré), mais **scanner Trivy réel** (TrivyScanPanel.jsx) et **recherche Docker Hub en direct** (DockerHubLookupPanel.jsx, registre public réel).
- **ReleasesPage.jsx** — Démonstration.
- **SupplyChainPage.jsx** — Pipeline avec badges honnêtes (Réel/Partiel/Non intégré) ; **CodeScanPanel.jsx** (Semgrep) et **IacScanPanel.jsx** (Checkov) réels. Reste non intégré : SBOM, signature.
- **TestsQualityPage.jsx** — Démonstration.
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
- **ProxmoxPage.jsx** — Nœuds/VMs Proxmox, actions avec confirmation.
- **InfrastructureLayout.jsx** — Layout de section.

### Kubernetes

- **KubernetesPage.jsx** — Namespaces/pods/deployments/services.
- **PodDetailDialog.jsx / PodLogsDialog.jsx / DiagnosticsModal.jsx** — Détail, logs, diagnostic d'un pod/deployment.
- **ServicesPage.jsx** — Services Kubernetes.
- **TerminalPage.jsx** — Terminal sécurisé, grammaire de commandes fixe, **formulaire de demande d'accès self-service** si aucun palier n'est attribué.
- **KubernetesLayout.jsx** — Layout de section.

### Réseau

- **NetworkPage.jsx / ProxyFormDialog.jsx / AttachFrontendDialog.jsx** — Proxies et domaines.
- **HAProxyPage.jsx** — Backends/frontends/servers en direct.
- **CertificatesPage.jsx** — Certificats cert-manager, renouvellement.
- **FirewallPage.jsx** — Trafic API temps réel, IPs suspectes, blocage.
- **TopologyPage.jsx** — Topologie depuis les intégrations configurées.
- **NetworkLayout.jsx** — Layout de section.

### Monitoring / Stockage / Sécurité / autres

- **MonitoringPage.jsx** — Statut/dashboards/alertes Grafana.
- **StoragePage.jsx** — CRUD volumes/NAS/pools ZFS/partages (local, pas d'intégration réelle).
- **SecurityPage.jsx** — Scans nmap, overview sécurité.
- **ReportPage.jsx** — Rapport imprimable.
- **ManualPage.jsx** — Documentation intégrée.
- **AccountPage.jsx** — Profil utilisateur, préférences, **import d'image de profil** (redimensionnement client 256×256, mutuellement exclusif avec l'emoji).

### Connexion / Onboarding / Installation

- **LoginPage.jsx / LoginVisual.jsx** — Connexion par e-mail ou nom d'utilisateur.
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
- **SystemPanel.jsx** — Version, mise à jour, overview.
- **PlatformPanel.jsx** — Paramètres généraux.
- **InfrastructureStatusPanel.jsx** — Statut de chaque intégration.
- **RestoreBackupDialog.jsx** — Import/restauration de sauvegarde.

## Frontend — Composants partagés notables

- **components/vault/RotationCountdown.jsx** — Compte à rebours avant rotation automatique d'un secret, ré-authentification silencieuse tant que le panneau reste ouvert.
- **components/ui/Avatar.jsx** — Avatar utilisateur à trois niveaux (image importée > emoji > initiales), utilisé par Header.jsx et AccountPage.jsx.

## Intégrations externes

| Intégration | Niveau | Détail |
| --- | --- | --- |
| GitHub | Complet | repos, workflow runs, PR, création de dépôt (miroir) |
| GitLab | Complet | projects, pipelines, MR, branches, commits, push mirrors |
| Proxmox | Complet | nodes, VMs, actions start/shutdown/reboot |
| Kubernetes | Complet | namespaces, pods, deployments, services, logs, exec, scale, rollback |
| ArgoCD | Complet | applications, sync status, diff GitOps |
| Grafana | Complet | dashboards, alertes, health |
| HAProxy | Complet | Data Plane API : backends, frontends, servers |
| Traefik | Complet | routers, services, écriture de routes dynamiques |
| Wazuh | Complet | agents, résumé, auth JWT cachée |
| cert-manager | Complet (dépendant) | Via CRD Kubernetes |
| Docker | Absent | Jamais intégré |
| Registre d'images (Harbor/GHCR) | Stub | Démonstration uniquement |
| Scanners sécurité (SAST/SCA/SBOM) | Stub | Documentation du pipeline cible sans rien connecter |
| Frameworks de tests | Stub | Page en anticipation |
| Multi-environnements | Stub | Démonstration |
| nmap | Complet | Exécution réelle, validation stricte de cible |
| Trivy | Complet | Binaire local (Aqua Security, open source), scan d'image à la demande |
| Docker Hub (public) | Complet | API v2 publique, sans authentification, recherche de tags en direct |
| Semgrep | Complet | Binaire local (open source, règles communautaires gratuites), scan à la demande sur le code de la plateforme |
| Checkov | Complet | Binaire local (open source, Bridgecrew CE), scan IaC (Dockerfiles) à la demande |
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

- Registre privé (Harbor/GHCR authentifié) — Docker Hub public est fait ; scan de vulnérabilités horaire automatique (le scan Trivy est à la demande pour l'instant, pas planifié).
- SBOM (ex. Syft) et signature d'image (ex. Cosign/Sigstore) — tout le reste du pipeline Supply Chain Security est réel (source, SAST, secrets, dépendances/conteneur, IaC, déploiement).
- Modèle multi-environnements réel (dev/staging/prod) avec bascule visuelle.
- Clés d'accès (WebAuthn/passkeys) — la connexion par nom d'utilisateur (sans e-mail) est faite, pas encore les passkeys.
- Icônes personnalisées pour les organisations (faites pour les projets ; nécessite une migration Postgres pour les organisations, socle relationnel non configuré sur cette instance — non testable ici).
- Rôles par projet avec granularité fine par ressource (au-delà de viewer/developer/maintainer/owner déjà en place via le socle relationnel).

Déjà fait (retiré de cette liste après vérification du code) : redirection directe vers ArgoCD (lien par application, `deploymentService.js`) et vers Proxmox (`ProxmoxPage.jsx`) — existaient déjà avant cet inventaire.
