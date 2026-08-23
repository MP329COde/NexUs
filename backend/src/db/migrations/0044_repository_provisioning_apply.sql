-- Provisioning réel des repositories (Priorité 1, suite du Lot 54) : le
-- modèle de données (0042) ne portait que la DEMANDE. Ces colonnes
-- complètent ce qui manquait pour exécuter réellement l'appel externe :
-- - account : distingue le compte GitHub/GitLab *personnel* (intégration
--   'github'/'gitlab', un seul token global aujourd'hui — voir settingsStore)
--   du compte GitHub *dédié à la plateforme NexUs* (intégration
--   'githubPlatform', renseigné par un admin — voir githubPlatformService.js).
-- - team_slug : équipe GitHub/GitLab existante à laquelle rattacher le dépôt
--   avec des permissions (uniquement pertinent pour le compte plateforme,
--   qui est une organisation) — NexUs ne connaît pas de mapping automatique
--   équipe NexUs → équipe GitHub, donc laissé à la demande.
-- - ci_variables : variables CI à créer sur le dépôt (JSON {clé: valeur},
--   non secret — voir provisionRepository(), utilise l'API "Actions
--   variables", pas les secrets chiffrés).
ALTER TABLE managed_repositories ADD COLUMN IF NOT EXISTS account TEXT NOT NULL DEFAULT 'personal' CHECK (account IN ('personal', 'platform'));
ALTER TABLE managed_repositories ADD COLUMN IF NOT EXISTS team_slug TEXT;
ALTER TABLE managed_repositories ADD COLUMN IF NOT EXISTS ci_variables JSONB NOT NULL DEFAULT '{}'::jsonb;
