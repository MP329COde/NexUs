-- Granularité fine par ressource, en complément (jamais en remplacement) du
-- rôle projet global viewer < developer < maintainer < owner : un
-- maintainer/owner peut accorder à un membre un accès ponctuel au
-- coffre-fort du projet sans le promouvoir sur tout le reste. Un rôle
-- global déjà suffisant prime toujours (voir orgStore.hasResourceAccess) —
-- cette table n'élargit jamais un accès plus bas qu'un rôle global ne le
-- fait déjà, elle ne fait que combler l'écart pour un membre en dessous du
-- seuil requis. `resource` reste une colonne (pas juste une table
-- "vault_grants") pour pouvoir accueillir une future ressource projet du
-- même genre sans nouvelle migration — le terminal sécurisé n'en fait PAS
-- partie : son accès est un palier global par utilisateur
-- (usersStore.setTerminalTier), sans rapport avec un projet précis.
CREATE TABLE IF NOT EXISTS project_resource_grants (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  resource TEXT NOT NULL CHECK (resource IN ('vault')),
  level TEXT NOT NULL CHECK (level IN ('read', 'write')),
  granted_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id, resource)
);
