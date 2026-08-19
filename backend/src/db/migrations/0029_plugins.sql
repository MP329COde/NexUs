-- Socle Plugin Runtime (Lot 1) : registre des plugins installés, leurs
-- permissions déclarées (jamais d'héritage admin automatique — voir
-- services/plugins/pluginRegistry.js), leur configuration, et un journal
-- best-effort des événements qu'ils émettent/reçoivent (traçabilité minimale,
-- distinct de la table audit existante qui reste réservée aux actions admin
-- sensibles).
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  api_version TEXT NOT NULL,
  manifest JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'installed' CHECK (status IN ('installed', 'active', 'disabled')),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plugin_permissions (
  plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL,
  PRIMARY KEY (plugin_id, permission_key)
);

CREATE TABLE IF NOT EXISTS plugin_config (
  plugin_id TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  encrypted BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (plugin_id, key)
);

CREATE TABLE IF NOT EXISTS plugin_events_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id TEXT REFERENCES plugins(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plugin_events_log_plugin ON plugin_events_log(plugin_id, created_at DESC);

-- Note : la description et les étiquettes technologiques des projets
-- (colonnes `description`/`tags` de la table `projects`, voir 0001_core.sql)
-- et des dépôts (store/repoMetaStore.js, clé `role`/`tags`) existent déjà
-- côté backend et API (PUT /projects/:id) — seule l'UI d'édition manquait,
-- ajoutée côté frontend dans ce même lot sans changement de schéma.
