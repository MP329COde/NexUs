import * as orgStore from '../store/orgStore.js';
import { provisionFromBlueprint } from './environmentProvisioningService.js';

// Relie les Platform Requests aux vrais workflows de provisioning (ÉTAPE 12
// IDP) : jusqu'ici approuver une demande ne faisait que changer son statut
// (voir migration 0017/0022). Seul 'create_production_env' a une action
// réelle définie pour l'instant — les autres types ('access',
// 'resource_increase', 'other') n'ont aucune brique de provisioning fiable
// dans NexUs, et le disent explicitement (result.status 'skipped') plutôt
// que de simuler un traitement automatique qui n'existe pas.
//
// Appelée APRÈS que la demande soit passée à 'approved' (jamais avant :
// l'approbation elle-même reste une décision humaine, cette fonction ne
// fait qu'exécuter ce qui a déjà été décidé) — voir
// routes/platformRequests.routes.js POST /:id/approve.
export async function applyApprovedRequest(request) {
  if (request.kind !== 'create_production_env') {
    return { status: 'skipped', message: `Aucune action automatique définie pour le type "${request.kind}" — traitement manuel requis.` };
  }

  if (!request.project_id) {
    return { status: 'failed', message: 'Demande sans projet associé : impossible de créer un environnement de production.' };
  }
  const payload = request.payload || {};
  const environmentName = (payload.environmentName || '').trim();
  if (!environmentName) {
    return { status: 'failed', message: 'Aucun nom d\'environnement fourni dans la demande (payload.environmentName).' };
  }

  const existing = await orgStore.getEnvironmentByName(request.project_id, environmentName);
  if (existing) {
    return { status: 'failed', message: `Un environnement "${environmentName}" existe déjà pour ce projet.` };
  }

  const project = await orgStore.getProject(request.project_id);
  if (!project) return { status: 'failed', message: 'Projet introuvable (a pu être supprimé depuis la demande).' };

  let blueprint = null;
  if (payload.blueprintId) {
    blueprint = await orgStore.getEnvironmentBlueprint(payload.blueprintId);
    if (!blueprint) return { status: 'failed', message: `Blueprint "${payload.blueprintId}" introuvable.` };
  }

  const environment = await orgStore.createEnvironment(request.project_id, {
    name: environmentName, kind: 'production', isProduction: true, blueprintId: blueprint?.id || null
  });

  let provisioning = null;
  if (blueprint) provisioning = await provisionFromBlueprint(environment, blueprint, project.slug);

  return {
    status: 'created', environmentId: environment.id,
    message: `Environnement de production "${environmentName}" créé.` + (provisioning ? ` Kubernetes : ${provisioning.status}${provisioning.status !== 'created' ? ` (${provisioning.message})` : ''}.` : ''),
    provisioning
  };
}
