-- Quotas (ÉTAPE 26 IDP) : limites optionnelles par organisation sur le
-- nombre d'environnements et les ressources CPU/mémoire cumulées demandées
-- par leurs blueprints. NULL = pas de limite (comportement actuel inchangé
-- par défaut — un quota doit être explicitement défini par un admin pour
-- s'appliquer, jamais une limite surprise). L'utilisation réelle est
-- recalculée à la demande depuis environments/environment_blueprints (voir
-- services/quotaService.js), jamais un compteur dénormalisé qui pourrait
-- diverger de la réalité.
CREATE TABLE IF NOT EXISTS org_quotas (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  max_environments INTEGER,
  max_cpu_millicores INTEGER,
  max_memory_bytes BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
