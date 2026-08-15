-- Documentation/runbook liée à une ressource, explicitement demandée par le
-- cahier des charges : Nexus ne stocke jamais le contenu de la doc (ce
-- n'est pas un wiki), seulement un lien vers l'endroit où elle vit déjà
-- (Confluence, wiki interne, README du dépôt...) — visible directement
-- depuis la ressource concernée plutôt que d'obliger à la chercher ailleurs.
-- (Le projet lui-même a déjà un champ libre équivalent côté store JSON
-- legacy — `runbookUrl` fusionné par PUT /:id, store/projectsStore.js — pas
-- besoin de colonne Postgres dédiée tant que les projets n'ont pas migré.)
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS runbook_url TEXT;
