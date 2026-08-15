-- Idempotence et retry des jobs (voir services/jobService.js) : un client
-- qui ré-émet la même requête (double-clic, retry réseau côté navigateur)
-- ne doit jamais déclencher deux fois la même opération réelle (sync
-- ArgoCD, rollback...). idempotency_key est optionnelle (NULL pour les
-- jobs qui n'en ont pas besoin) ; l'index unique partiel empêche deux
-- jobs actifs (pending/running) de partager la même clé, sans bloquer la
-- réutilisation de la clé une fois le job précédent terminé.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS retry_of UUID REFERENCES jobs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_active
  ON jobs(idempotency_key) WHERE idempotency_key IS NOT NULL AND status IN ('pending', 'running');
