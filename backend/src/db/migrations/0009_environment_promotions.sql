-- Lie un environnement (déjà réel — table environments, créée avec chaque
-- projet : production + staging par défaut) à une application Argo CD
-- existante : la console ne fabrique jamais de "version déployée" fictive,
-- elle lit l'état réel de l'application liée (revision Git, santé, statut
-- de synchronisation — voir integrations/argocdService.js) et déclenche de
-- vraies synchronisations pour promouvoir un environnement vers un autre.
ALTER TABLE environments ADD COLUMN IF NOT EXISTS argocd_app TEXT;

CREATE TABLE IF NOT EXISTS environment_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_environment_id UUID REFERENCES environments(id) ON DELETE SET NULL,
  to_environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  argocd_app TEXT NOT NULL,
  revision TEXT,
  status TEXT NOT NULL, -- 'synced' | 'error'
  message TEXT,
  triggered_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_environment_promotions_project ON environment_promotions(project_id, created_at DESC);
