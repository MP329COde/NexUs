-- Éditeur sécurisé HAProxy (Priorité 4) : la Data Plane API v3 ne conserve
-- aucun historique des configurations appliquées (une seule version "courante"
-- à la fois, cf. getConfigVersion() dans haproxyService.js) — il n'existe donc
-- aucun moyen natif de faire un rollback. Cette table enregistre côté NexUs
-- un instantané de la config brute (endpoint /configuration/raw) avant chaque
-- application, pour permettre diff/historique/rollback réels. Générique par
-- "module" pour pouvoir couvrir Traefik plus tard sans nouvelle table.
CREATE TABLE IF NOT EXISTS network_config_history (
  id SERIAL PRIMARY KEY,
  module TEXT NOT NULL,
  content TEXT NOT NULL,
  applied_by TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rollback_of INTEGER REFERENCES network_config_history(id),
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_network_config_history_module ON network_config_history(module, applied_at DESC);
