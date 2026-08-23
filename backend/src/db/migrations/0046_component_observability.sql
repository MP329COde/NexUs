-- Observabilité centrée Service (Priorité 5) : jusqu'ici confirmé par audit
-- (todo.md Lots 55/56-nav) que rien n'était scopable par composant du
-- catalog — Grafana (dashboards/alertes) restait global à l'instance, et la
-- table `incidents` (0003_incidents.sql) n'avait qu'un `resource_ref` texte
-- libre, jamais de FK réelle vers `components`. Ces colonnes ferment le
-- chaînage nécessaire à une vraie page "Observabilité" par service, sans
-- jamais inventer de données pour les intégrations non configurées.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS component_id UUID REFERENCES components(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_component ON incidents(component_id, created_at DESC);

-- k8s_namespace : rattache le composant à son namespace Kubernetes réel,
-- réutilisé pour les logs (lien direct vers /kubernetes?ns=...) et pour
-- filtrer les alertes de kubernetesAlertService.js par composant.
-- grafana_dashboard_uid : dashboard Grafana déjà existant à afficher pour ce
-- composant (todo.md Lot 55-nav proposait `dashboard_uid` explicitement).
-- slo_target : objectif de disponibilité en % (ex. 99.9), NULL = aucun
-- objectif défini par l'équipe — jamais une valeur par défaut inventée,
-- l'UI doit alors afficher "Aucun objectif défini" plutôt qu'un chiffre.
ALTER TABLE components ADD COLUMN IF NOT EXISTS k8s_namespace TEXT NOT NULL DEFAULT '';
ALTER TABLE components ADD COLUMN IF NOT EXISTS grafana_dashboard_uid TEXT NOT NULL DEFAULT '';
ALTER TABLE components ADD COLUMN IF NOT EXISTS slo_target NUMERIC;
