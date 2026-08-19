-- Liens vers la documentation technique (Docusaurus) et le design system
-- (Storybook) d'un projet — repositories externes gérés par la plateforme
-- (voir todo.md items 8/12) mais dont la création automatisée nécessite un
-- compte/organisation GitHub dédié non fourni à ce stade : ce lot enregistre
-- et affiche les liens (saisis manuellement), la création réelle du
-- repository reste un lot ultérieur une fois les identifiants disponibles.
CREATE TABLE IF NOT EXISTS project_doc_sites (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('docusaurus', 'storybook')),
  url TEXT,
  repo_url TEXT,
  branch TEXT,
  last_commit TEXT,
  last_published_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('unknown', 'building', 'published', 'failed')),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, kind)
);
