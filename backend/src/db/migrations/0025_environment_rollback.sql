-- Rollback réel (ÉTAPE 17) : distingue une entrée de rollback d'une
-- promotion normale dans l'historique (environment_promotions), et garde
-- la trace de LA promotion vers laquelle on est revenu — pas une nouvelle
-- table séparée, un rollback est un cas particulier de synchronisation vers
-- une revision déjà réellement déployée (voir services/environmentPromotionService.js#rollbackEnvironment).
ALTER TABLE environment_promotions ADD COLUMN IF NOT EXISTS is_rollback BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE environment_promotions ADD COLUMN IF NOT EXISTS rollback_of UUID REFERENCES environment_promotions(id) ON DELETE SET NULL;
