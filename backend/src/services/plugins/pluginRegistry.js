import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query } from '../../db/pool.js';
import { validateManifest } from './manifestSchema.js';
import { logger } from '../../utils/logger.js';

// Version courante de NexUs, pour la vérification minNexusVersion/
// maxNexusVersion à l'activation d'un plugin (pas de dépendance semver
// supplémentaire — comparaison numérique dotted suffit ici, aucun besoin de
// gérer les pré-releases pour ce contrôle de compatibilité basique).
const packageJsonPath = fileURLToPath(new URL('../../../package.json', import.meta.url));
const NEXUS_VERSION = JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function checkCompatibility(manifest) {
  if (manifest.minNexusVersion && compareVersions(NEXUS_VERSION, manifest.minNexusVersion) < 0) {
    return `Nécessite NexUs >= ${manifest.minNexusVersion} (version actuelle: ${NEXUS_VERSION})`;
  }
  if (manifest.maxNexusVersion && compareVersions(NEXUS_VERSION, manifest.maxNexusVersion) > 0) {
    return `Nécessite NexUs <= ${manifest.maxNexusVersion} (version actuelle: ${NEXUS_VERSION})`;
  }
  return null;
}

function toPublicPlugin(row) {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    apiVersion: row.api_version,
    manifest: row.manifest,
    status: row.status,
    installedAt: row.installed_at,
    updatedAt: row.updated_at
  };
}

export async function listPlugins() {
  const { rows } = await query(`SELECT * FROM plugins ORDER BY installed_at DESC`);
  return rows.map(toPublicPlugin);
}

export async function getPlugin(id) {
  const { rows } = await query(`SELECT * FROM plugins WHERE id = $1`, [id]);
  return rows[0] ? toPublicPlugin(rows[0]) : null;
}

// Installe un plugin à partir de son manifest déjà résolu (ce lot ne couvre
// pas le téléchargement depuis un registre distant — le manifest est fourni
// directement par l'appelant, ex. chargé depuis un dossier local plugins/).
// N'active jamais automatiquement : install et activate sont deux étapes
// distinctes, un plugin installé mais non actif n'exécute aucun code.
export async function installPlugin(manifest) {
  const { valid, errors } = validateManifest(manifest);
  if (!valid) throw Object.assign(new Error(`Manifest invalide: ${errors.join('; ')}`), { status: 400, errors });

  const incompatibility = checkCompatibility(manifest);
  if (incompatibility) throw Object.assign(new Error(incompatibility), { status: 409 });

  const { rows: existing } = await query(`SELECT id FROM plugins WHERE id = $1`, [manifest.id]);
  if (existing[0]) throw Object.assign(new Error(`Plugin déjà installé: ${manifest.id}`), { status: 409 });

  const { rows } = await query(
    `INSERT INTO plugins (id, name, version, api_version, manifest, status) VALUES ($1, $2, $3, $4, $5, 'installed') RETURNING *`,
    [manifest.id, manifest.name, manifest.version, manifest.apiVersion, JSON.stringify(manifest)]
  );
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  for (const permissionKey of permissions) {
    await query(`INSERT INTO plugin_permissions (plugin_id, permission_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [manifest.id, permissionKey]);
  }
  logger.info({ pluginId: manifest.id }, 'Plugin installé');
  return toPublicPlugin(rows[0]);
}

async function requirePlugin(id) {
  const { rows } = await query(`SELECT * FROM plugins WHERE id = $1`, [id]);
  if (!rows[0]) throw Object.assign(new Error('Plugin introuvable'), { status: 404 });
  return rows[0];
}

export async function activatePlugin(id) {
  const row = await requirePlugin(id);
  const incompatibility = checkCompatibility(row.manifest);
  if (incompatibility) throw Object.assign(new Error(incompatibility), { status: 409 });
  const { rows } = await query(`UPDATE plugins SET status = 'active', updated_at = now() WHERE id = $1 RETURNING *`, [id]);
  return toPublicPlugin(rows[0]);
}

export async function disablePlugin(id) {
  await requirePlugin(id);
  const { rows } = await query(`UPDATE plugins SET status = 'disabled', updated_at = now() WHERE id = $1 RETURNING *`, [id]);
  return toPublicPlugin(rows[0]);
}

export async function uninstallPlugin(id) {
  await requirePlugin(id);
  await query(`DELETE FROM plugins WHERE id = $1`, [id]); // cascade sur plugin_permissions/plugin_config/plugin_events_log
}

export async function getPluginPermissions(id) {
  await requirePlugin(id);
  const { rows } = await query(`SELECT permission_key FROM plugin_permissions WHERE plugin_id = $1 ORDER BY permission_key`, [id]);
  return rows.map((r) => r.permission_key);
}

// Vérifie qu'un plugin actif possède bien une permission donnée avant de lui
// laisser exécuter une capacité sensible (appelé par le code qui invoque des
// hooks/handlers de plugin, pas par ce module lui-même) — jamais
// d'héritage admin automatique pour un plugin, contrairement à un compte
// utilisateur admin de plateforme.
export async function pluginHasPermission(id, permissionKey) {
  const { rows } = await query(`SELECT 1 FROM plugins WHERE id = $1 AND status = 'active'`, [id]);
  if (!rows[0]) return false;
  const { rows: perms } = await query(`SELECT 1 FROM plugin_permissions WHERE plugin_id = $1 AND permission_key = $2`, [id, permissionKey]);
  return !!perms[0];
}

export async function setPluginConfig(id, key, value, encrypted = false) {
  await requirePlugin(id);
  await query(
    `INSERT INTO plugin_config (plugin_id, key, value, encrypted) VALUES ($1, $2, $3, $4)
     ON CONFLICT (plugin_id, key) DO UPDATE SET value = $3, encrypted = $4`,
    [id, key, JSON.stringify(value), encrypted]
  );
}

export async function getPluginConfig(id) {
  await requirePlugin(id);
  const { rows } = await query(`SELECT key, value, encrypted FROM plugin_config WHERE plugin_id = $1`, [id]);
  return rows;
}

export async function getPluginEvents(id, limit = 50) {
  await requirePlugin(id);
  const { rows } = await query(
    `SELECT event_type, payload, created_at FROM plugin_events_log WHERE plugin_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [id, Math.min(limit, 200)]
  );
  return rows;
}
