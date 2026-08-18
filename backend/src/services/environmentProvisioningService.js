import * as kubernetesService from './integrations/kubernetesService.js';
import { IntegrationError } from './integrations/httpClient.js';
import { query } from '../db/pool.js';

// Applique réellement la configuration d'un Environment Blueprint (ÉTAPE 7
// IDP) à la création d'un environnement : jusqu'ici un blueprint n'était
// qu'une déclaration (voir migration 0014). Un namespace Kubernetes est créé
// (server-side apply, kubernetesService.applyManifest) avec des labels de
// traçabilité, et un ResourceQuota si cpu/memory sont renseignés sur le
// blueprint — le budget total du namespace, pas une limite par pod (NexUs
// ne déploie aucun workload lui-même à cette étape, seul le socle
// namespace/quota est provisionné ; un Deployment réel s'y installera
// ensuite via GitOps/Argo CD).
//
// Ne lève jamais d'exception vers l'appelant : la création de l'environnement
// (ligne en base) doit réussir même si Kubernetes n'est pas configuré ou
// injoignable — le résultat réel (created/skipped/failed) est enregistré
// sur l'environnement lui-même pour être affiché honnêtement, jamais un
// succès silencieux.

// RFC 1123 : minuscules, chiffres, tirets, ≤ 63 caractères, ne commence/finit
// pas par un tiret.
export function resolveNamespace(pattern, { projectSlug, envName }) {
  const raw = (pattern && pattern.trim())
    ? pattern.replace(/\{project\}/g, projectSlug).replace(/\{env\}/g, envName)
    : `${projectSlug}-${envName}`;
  const sanitized = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
  return sanitized || `env-${envName}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 63);
}

async function recordResult(environmentId, { namespace, status, message }) {
  await query(
    `UPDATE environments SET provisioned_namespace = $2, provisioning_status = $3, provisioning_message = $4,
       provisioned_at = CASE WHEN $3 = 'created' THEN now() ELSE provisioned_at END
     WHERE id = $1`,
    [environmentId, namespace || null, status, message || '']
  );
}

export async function provisionFromBlueprint(environment, blueprint, projectSlug) {
  if (!blueprint) {
    await recordResult(environment.id, { namespace: null, status: 'skipped', message: 'Aucun blueprint sélectionné' });
    return { status: 'skipped', message: 'Aucun blueprint sélectionné' };
  }

  const namespace = resolveNamespace(blueprint.namespace_pattern, { projectSlug, envName: environment.name });
  const labels = {
    'app.kubernetes.io/managed-by': 'nexus-console',
    'nexus.dev/project': projectSlug,
    'nexus.dev/environment': environment.name
  };

  try {
    await kubernetesService.applyManifest({
      apiVersion: 'v1', kind: 'Namespace',
      metadata: { name: namespace, labels }
    });

    if (blueprint.cpu || blueprint.memory) {
      const hard = {};
      if (blueprint.cpu) { hard['requests.cpu'] = blueprint.cpu; hard['limits.cpu'] = blueprint.cpu; }
      if (blueprint.memory) { hard['requests.memory'] = blueprint.memory; hard['limits.memory'] = blueprint.memory; }
      await kubernetesService.applyManifest({
        apiVersion: 'v1', kind: 'ResourceQuota',
        metadata: { name: `${namespace}-quota`, namespace, labels },
        spec: { hard }
      });
    }

    const message = `Namespace "${namespace}" appliqué${blueprint.cpu || blueprint.memory ? ' avec quota de ressources' : ''}.`;
    await recordResult(environment.id, { namespace, status: 'created', message });
    return { status: 'created', namespace, message };
  } catch (err) {
    // Kubernetes non configuré (voir kubernetesService.notConfigured) n'est
    // pas une erreur de provisioning à proprement parler — juste
    // l'intégration absente, distincte d'une vraie tentative en échec.
    const notConfigured = err instanceof IntegrationError && err.status === 409;
    const status = notConfigured ? 'skipped' : 'failed';
    const message = notConfigured ? 'Kubernetes non configuré (Paramètres → Intégrations)' : (err.message || 'Échec du provisioning Kubernetes');
    await recordResult(environment.id, { namespace, status, message });
    return { status, namespace, message };
  }
}
