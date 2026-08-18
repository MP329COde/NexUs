# Nexus CLI

Scripte l'API réelle de la console Nexus (`backend/src/routes/*.js`) —
aucune route n'a été inventée pour ce CLI, chaque commande appelle un
endpoint déjà utilisé par le frontend web ou par l'API publique
`/api/v1` (Service Accounts, voir `backend/src/routes/apiV1.routes.js`).

## Installation

```bash
cd cli
npm link   # ou : node bin/nexus.js directement
```

## Authentification

`nexus login` réutilise exactement le même JWT de session que le cookie
posé par la connexion navigateur (`middleware/auth.js#requireAuth` accepte
aussi bien le cookie que `Authorization: Bearer <token>`) — pas un second
mécanisme d'authentification. Le jeton est stocké dans
`~/.nexus/config.json` (mode `0600`).

Pour un usage CI/CD non interactif, préférez un Service Account
(`POST /organizations/:id/service-accounts`) et exportez son jeton
directement plutôt que d'automatiser un login humain :

```bash
export NEXUS_TOKEN=nxs_sa_...   # à venir : support direct dans le CLI
```

## Commandes → endpoints

| Commande | Endpoint |
| --- | --- |
| `nexus login <url> <email>` | `POST /api/auth/login` |
| `nexus logout` | (local uniquement) |
| `nexus whoami` | `GET /api/auth/me` |
| `nexus catalog list` | `GET /api/catalog/components` |
| `nexus service get <id>` | `GET /api/catalog/components/:id` |
| `nexus env list <legacyProjectId>` | `GET /api/projects/:id/environments` |
| `nexus deploy <legacyProjectId> <linkId>` | `POST /api/projects/:id/deployments/:linkId/sync` |
| `nexus promote <legacyProjectId> <envId>` | `POST /api/projects/:id/environments/:envId/promote` |
| `nexus rollback <legacyProjectId> <envId> <toPromotionId>` | `POST /api/projects/:id/environments/:envId/rollback` |
| `nexus logs <namespace> <pod>` | `GET /api/kubernetes/pods/:namespace/:pod/logs` |

## Tests

```bash
npm test   # logique pure (formatage, config) — pas d'appel réseau
```

La vérification de bout en bout (contre un vrai backend) se fait
manuellement : voir l'historique de commits pour le protocole utilisé
(login réel, liste réelle, échec honnête après logout).
