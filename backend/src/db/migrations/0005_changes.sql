-- Changement contrôlé : une modification importante sur un projet/environnement,
-- avec description, impact attendu, auteur, validation éventuelle et état
-- d'exécution — distinct d'un incident (qui documente un problème survenu,
-- pas une action planifiée). Un changement ciblant un environnement de
-- production exige une approbation avant exécution (voir
-- routes/projects.routes.js) ; hors production, il peut être auto-approuvé
-- par son auteur s'il a le rôle suffisant.

CREATE TABLE IF NOT EXISTS changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'cancelled')),
  requested_by TEXT NOT NULL,
  decided_by TEXT,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_changes_project ON changes(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_changes_status ON changes(status) WHERE status = 'pending';
