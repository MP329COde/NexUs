import * as orgStore from '../store/orgStore.js';
import * as vaultStore from '../store/vaultStore.js';
import * as kubernetesService from './integrations/kubernetesService.js';
import { IntegrationError } from './integrations/httpClient.js';

// Provisioning réel des Service Bindings, dernière étape de la chaîne
// (ÉTAPE 15 IDP, suite — voir migration 0023) : "service → resource
// request → provision → credentials → Vault → binding → environment
// variable". NexUs ne crée AUCUNE base PostgreSQL/Redis/etc. réelle (aucune
// intégration fiable pour ça) — mais la valeur du secret déjà géré dans le
// coffre-fort PROJET peut être réellement synchronisée vers un Secret
// Kubernetes dans le namespace de l'environnement cible, pour qu'un
// workload déployé là puisse le consommer (envFrom/secretKeyRef). La
// valeur elle-même ne transite jamais par un log, un audit, ni la réponse
// HTTP de cette fonction — seul le résultat (synced/failed) est renvoyé.
export async function syncBindingSecret(binding, component, environment) {
  if (!binding.vault_entry_id) {
    return { status: 'failed', message: 'Ce binding ne référence aucune entrée du coffre-fort projet.' };
  }
  if (!environment.provisioned_namespace) {
    return { status: 'failed', message: `Aucun namespace Kubernetes provisionné pour l'environnement "${environment.name}".` };
  }
  const entry = vaultStore.findVaultEntry(binding.vault_entry_id);
  if (!entry) return { status: 'failed', message: 'Entrée du coffre-fort introuvable (a pu être supprimée).' };

  const project = await orgStore.getProject(component.project_id);
  if (entry.tier !== 'project' || entry.projectId !== project?.legacy_id) {
    // Défense en profondeur : un binding ne devrait référencer qu'un
    // secret du MÊME projet (déjà filtré côté UI, voir CatalogComponentPage
    // qui ne propose que projectVault), mais on ne fait jamais confiance à
    // l'id fourni sans revérifier l'appartenance ici aussi.
    return { status: 'failed', message: "L'entrée du coffre-fort ne correspond pas au projet de ce composant." };
  }

  const secretValue = vaultStore.revealVaultEntry(entry.id);
  if (secretValue == null) return { status: 'failed', message: 'Impossible de déchiffrer le secret.' };

  const k8sSecretName = `${component.slug}-secrets`;
  try {
    await kubernetesService.applyManifest({
      apiVersion: 'v1', kind: 'Secret',
      metadata: {
        name: k8sSecretName, namespace: environment.provisioned_namespace,
        labels: { 'app.kubernetes.io/managed-by': 'nexus-console', 'nexus.dev/component': component.slug }
      },
      type: 'Opaque',
      stringData: { [binding.env_var_name]: secretValue }
    });
    return { status: 'synced', message: `Secret Kubernetes "${k8sSecretName}" (clé "${binding.env_var_name}") appliqué dans "${environment.provisioned_namespace}".` };
  } catch (err) {
    const notConfigured = err instanceof IntegrationError && err.status === 409;
    return { status: 'failed', message: notConfigured ? 'Kubernetes non configuré (Paramètres → Intégrations)' : (err.message || 'Échec de la synchronisation') };
  }
}
