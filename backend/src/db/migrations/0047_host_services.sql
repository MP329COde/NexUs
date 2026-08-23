-- Lot D3 (Groupe D) : mise à jour de services autorisée. Jusqu'ici, l'install
-- d'un service du catalogue (serviceCatalog.js) sur un hôte géré n'était
-- tracée que via hosts.last_install (un seul champ, écrasé à chaque
-- installation/agent). Pour proposer une vérification de version et une
-- mise à jour contrôlée par service, il faut une trace PAR service installé
-- sur un hôte (un hôte peut avoir plusieurs services du catalogue).
CREATE TABLE IF NOT EXISTS host_services (
  id SERIAL PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_check_status TEXT,
  last_check_at TIMESTAMPTZ,
  last_check_detail TEXT,
  last_update_at TIMESTAMPTZ,
  last_update_ok BOOLEAN,
  UNIQUE(host_id, service_id)
);

CREATE INDEX IF NOT EXISTS idx_host_services_host ON host_services(host_id);
