-- Modèle d'incident : représente un problème opérationnel avec gravité,
-- état, ressource(s) affectée(s) et résolution documentée. Peut être
-- rattaché à un job en échec (voir jobs, table posée en 0002) pour garder
-- le lien entre "ce qui a échoué" et "l'incident qui en a résulté", sans
-- dupliquer cette information.

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- NULL = incident plateforme (pas rattaché à un projet précis)
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved')),
  resource_type TEXT, -- ex. 'deployment', 'kubernetes.pod', 'proxy'... libre, pas de liste fermée à ce stade
  resource_ref TEXT,  -- identifiant libre de la ressource affectée (namespace/pod, id de proxy...)
  created_by TEXT NOT NULL,
  assigned_to TEXT,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_project ON incidents(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status) WHERE status IN ('open', 'investigating');

-- Commentaires/fil de discussion sur un incident : trace de "qui a dit quoi,
-- quand" pendant l'investigation, distincte de la description initiale et
-- de la résolution finale (elles-mêmes éditables, contrairement à un
-- commentaire une fois posté).
CREATE TABLE IF NOT EXISTS incident_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_comments_incident ON incident_comments(incident_id, created_at);
