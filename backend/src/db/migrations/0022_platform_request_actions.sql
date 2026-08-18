-- Platform Requests reliées aux workflows (ÉTAPE 12) : jusqu'ici approuver
-- une demande ne faisait que changer son statut (voir migration 0017,
-- commentaire "aucune brique de ce genre n'existe encore de façon fiable").
-- Ce n'est plus vrai pour 'create_production_env' depuis que le
-- provisioning Kubernetes/Argo CD des environnements est réel (voir
-- environmentProvisioningService.js) — voir platformRequestActionService.js.
-- payload porte les paramètres propres au type de demande (ex.
-- environmentName/blueprintId pour create_production_env) ; result porte
-- le résultat RÉEL de l'action déclenchée à l'approbation, jamais un succès
-- inventé — les autres types de demande ('access', 'resource_increase',
-- 'other') n'ont toujours aucune action automatique définie et le disent
-- explicitement dans leur result ('skipped').
ALTER TABLE platform_requests ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}';
ALTER TABLE platform_requests ADD COLUMN IF NOT EXISTS result JSONB;
