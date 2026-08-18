-- Policy Engine (ÉTAPE 16 IDP) : règles évaluables sur un composant du
-- Software Catalog, chacune calculée à partir d'un signal réel (métadonnées
-- du composant, ou dernier scan de sécurité de la plateforme — même source
-- que le Security Gate déjà appliqué aux promotions de production, voir
-- services/environmentPromotionService.js#checkSecurityGate). Portée
-- organisation, comme environment_blueprints et teams.
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'require_owner_team', 'require_production_lifecycle', 'require_description',
    'require_repository', 'block_critical_code_scan', 'block_high_dast_scan'
  )),
  enabled BOOLEAN NOT NULL DEFAULT true,
  threshold INTEGER, -- seuil optionnel (ex. nombre max de findings CRITICAL/High tolérés) ; NULL = 0 toléré
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_policies_org ON policies(org_id);
