-- Environment Blueprints (ÉTAPE 10 IDP) : profils de ressources réutilisables
-- (namespace, replicas, CPU/RAM/stockage, ingress, TTL, monitoring) qu'une
-- organisation définit une fois puis applique à la création d'un
-- environnement (voir environments.blueprint_id ci-dessous). NexUs
-- n'aprovisionne RIEN de réel à partir d'un blueprint dans cette itération
-- (pas d'appel Kubernetes) : c'est une déclaration de configuration
-- attachée à l'environnement, cohérente avec la consigne de ne jamais
-- simuler une réussite d'infrastructure qui n'a pas eu lieu.
CREATE TABLE IF NOT EXISTS environment_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('development', 'preview', 'staging', 'production', 'custom')),
  namespace_pattern TEXT NOT NULL DEFAULT '',
  replicas INTEGER NOT NULL DEFAULT 1 CHECK (replicas >= 0),
  cpu TEXT NOT NULL DEFAULT '',
  memory TEXT NOT NULL DEFAULT '',
  storage_gb INTEGER,
  ingress_domain TEXT NOT NULL DEFAULT '',
  ttl_minutes INTEGER, -- NULL = pas d'expiration automatique
  monitoring_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_environment_blueprints_org ON environment_blueprints(org_id);

ALTER TABLE environments ADD COLUMN IF NOT EXISTS blueprint_id UUID REFERENCES environment_blueprints(id) ON DELETE SET NULL;
