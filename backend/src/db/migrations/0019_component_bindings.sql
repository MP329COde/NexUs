-- Service Bindings (ÉTAPE 15 IDP) : un composant du catalogue déclare un
-- besoin (PostgreSQL, Redis, stockage objet, API...) exposé sous un nom de
-- variable d'environnement, optionnellement relié à une entrée existante du
-- coffre-fort du PROJET (store/vaultStore.js, store JSON scopé par
-- legacy_id — pas de FK Postgres possible, vault_entry_id est une simple
-- référence texte). NexUs ne provisionne AUCUNE ressource réelle
-- (PostgreSQL, Redis...) à partir d'un binding : c'est une déclaration +
-- un lien vers un secret déjà géré, jamais la valeur du secret elle-même
-- (qui ne transite jamais par cette table ni par son API).
CREATE TABLE IF NOT EXISTS component_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  binding_type TEXT NOT NULL CHECK (binding_type IN ('postgres', 'redis', 'object_storage', 'api', 'other')),
  env_var_name TEXT NOT NULL,
  vault_entry_id TEXT, -- référence vers store/vaultStore.js (tier 'project'), jamais le secret
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (component_id, env_var_name)
);

CREATE INDEX IF NOT EXISTS idx_component_bindings_component ON component_bindings(component_id);
