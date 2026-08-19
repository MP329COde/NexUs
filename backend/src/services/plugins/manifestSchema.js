// Validation stricte du manifest d'un plugin (manifest.json / plugin.yaml
// selon le format choisi par l'auteur du plugin — cette fonction reçoit déjà
// l'objet JS parsé, elle ne s'occupe pas du format source). Un manifest
// invalide est rejeté en bloc : jamais de chargement partiel d'un plugin
// mal déclaré, qui exposerait des permissions ou routes non voulues.
const CONTRIBUTION_KEYS = ['menus', 'pages', 'tabs', 'widgets', 'actions'];

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
    } else if (manifest.permissions.some((p) => !/^plugin:[a-z0-9-]+\.[a-z]+$/.test(p))) {
      errors.push('chaque permission doit suivre le format plugin:<domaine>.<niveau>');
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

  if (manifest.dependencies !== undefined && (typeof manifest.dependencies !== 'object' || Array.isArray(manifest.dependencies))) {
    errors.push('dependencies doit être un objet { pluginId: versionRange }');
  }

  return { valid: errors.length === 0, errors };
}
