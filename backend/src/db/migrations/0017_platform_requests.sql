-- Platform Requests (ÉTAPE 17 IDP) : demandes soumises par un développeur à
-- l'organisation (accès, augmentation de ressources, création
-- d'environnement de production...) avec approbation explicite d'un
-- owner/admin — jamais exécutées automatiquement : approuver une demande
-- change son statut, ça ne déclenche aucune action d'infrastructure réelle
-- (aucune brique de ce genre n'existe encore de façon fiable dans NexUs,
-- voir Policy Engine/Scorecard pour la même prudence appliquée ailleurs).
CREATE TABLE IF NOT EXISTS platform_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- optionnel : rattachement à un projet précis
  requested_by TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('access', 'resource_increase', 'create_production_env', 'other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_requests_org ON platform_requests(org_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_requests_requester ON platform_requests(requested_by);
