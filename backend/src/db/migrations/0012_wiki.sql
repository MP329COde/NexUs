-- Wiki d'équipe : contrairement au lien runbook (0008_runbooks.sql, qui
-- pointe volontairement vers une doc externe existante), ceci est un vrai
-- wiki interne demandé explicitement : le contenu (Markdown) est stocké
-- dans Nexus, éditable en ligne, avec historique des révisions. Rattaché à
-- une organisation (frontière englobante, comme les équipes), avec un lien
-- optionnel vers un projet précis pour les pages spécifiques à un projet.
CREATE TABLE IF NOT EXISTS wiki_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

-- Historique des modifications : une ligne par version précédente (avant
-- écrasement), pas la version courante elle-même (déjà dans wiki_pages).
CREATE TABLE IF NOT EXISTS wiki_page_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_org ON wiki_pages(org_id);
CREATE INDEX IF NOT EXISTS idx_wiki_pages_project ON wiki_pages(project_id);
CREATE INDEX IF NOT EXISTS idx_wiki_revisions_page ON wiki_page_revisions(page_id);
