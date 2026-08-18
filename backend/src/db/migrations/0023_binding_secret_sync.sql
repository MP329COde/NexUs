-- Provisioning réel des Service Bindings (ÉTAPE 15 IDP, suite) : un binding
-- restait jusqu'ici une pure déclaration + un lien vers un secret déjà géré
-- (voir migration 0019, "NexUs ne provisionne AUCUNE ressource réelle").
-- Créer réellement une base PostgreSQL/Redis/etc. reste hors de portée
-- (aucune intégration fiable de ce type dans NexUs) — mais la dernière
-- étape de la chaîne ("credentials → Vault → binding → environment
-- variable") peut désormais être réelle : synchroniser la valeur du secret
-- vers un vrai Secret Kubernetes dans le namespace de l'environnement
-- cible (voir services/serviceBindingSyncService.js). Ces colonnes suivent
-- honnêtement le résultat de cette synchronisation — jamais "synchronisé"
-- sans preuve.
ALTER TABLE component_bindings ADD COLUMN IF NOT EXISTS last_synced_environment_id UUID REFERENCES environments(id) ON DELETE SET NULL;
ALTER TABLE component_bindings ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'never'
  CHECK (sync_status IN ('never', 'synced', 'failed'));
ALTER TABLE component_bindings ADD COLUMN IF NOT EXISTS sync_message TEXT NOT NULL DEFAULT '';
ALTER TABLE component_bindings ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;
