-- Généralise project_activity (0036) à d'autres types d'entité
-- (organisation, équipe...) — todo.md #31/#32, chantier bloqué au Lot 35.
-- Modèle polymorphe minimal : entity_type/entity_id, project_id conservé
-- comme colonne dédiée (compatibilité avec le code existant et les FK/
-- index déjà en place) et traité comme le cas particulier entity_type =
-- 'project', entity_id = project_id.
ALTER TABLE project_activity ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'project';
ALTER TABLE project_activity ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE project_activity ALTER COLUMN project_id DROP NOT NULL;

UPDATE project_activity SET entity_id = project_id WHERE entity_id IS NULL AND project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_activity_entity ON project_activity(entity_type, entity_id, created_at DESC);
