# todo-lot54.md — Repository provisioning : modèle de données (Lot 54)

En-tête : ce fichier documente le Lot 54, réalisé en parallèle d'une autre session qui
modifiait `todo.md` au même moment (règle de non-conflit : ne jamais éditer un fichier en
cours d'édition par l'autre session). Contenu à fusionner dans `todo.md` (section Étape 20 /
chantiers #41-#43) une fois la fusion possible sans conflit.

## Contexte

Étape 20 du plan (`fais-tout-ce-que-misty-ullman.md`) — Repository provisioning — était
documentée comme bloquée : "construire le modèle sans jamais pouvoir tester un appel réel =
succès simulé". Ce lot construit et teste réellement la **moitié testable** : le modèle de
données et le CRUD de demandes de provisioning (statut `pending`), sans jamais appeler
GitHub/GitLab/Gitea.

## Fait

- [x] Migration `backend/src/db/migrations/0042_managed_repositories.sql` : table
  `managed_repositories` (provider/owner/name, `org_id`/`project_id`/`team_id`/`component_id`
  en FK, `template_key`, `status` CHECK `pending`/`provisioned`/`failed` — défaut `pending`,
  jamais un statut inventé, `status_detail`, `web_url`, `requested_by`, timestamps,
  UNIQUE(provider, owner, name)). Table backend pure, aucun couplage à un fichier frontend
  protégé.
- [x] Store `backend/src/store/managedRepositoriesStore.js` (nouveau fichier) : CRUD complet
  (`listManagedRepositories` avec filtres org/project/team/status, `getManagedRepository`,
  `createProvisioningRequest` — toujours statut `pending` en sortie —, `updateProvisioningStatus`
  — fonction préparée pour un futur provisioning réel mais non appelée par aucune route
  actuellement —, `deleteManagedRepository`), + 2 templates de départ en constante
  `REPOSITORY_TEMPLATES` (React/Vite, Node API/Express) — métadonnées seulement (nom,
  description, stack), aucune génération de fichiers.
- [x] Routes `backend/src/routes/repositoryProvisioning.routes.js` (nouveau fichier) :
  `GET /repository-provisioning/templates`, `GET /repository-provisioning` (filtrable,
  accès restreint par appartenance à l'organisation ou admin plateforme),
  `GET /repository-provisioning/:id`, `POST /repository-provisioning` (crée une demande au
  statut `pending`, réservé owner/admin d'organisation, 409 si owner/name/provider déjà
  demandé, 400 si `templateKey` inconnu), `DELETE /repository-provisioning/:id`. Commentaire
  d'en-tête explicite : aucun appel réel à GitHub n'est effectué, la fonction `provision()`
  qui appellerait `githubPlatformService` avec des credentials de plateforme réels n'existe
  pas — nécessite le compte GitHub de plateforme (Étape 19 du plan, géré par l'utilisateur).
- [x] Route enregistrée dans `backend/src/routes/index.js` (fichier non protégé, ajout de 2
  lignes : import + `router.use('/repository-provisioning', ...)`).
- [x] Test réel de bout en bout (backend lancé sur le port 4200 dédié à cette session, log
  `/tmp/nexus-backend-4200.log`, contre Postgres `nexus-dev-postgres:5433`) : migration
  0042 appliquée automatiquement au démarrage, connexion admin réelle, `GET /templates`
  (2 templates), `POST /` (création réelle en base, statut retourné = `pending`, jamais
  `success`), `GET /?orgId=...` (la demande apparaît), `POST` en double (409 réel, contrainte
  UNIQUE respectée), `POST` avec `templateKey` invalide (400 réel), `GET /:id`, `DELETE /:id`
  (suppression réelle, `GET /:id` renvoie ensuite 404). Aucune fausse réussite affichée.
- [x] Backend de test arrêté après vérification (`pkill` sur le process port 4200) — ne
  tourne plus en arrière-plan.

## Limites documentées (volontairement non traitées)

- **Aucun appel réel à GitHub/GitLab/Gitea** : `provision()` n'existe pas. C'est la limite
  décrite explicitement dans la tâche — construire cette partie sans pouvoir la tester
  contre un vrai compte de plateforme GitHub serait un succès simulé. `updateProvisioningStatus`
  existe côté store pour recevoir un futur résultat réel mais n'est appelée par aucune route.
- **Pas d'UI frontend** : demandé explicitement de ne pas toucher `ProjectDetailPage.jsx`
  (fichier protégé, en cours d'édition par l'autre session). Aucune page/`onglet` ne permet
  donc de créer une demande de provisioning depuis l'interface — seules les routes API
  existent et ont été testées via curl. À construire dans une session future, une fois
  `ProjectDetailPage.jsx` libre.
- **Seulement 2 templates** (React, Node API) sur les 9 prévus par le plan (Python API,
  Worker, Library, Docusaurus, Storybook, Design System, API Docs) — volontairement limité
  à un point de départ réaliste et testable ; les autres sont de simples entrées de constante
  à ajouter plus tard, aucun obstacle technique.
- **Pas de Development Shortcuts contextuels** (deuxième moitié du chantier #43,
  affichage automatique par projet) : hors périmètre de ce lot (modèle de données
  uniquement), et dépend aussi de pages frontend potentiellement protégées.

## Fichiers touchés (uniquement les miens)

- `backend/src/db/migrations/0042_managed_repositories.sql` (nouveau)
- `backend/src/store/managedRepositoriesStore.js` (nouveau)
- `backend/src/routes/repositoryProvisioning.routes.js` (nouveau)
- `backend/src/routes/index.js` (2 lignes ajoutées : import + montage de la route)

Aucun fichier protégé (liste fournie en tâche) n'a été lu-puis-édité, modifié, ni ajouté au
staging.
