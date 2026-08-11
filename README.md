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
- `src/middleware/auth.js` : sessions JWT en cookie httpOnly.
- Ajouter une intégration future = un fichier dans `services/integrations/`, une entrée dans
  `settingsStore.SECRET_FIELDS`, une route — sans toucher au reste.

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
# Backend
cd backend
cp .env.example .env   # définir au minimum ADMIN_EMAIL / ADMIN_PASSWORD / JWT_SECRET
npm install
npm run dev             # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev              # http://localhost:5173 (proxy /api vers le backend)
```

Au premier démarrage, le backend crée automatiquement un compte administrateur à partir de
`ADMIN_EMAIL` / `ADMIN_PASSWORD`. Connectez-vous puis renseignez vos intégrations depuis
**Paramètres** : chaque page (Kubernetes, Réseaux, Infrastructure, Monitoring...) reste vide et
affiche "non configuré" tant que l'intégration correspondante n'a pas d'URL/token valides — aucun
service externe n'est requis pour explorer la console.

## Sécurité

- Secrets chiffrés au repos (AES-256-GCM), jamais exposés au frontend.
- Sessions JWT en cookie httpOnly + `express-rate-limit` sur l'authentification et les Paramètres.
- En-têtes de sécurité via `helmet`, CORS restreint à `FRONTEND_ORIGIN`.
- Déployez la console derrière votre propre reverse proxy (Traefik/HAProxy) sur un domaine dédié ;
  `NEXUS_MASTER_KEY` et `JWT_SECRET` doivent être définis explicitement en production.
