-- Annulation de job (voir services/jobService.js, cancelJob) : un job
-- 'pending' ou 'running' peut être annulé explicitement. L'annulation est
-- coopérative — le run() en cours (ex. scaffoldService) doit vérifier
-- isCancelled() entre ses étapes pour s'arrêter réellement ; sinon le job
-- finit son travail mais l'écriture finale (succeeded/failed) est ignorée
-- car elle ne cible que les jobs encore 'running' (voir jobService.js).
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled'));
