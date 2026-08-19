// Validation locale du manifest d'un plugin, avant tout appel réseau —
// miroir volontairement réduit de backend/src/services/plugins/manifestSchema.js
// (le CLI est un paquet séparé, sans accès au code backend ; la validation
// serveur reste la source de vérité finale à l'installation, celle-ci n'est
// qu'un retour rapide en local).
const CONTRIBUTION_KEYS = ['menus', 'pages', 'tabs', 'widgets', 'actions'];

// Miroir de backend/src/services/plugins/manifestSchema.js#PLUGIN_PERMISSION_CATALOG
// — garder les deux listes synchronisées manuellement (paquets séparés).
const PLUGIN_PERMISSION_CATALOG = [
  'plugin:catalog.read', 'plugin:catalog.write',
  'plugin:kubernetes.read', 'plugin:kubernetes.write',
  'plugin:secrets.read',
  'plugin:deployment.create',
  'plugin:network.read',
  'plugin:projects.read', 'plugin:projects.write',
  'plugin:notifications.write'
];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

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
