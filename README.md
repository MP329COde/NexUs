# Nexus Console

Console centrale de développement, d'administration système et de gestion réseau pour un homelab :
Kubernetes, Argo CD, HAProxy, GitLab, Proxmox, Traefik, Cert-Manager et Grafana depuis une seule interface.

## Architecture

```
backend/     API Node.js/Express — seule couche autorisée à parler aux services d'infrastructure
frontend/    Console React/Vite — ne communique qu'avec le backend (/api)
base/        Mockup de design original (référence visuelle, non exécuté)
```

Le frontend ne contacte jamais directement Kubernetes, Proxmox, GitLab, etc. : toutes les requêtes
passent par l'API `backend`, qui détient les secrets (chiffrés au repos) et applique les changements.

### Backend (`backend/`)

- `src/services/integrations/*` : un module par intégration (Kubernetes, Argo CD, HAProxy, GitLab,
  Proxmox, Traefik, Cert-Manager, Grafana). Chaque module expose `getStatus()` et des fonctions
  métier ; si l'intégration n'est pas configurée, il répond `{ configured: false }` plutôt que
  d'échouer, pour que la console reste utilisable dès l'installation.
- `src/services/proxyService.js` / `deploymentService.js` : logique métier "gestion de proxy" et
  "pipeline de déploiement" (Git → CI/CD → Argo CD → Kubernetes → reverse proxy).
- `src/store/*` : persistance JSON locale (`backend/data/`, ignorée par git). Les secrets (tokens,
  mots de passe) sont chiffrés en AES-256-GCM avant écriture (`src/utils/crypto.js`) et ne sont
  jamais renvoyés en clair au frontend (`settingsStore.getRedactedIntegration`).
- `src/middleware/auth.js` : sessions JWT en cookie httpOnly (authentification, rôle global admin/user).
- `src/db/` + `src/store/orgStore.js` : socle relationnel PostgreSQL (organisations, projets, membres à
  rôle granulaire `viewer < developer < maintainer < owner`, environnements). Coexiste délibérément
  avec le store JSON/SQLite historique (stratégie "strangler" — voir section dédiée ci-dessous) : les
  deux couches de persistance sont actives en parallèle pendant la migration progressive.
- `src/middleware/projectAccess.js` : applique le rôle projet à chaque route `/api/projects/:id/*`,
  avec repli automatique sur l'ancien modèle (`memberIds` plat) pour un projet pas encore migré vers
  Postgres — jamais de régression silencieuse d'accès.
- Ajouter une intégration future = un fichier dans `services/integrations/`, une entrée dans
  `settingsStore.SECRET_FIELDS`, une route — sans toucher au reste.

### Socle relationnel (organisations, projets, environnements)

Le modèle métier central (organisations → équipes → projets → environnements, avec permissions
appliquées au backend et jamais seulement côté frontend) vit dans PostgreSQL, distinct du store
JSON/SQLite historique qui continue de porter le reste (intégrations, coffre-fort, terminal, audit...).

- `DATABASE_URL` (variable d'environnement) active cette couche. Absente : la console fonctionne
  normalement, mais reste en isolation "legacy" (appartenance simple à un projet, sans rôle fin) —
  `GET /api/setup/status` expose `postgresConfigured` pour le signaler honnêtement.
- Migrations SQL versionnées dans `src/db/migrations/`, appliquées automatiquement au démarrage
  (`src/db/migrate.js`, idempotent, transactionnel par fichier).
- `npm run migrate:postgres` (backend) importe les utilisateurs et projets existants du store JSON
  historique vers Postgres, sans les supprimer ni les modifier — rejouable sans effet de bord.
- Rôles projet, du moins au plus privilégié : `viewer` (lecture) < `developer` (tâches, raccourcis,
  coffre-fort projet) < `maintainer` (édition du projet, gestion des membres) < `owner` (suppression,
  promotion d'autres membres owner). Un administrateur de plateforme (rôle global historique) garde un
  accès `owner` implicite à tous les projets.
- Équipes (`teams`/`team_members`) : regroupement d'utilisateurs à l'échelle d'une organisation,
  distinct des projets — `src/routes/teams.routes.js`. Lecture réservée aux membres de l'organisation
  (l'org reste la frontière englobante), gestion des membres réservée au lead de l'équipe.
- Jobs asynchrones (`src/services/jobService.js`) : les opérations longues (synchronisation/rollback
  Argo CD, scan réseau nmap) sont persistées en base et exécutées en tâche de fond au lieu de bloquer
  la requête HTTP — suivi via `GET /api/projects/:id/jobs/:jobId` ou `GET /api/jobs/:id` (portée
  globale). Un job resté `running` au redémarrage du process est explicitement marqué en échec
  (jamais de statut fantôme).
- Incidents (`src/store/incidentStore.js`) : gravité, état, résolution obligatoirement documentée
  avant de clore, commentaires. Vue globale réservée aux administrateurs (`GET /api/incidents`),
  agrégée avec les intégrations en erreur et les jobs en échec dans `GET /api/system/overview`
  (affiché sur la page d'accueil pour les administrateurs).
- **Ce qui reste en Phase 1b** (documenté explicitement plutôt que masqué) : migration des collections
  restantes du store JSON (intégrations, coffre-fort, audit, hôtes...) vers Postgres, UI de gestion des
  organisations/équipes/rôles (l'API existe : `/api/organizations`, `/api/teams`,
  `/api/projects/:id/members`, `/api/projects/:id/environments`), généralisation de l'architecture de
  jobs aux opérations restées synchrones (provisioning SSH — a son propre suivi en mémoire volontaire,
  voir `provisioningService.js`).

### Frontend (`frontend/`)

- `src/config/domains.js` : navigation par domaine (Vue générale, Développement, Infrastructure,
  Kubernetes, Réseaux, Monitoring, Sécurité*, Stockage*, Paramètres). Les domaines marqués `stub`
  affichent un espace réservé prêt à accueillir un module futur sans changer l'architecture.
- `src/config/integrationForms.js` : schéma déclaratif des formulaires de la page Paramètres.
- `src/styles/theme.css` : jetons de design (couleurs, typographies) repris du mockup
  `base/Nexus Console.dc.html`.
- `src/pages/*` : une page par domaine, `src/components/ui/*` : primitives réutilisables
  (Panel, KpiCard, DataTable, StatusBadge...).

## Démarrage local

```bash
# Base relationnelle (organisations/projets/environnements — optionnelle, voir
# section "Socle relationnel" ci-dessus ; sans elle la console fonctionne en
# isolation legacy)
docker run -d --name nexus-postgres -e POSTGRES_DB=nexus -e POSTGRES_USER=nexus \
  -e POSTGRES_PASSWORD=changeme -p 5432:5432 postgres:16-alpine

# Backend
cd backend
cp .env.example .env   # définir au minimum ADMIN_EMAIL / ADMIN_PASSWORD / JWT_SECRET
npm install
DATABASE_URL=postgres://nexus:changeme@localhost:5432/nexus npm run dev   # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev              # http://localhost:5173 (proxy /api vers le backend)
```

Au premier démarrage, le backend crée automatiquement un compte administrateur à partir de
`ADMIN_EMAIL` / `ADMIN_PASSWORD`, et applique les migrations Postgres si `DATABASE_URL` est défini.
Connectez-vous puis renseignez vos intégrations depuis **Paramètres** : chaque page (Kubernetes,
Réseaux, Infrastructure, Monitoring...) reste vide et affiche "non configuré" tant que l'intégration
correspondante n'a pas d'URL/token valides — aucun service externe n'est requis pour explorer la
console. Si vous aviez déjà des projets créés avant d'activer `DATABASE_URL`, importez-les avec
`npm run migrate:postgres` (rejouable, ne supprime rien).

## Sécurité

- Secrets chiffrés au repos (AES-256-GCM), jamais exposés au frontend.
- Sessions JWT en cookie httpOnly + `express-rate-limit` sur l'authentification et les Paramètres.
- En-têtes de sécurité via `helmet`, CORS restreint à `FRONTEND_ORIGIN`.
- Déployez la console derrière votre propre reverse proxy (Traefik/HAProxy) sur un domaine dédié ;
  `NEXUS_MASTER_KEY` et `JWT_SECRET` doivent être définis explicitement en production.
