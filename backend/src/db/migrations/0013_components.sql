-- Software Catalog développeur : composants applicatifs (services, APIs,
-- workers, librairies, sites, cronjobs, briques d'infrastructure) possédés
-- par une équipe, distincts du catalogue d'installation d'outils
-- d'infrastructure (services/serviceCatalog.js, qui installe Prometheus,
-- Grafana... sur un hôte via SSH et n'a aucun rapport avec ceci).
-- Rattaché à un projet relationnel (projects.id) comme wiki_pages : la
-- portée organisation se déduit par jointure sur projects.org_id, pas par
-- une colonne org_id dupliquée ici (cf. table environments).
CREATE TABLE IF NOT EXISTS components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'service' CHECK (kind IN ('service', 'api', 'website', 'worker', 'library', 'cronjob', 'infrastructure')),
  lifecycle TEXT NOT NULL DEFAULT 'experimental' CHECK (lifecycle IN ('experimental', 'production', 'deprecated')),
  description TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  framework TEXT NOT NULL DEFAULT '',
  repository_provider TEXT NOT NULL DEFAULT '', -- gitlab | github | gitea | '' (aucun dépôt rattaché)
  repository_url TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]',
  links JSONB NOT NULL DEFAULT '[]', -- [{label, url}] : documentation, dashboard, runbook...
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_components_project ON components(project_id);
CREATE INDEX IF NOT EXISTS idx_components_owner_team ON components(owner_team_id);
