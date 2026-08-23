-- Chaîne Projet → Repository → Pipeline → Image Docker → Registry →
-- Deployment (priorité "Relier complètement le Registry aux projets") :
-- jusqu'ici registry.routes.js n'avait aucune notion de project_id/
-- component_id (confirmé par audit, voir todo.md Lot 48/58-nav) — chaque
-- image du registre privé était une simple entrée {repo, tag} sans lien
-- avec le catalog. Cette table est le maillon manquant : associe une image
-- (repo + tag dans le registre, optionnellement un digest) à un composant
-- précis (donc à son projet via components.project_id) et, si connu, à la
-- source (pipeline) qui l'a produite.
CREATE TABLE IF NOT EXISTS component_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  repository TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT 'latest',
  digest TEXT,
  pipeline_provider TEXT NOT NULL DEFAULT '',
  pipeline_url TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (component_id, repository, tag)
);

CREATE INDEX IF NOT EXISTS idx_component_images_component ON component_images(component_id);
