-- Commentaires génériques (todo.md ligne ~118, chantier "Activity Feed"
-- débloqué séparément au Lot 42) : les tâches (task_comments) et les
-- incidents (incident_comments) ont déjà des commentaires + mentions
-- @utilisateur, mais aucune ressource "projet" ou "document wiki" n'en a.
-- Plutôt qu'une nouvelle table par type de ressource (pattern suivi jusqu'ici),
-- une table polymorphe unique : entity_type + entity_id identifient la
-- ressource commentée (projets.id ou wiki_pages.id, tous deux UUID),
-- réutilisable pour d'autres types de ressources sans nouvelle migration.
CREATE TABLE IF NOT EXISTS entity_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_comments_entity ON entity_comments(entity_type, entity_id, created_at);
