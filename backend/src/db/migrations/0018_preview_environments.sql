-- Preview Environments (ÉTAPE 11 IDP) : un environnement de type "preview"
-- peut référencer la branche/commit/PR qui l'a produit et expirer
-- automatiquement (TTL hérité de son blueprint à la création — voir
-- environment_blueprints.ttl_minutes, migration 0014). NexUs ne crée aucune
-- ressource Kubernetes réelle à partir de ces colonnes : c'est une
-- déclaration/un suivi, la destruction effective reste une action manuelle
-- (DELETE /projects/:id/environments/:envId) tant qu'aucune brique de
-- provisioning fiable n'existe (même prudence que Environment Blueprints).
ALTER TABLE environments ADD COLUMN IF NOT EXISTS source_branch TEXT NOT NULL DEFAULT '';
ALTER TABLE environments ADD COLUMN IF NOT EXISTS source_commit TEXT NOT NULL DEFAULT '';
ALTER TABLE environments ADD COLUMN IF NOT EXISTS source_pr_url TEXT NOT NULL DEFAULT '';
ALTER TABLE environments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_environments_expires_at ON environments(expires_at) WHERE expires_at IS NOT NULL;
