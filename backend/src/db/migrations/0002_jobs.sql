-- File de jobs pour les opérations potentiellement longues (synchronisation
-- GitOps, rollback...). Un job est créé et renvoyé immédiatement (202), le
-- travail réel s'exécute en tâche de fond dans le même process — voir
-- services/jobService.js. Persisté (pas seulement en mémoire) pour survivre
-- à un redémarrage du backend et garder un historique consultable par projet.

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- ex. 'deployment.sync', 'deployment.rollback'
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL, -- user id (store legacy, texte comme les autres colonnes user_id de ce socle)
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status) WHERE status IN ('pending', 'running');
