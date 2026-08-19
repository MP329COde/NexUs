-- Changelog / Releases par service (todo.md item 37) : enregistrement
-- manuel d'une version publiée, avec ses références (commit, PR, pipeline)
-- — comme les liens Docusaurus/Storybook (0031_project_doc_sites.sql), il
-- n'existe pas de pipeline CI/CD observable de façon fiable sans forge
-- configurée pour dériver ces versions automatiquement ; ce lot enregistre
-- honnêtement ce qui est déclaré, sans prétendre à une détection automatique.
CREATE TABLE IF NOT EXISTS component_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  commit_sha TEXT,
  pr_url TEXT,
  pipeline_url TEXT,
  deployment_url TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (component_id, version)
);
CREATE INDEX IF NOT EXISTS idx_component_releases_component ON component_releases(component_id, created_at DESC);
