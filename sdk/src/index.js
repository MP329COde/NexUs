// SDK plugin NexUs — miroir volontairement réduit de trois catalogues
// fermés côté serveur (backend/src/services/plugins/{coreEvents,
// hookRegistry,manifestSchema}.js) : un développeur de plugin doit pouvoir
// écrire et valider son manifest sans backend NexUs à portée (même
// principe que cli/src/pluginManifest.js). La validation serveur à
// l'installation reste la source de vérité finale ; ceci n'est qu'un
// retour rapide en local/CI, à garder synchronisé manuellement avec le
// backend (paquets séparés, pas de dépendance partagée).

export const CORE_EVENTS = Object.freeze([
  'service.created',
  'service.updated',
  'environment.created',
  'environment.provisioned',
  'deployment.started',
  'deployment.completed',
  'deployment.failed',
  'deployment.rollback',
  'pipeline.started',
  'pipeline.completed',
  'preview.created',
  'preview.destroyed',
  'secret.updated',
  'user.created',
  'team.updated',
  'incident.created'
]);

export const CORE_HOOKS = Object.freeze([
  'beforeServiceCreate', 'afterServiceCreate',
  'beforeDeployment', 'afterDeployment',
  'beforeEnvironmentCreate', 'afterEnvironmentCreate',
  'beforeProvision', 'afterProvision',
  'beforeRollback', 'afterRollback'
]);

export const PLUGIN_PERMISSION_CATALOG = Object.freeze([
  'plugin:catalog.read', 'plugin:catalog.write',
  'plugin:kubernetes.read', 'plugin:kubernetes.write',
  'plugin:secrets.read',
  'plugin:deployment.create',
  'plugin:network.read',
  'plugin:projects.read', 'plugin:projects.write',
  'plugin:notifications.write'
]);

const CONTRIBUTION_KEYS = ['menus', 'pages', 'tabs', 'widgets', 'actions'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Valide un manifest de plugin (voir PluginManifest dans index.d.ts) — mêmes
 * règles que backend/src/services/plugins/manifestSchema.js#validateManifest.
 * @param {unknown} manifest
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest manquant ou invalide'] };
  }
  if (!isNonEmptyString(manifest.id) || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
    errors.push("id invalide (lettres minuscules, chiffres, tirets, ne doit pas commencer par un tiret)");
  }
  if (!isNonEmptyString(manifest.name)) errors.push('name requis');
  if (!isNonEmptyString(manifest.version)) errors.push('version requise');
  if (!isNonEmptyString(manifest.apiVersion)) errors.push('apiVersion requise');

  if (manifest.permissions !== undefined) {
    if (!Array.isArray(manifest.permissions) || manifest.permissions.some((p) => !isNonEmptyString(p))) {
      errors.push('permissions doit être un tableau de chaînes');
    } else {
      const unknown = manifest.permissions.filter((p) => !PLUGIN_PERMISSION_CATALOG.includes(p));
      if (unknown.length) errors.push(`permission(s) inconnue(s) : ${unknown.join(', ')} (catalogue : ${PLUGIN_PERMISSION_CATALOG.join(', ')})`);
    }
  }

  if (manifest.contributes !== undefined) {
    if (typeof manifest.contributes !== 'object' || Array.isArray(manifest.contributes)) {
      errors.push('contributes doit être un objet');
    } else {
      for (const key of Object.keys(manifest.contributes)) {
        if (!CONTRIBUTION_KEYS.includes(key)) errors.push(`contributes.${key} inconnu (attendu: ${CONTRIBUTION_KEYS.join(', ')})`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function isCoreEvent(type) {
  return CORE_EVENTS.includes(type);
}

export function isCoreHook(name) {
  return CORE_HOOKS.includes(name);
}
