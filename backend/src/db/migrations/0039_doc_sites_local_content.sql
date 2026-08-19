-- Fallback local pour Docusaurus/Storybook (todo.md Lot 34, chantiers #8-#13) :
-- quand aucun repository GitHub n'est connecté par l'admin, NexUs génère et
-- stocke localement une page de documentation structurée à partir des
-- données réelles du projet (aucun contenu inventé), servie par le backend
-- au lieu de rediriger vers une URL externe.
ALTER TABLE project_doc_sites ADD COLUMN IF NOT EXISTS local_content TEXT;
