-- Dependency Graph (ÉTAPE 14 IDP) : dépendances déclarées entre composants
-- du Software Catalog (ex. frontend → billing-api → postgres). Un composant
-- "postgres"/"redis" n'a pas besoin d'exister comme composant applicatif à
-- part entière pour être une dépendance : depends_on_component_id référence
-- toujours un vrai composant du catalogue (pas de nom libre), pour que le
-- graphe reste cliquable et navigable dans les deux sens plutôt qu'une
-- simple étiquette texte.
CREATE TABLE IF NOT EXISTS component_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  depends_on_component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'runtime' CHECK (kind IN ('runtime', 'build', 'data')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (component_id <> depends_on_component_id),
  UNIQUE (component_id, depends_on_component_id)
);

CREATE INDEX IF NOT EXISTS idx_component_dependencies_component ON component_dependencies(component_id);
CREATE INDEX IF NOT EXISTS idx_component_dependencies_depends_on ON component_dependencies(depends_on_component_id);
