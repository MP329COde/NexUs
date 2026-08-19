-- Troisième palier documentaire du Wiki (Organisation / Équipe / Projet) :
-- jusqu'ici seuls org_id (obligatoire) et project_id (optionnel) existaient
-- (0012_wiki.sql) — team_id comble le palier manquant. Les trois champs de
-- portée restent mutuellement exclusifs au niveau applicatif (voir
-- routes/wiki.routes.js) : une page a un org_id toujours, et au plus l'un
-- de team_id/project_id, jamais les deux (une contrainte CHECK serait plus
-- stricte mais figerait un choix produit encore mouvant sur les pages
-- rattachées à la fois à une équipe ET un projet).
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_wiki_pages_team ON wiki_pages(team_id);
