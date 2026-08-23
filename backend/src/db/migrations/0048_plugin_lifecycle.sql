-- Approfondissement du système de plugins (Lot D8) : l'audit préexistant
-- (voir services/plugins/pluginRegistry.js) confirmait qu'à l'installation,
-- TOUTES les permissions déclarées par le manifest étaient insérées
-- directement dans plugin_permissions SANS aucune approbation admin — un
-- plugin installé pouvait immédiatement s'activer avec des permissions
-- jamais validées par un humain. Ce lot ajoute un vrai statut d'approbation
-- par permission ('pending' par défaut = accès refusé tant qu'un admin n'a
-- pas explicitement tranché), et trace la provenance d'un plugin (installé
-- depuis un manifest collé en direct, un dossier local en mode dev, ou un
-- dépôt Git distant) pour audit/traçabilité.
ALTER TABLE plugin_permissions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'granted', 'denied'));
ALTER TABLE plugin_permissions ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE plugin_permissions ADD COLUMN IF NOT EXISTS decided_by TEXT;

-- source : provenance de l'installation ('manifest' = collé en direct via
-- POST /plugins/install, comportement historique ; 'local-dev' = dossier
-- serveur local ; 'git' = dépôt Git distant). source_ref : chemin local ou
-- URL de dépôt correspondant, purement informatif (aucune ré-exécution
-- automatique depuis cette référence).
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manifest' CHECK (source IN ('manifest', 'local-dev', 'git'));
ALTER TABLE plugins ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- Sauvegarde de l'état précédent d'un plugin avant une mise à jour
-- (updatePlugin), pour permettre un rollback réel si la mise à jour échoue
-- en cours de route ou doit être annulée après coup — jamais un rollback
-- simulé, la ligne complète (manifest + statut + permissions au moment
-- de la mise à jour) est conservée telle quelle.
CREATE TABLE IF NOT EXISTS plugin_update_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  previous_manifest JSONB NOT NULL,
  previous_version TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  previous_permissions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plugin_update_backups_plugin ON plugin_update_backups(plugin_id, created_at DESC);
