-- Fenêtre de maintenance planifiée sur un projet (optionnellement scopée à
-- un environnement précis) : période annoncée pendant laquelle une
-- intervention est attendue. Purement déclaratif pour l'instant (traçabilité
-- et visibilité de "on sait que ça va bouger ici" pour l'équipe et les
-- responsables sécurité/infra) — ne modifie aucune autre garde (une
-- fenêtre de maintenance active ne contourne pas l'approbation owner sur un
-- changement production : ce sont deux notions distinctes, l'une informe,
-- l'autre autorise).
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_by TEXT NOT NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_windows_period_check CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_windows_project ON maintenance_windows(project_id, starts_at DESC);
