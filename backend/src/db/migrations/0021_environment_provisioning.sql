-- Provisioning réel des Environment Blueprints (ÉTAPE 7 IDP) : jusqu'ici un
-- blueprint n'était qu'une déclaration (voir migration 0014, commentaire
-- "NexUs n'aprovisionne RIEN de réel"). Ces colonnes enregistrent le
-- résultat RÉEL de la tentative d'application Kubernetes (namespace +
-- ResourceQuota) à la création d'un environnement depuis un blueprint — voir
-- services/environmentProvisioningService.js. provisioning_status distingue
-- explicitement 'created' (appliqué avec succès), 'skipped' (pas de
-- blueprint, ou Kubernetes non configuré) et 'failed' (tentative réelle,
-- erreur Kubernetes) : jamais un environnement affiché comme "provisionné"
-- sans preuve.
ALTER TABLE environments ADD COLUMN IF NOT EXISTS provisioned_namespace TEXT;
ALTER TABLE environments ADD COLUMN IF NOT EXISTS provisioning_status TEXT NOT NULL DEFAULT 'skipped'
  CHECK (provisioning_status IN ('created', 'skipped', 'failed'));
ALTER TABLE environments ADD COLUMN IF NOT EXISTS provisioning_message TEXT NOT NULL DEFAULT '';
ALTER TABLE environments ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ;
