-- Ajoute 'require_linked_environment' à la contrainte CHECK sur policies.kind
-- (voir migration 0016 et services/policyEngine.js) — la liste JS
-- (routes/policies.routes.js KINDS) avait été mise à jour sans la
-- contrainte Postgres correspondante, provoquant un 500 réel à la création
-- de toute policy de ce type (trouvé en le testant réellement dans le
-- navigateur, pas en relisant le code).
ALTER TABLE policies DROP CONSTRAINT IF EXISTS policies_kind_check;
ALTER TABLE policies ADD CONSTRAINT policies_kind_check CHECK (kind IN (
  'require_owner_team', 'require_production_lifecycle', 'require_description', 'require_repository',
  'require_linked_environment', 'block_critical_code_scan', 'block_high_dast_scan'
));
