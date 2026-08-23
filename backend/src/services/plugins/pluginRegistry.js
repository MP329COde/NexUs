import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query, pool } from '../../db/pool.js';
import { validateManifest } from './manifestSchema.js';
import { logger } from '../../utils/logger.js';

// Version courante de NexUs, pour la vérification minNexusVersion/
// maxNexusVersion à l'activation d'un plugin (pas de dépendance semver
// supplémentaire — comparaison numérique dotted suffit ici, aucun besoin de
// gérer les pré-releases pour ce contrôle de compatibilité basique).
const packageJsonPath = fileURLToPath(new URL('../../../package.json', import.meta.url));
const NEXUS_VERSION = JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function checkCompatibility(manifest) {
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
    source: row.source,
    sourceRef: row.source_ref,
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
export async function installPlugin(manifest, { source = 'manifest', sourceRef = null } = {}) {
  const { valid, errors } = validateManifest(manifest);
  if (!valid) throw Object.assign(new Error(`Manifest invalide: ${errors.join('; ')}`), { status: 400, errors });

  const incompatibility = checkCompatibility(manifest);
  if (incompatibility) throw Object.assign(new Error(incompatibility), { status: 409 });

  const { rows: existing } = await query(`SELECT id FROM plugins WHERE id = $1`, [manifest.id]);
  if (existing[0]) throw Object.assign(new Error(`Plugin déjà installé: ${manifest.id}`), { status: 409 });

  const { rows } = await query(
    `INSERT INTO plugins (id, name, version, api_version, manifest, status, source, source_ref) VALUES ($1, $2, $3, $4, $5, 'installed', $6, $7) RETURNING *`,
    [manifest.id, manifest.name, manifest.version, manifest.apiVersion, JSON.stringify(manifest), source, sourceRef]
  );
  // Permissions insérées en statut 'pending' : un plugin fraîchement
  // installé n'a AUCUNE permission active tant qu'un admin ne les a pas
  // explicitement accordées une à une (voir grantPluginPermission ci-dessous
  // et le blocage correspondant dans activatePlugin). Comportement délibéré
  // depuis ce lot — auparavant les permissions étaient actives dès l'install.
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  for (const permissionKey of permissions) {
    await query(`INSERT INTO plugin_permissions (plugin_id, permission_key, status) VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING`, [manifest.id, permissionKey]);
  }
  logger.info({ pluginId: manifest.id, source }, 'Plugin installé');
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

  // Blocage réel si au moins une permission déclarée par le manifest n'est
  // pas 'granted' (voir migration 0048) : un plugin ne s'active jamais avec
  // des permissions en attente ou refusées, même si l'admin oublie de les
  // traiter — l'activation échoue avec la liste précise des permissions
  // problématiques plutôt qu'un message générique.
  const declaredPermissions = Array.isArray(row.manifest?.permissions) ? row.manifest.permissions : [];
  if (declaredPermissions.length) {
    const { rows: perms } = await query(
      `SELECT permission_key, status FROM plugin_permissions WHERE plugin_id = $1`,
      [id]
    );
    const statusByKey = new Map(perms.map((p) => [p.permission_key, p.status]));
    const notGranted = declaredPermissions
      .map((key) => ({ key, status: statusByKey.get(key) || 'pending' }))
      .filter((p) => p.status !== 'granted');
    if (notGranted.length) {
      throw Object.assign(
        new Error(`Activation impossible : permission(s) non approuvées — ${notGranted.map((p) => `${p.key} (${p.status})`).join(', ')}`),
        { status: 409, pendingPermissions: notGranted }
      );
    }
  }

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
  const { rows } = await query(
    `SELECT permission_key, status, decided_at, decided_by FROM plugin_permissions WHERE plugin_id = $1 ORDER BY permission_key`,
    [id]
  );
  return rows.map((r) => ({ key: r.permission_key, status: r.status, decidedAt: r.decided_at, decidedBy: r.decided_by }));
}

// Décision admin explicite sur une permission déclarée par un plugin (voir
// migration 0048 — toute permission entre en 'pending', jamais active par
// défaut). decidedBy est l'email de l'admin qui a tranché, pour audit.
async function decidePluginPermission(id, permissionKey, status, decidedBy) {
  await requirePlugin(id);
  const { rows } = await query(
    `UPDATE plugin_permissions SET status = $3, decided_at = now(), decided_by = $4
     WHERE plugin_id = $1 AND permission_key = $2 RETURNING *`,
    [id, permissionKey, status, decidedBy || null]
  );
  if (!rows[0]) throw Object.assign(new Error('Permission introuvable pour ce plugin'), { status: 404 });
  return { key: rows[0].permission_key, status: rows[0].status, decidedAt: rows[0].decided_at, decidedBy: rows[0].decided_by };
}

export async function grantPluginPermission(id, permissionKey, decidedBy) {
  return decidePluginPermission(id, permissionKey, 'granted', decidedBy);
}

export async function denyPluginPermission(id, permissionKey, decidedBy) {
  return decidePluginPermission(id, permissionKey, 'denied', decidedBy);
}

// Vérifie qu'un plugin actif possède bien une permission donnée avant de lui
// laisser exécuter une capacité sensible (appelé par le code qui invoque des
// hooks/handlers de plugin, pas par ce module lui-même) — jamais
// d'héritage admin automatique pour un plugin, contrairement à un compte
// utilisateur admin de plateforme.
export async function pluginHasPermission(id, permissionKey) {
  const { rows } = await query(`SELECT 1 FROM plugins WHERE id = $1 AND status = 'active'`, [id]);
  if (!rows[0]) return false;
  const { rows: perms } = await query(
    `SELECT 1 FROM plugin_permissions WHERE plugin_id = $1 AND permission_key = $2 AND status = 'granted'`,
    [id, permissionKey]
  );
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

// Installation depuis un dossier local du serveur (mode développeur) : le
// manifest.json est lu et validé AVANT toute écriture DB, exactement comme
// installPlugin() — aucune différence de rigueur pour un plugin en dev.
// Traçabilité : source='local-dev', source_ref=chemin fourni.
export async function installLocalPlugin(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') {
    throw Object.assign(new Error('Chemin de dossier requis'), { status: 400 });
  }
  const { readFileSync: readFile } = await import('node:fs');
  const path = await import('node:path');
  const manifestPath = path.join(dirPath, 'manifest.json');
  let raw;
  try {
    raw = readFile(manifestPath, 'utf8');
  } catch (err) {
    throw Object.assign(new Error(`manifest.json introuvable ou illisible dans ${dirPath}: ${err.message}`), { status: 400 });
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    throw Object.assign(new Error(`manifest.json invalide (JSON mal formé) : ${err.message}`), { status: 400 });
  }
  return installPlugin(manifest, { source: 'local-dev', sourceRef: dirPath });
}

// Installation depuis un dépôt Git distant (public, sans auth) : télécharge
// manifest.json via l'URL "raw" du fournisseur détecté depuis repoUrl. Ne
// dit jamais "installé" si le téléchargement ou la validation échoue — les
// erreurs réseau/HTTP/JSON sont propagées telles quelles à l'appelant.
function buildRawManifestUrl(repoUrl, ref) {
  const cleanUrl = String(repoUrl || '').trim().replace(/\/+$/, '').replace(/\.git$/, '');
  const branch = ref || 'main';
  const githubMatch = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)$/i);
  if (githubMatch) {
    const [, owner, repo] = githubMatch;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/manifest.json`;
  }
  // GitLab/Gitea générique : convention `{repoUrl}/raw/{ref}/manifest.json`
  // (chemin "raw" standard sur ces deux plateformes pour un fichier à la
  // racine par défaut de la branche).
  return `${cleanUrl}/raw/${branch}/manifest.json`;
}

export async function installGitPlugin(repoUrl, ref) {
  if (!repoUrl || typeof repoUrl !== 'string') {
    throw Object.assign(new Error('repoUrl requis'), { status: 400 });
  }
  const rawUrl = buildRawManifestUrl(repoUrl, ref);
  let response;
  try {
    response = await fetch(rawUrl);
  } catch (err) {
    throw Object.assign(new Error(`Échec du téléchargement de manifest.json depuis ${rawUrl}: ${err.message}`), { status: 502 });
  }
  if (!response.ok) {
    throw Object.assign(new Error(`manifest.json introuvable sur ${rawUrl} (HTTP ${response.status})`), { status: response.status === 404 ? 404 : 502 });
  }
  const text = await response.text();
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (err) {
    throw Object.assign(new Error(`manifest.json distant invalide (JSON mal formé) : ${err.message}`), { status: 400 });
  }
  return installPlugin(manifest, { source: 'git', sourceRef: `${repoUrl}${ref ? `#${ref}` : ''}` });
}

// Mise à jour avec sauvegarde + rollback réel : toute la mise à jour se
// déroule dans UNE transaction Postgres explicite (BEGIN/COMMIT/ROLLBACK
// via un client dédié de pool.connect(), même pattern que
// restoreRelationalCore() dans pgDumpService.js). Si une étape échoue
// (validation du nouveau manifest, incompatibilité de version, écriture
// DB), ROLLBACK réel : le plugin reste strictement dans son état précédent,
// jamais de succès fictif renvoyé à l'appelant.
export async function updatePlugin(id, newManifest) {
  if (!pool) throw Object.assign(new Error("DATABASE_URL n'est pas configuré"), { status: 503 });

  const current = await requirePlugin(id);

  const { valid, errors } = validateManifest(newManifest);
  if (!valid) throw Object.assign(new Error(`Nouveau manifest invalide: ${errors.join('; ')}`), { status: 400, errors });
  if (newManifest.id !== id) throw Object.assign(new Error('id du manifest ne correspond pas au plugin ciblé'), { status: 400 });

  const incompatibility = checkCompatibility(newManifest);
  if (incompatibility) throw Object.assign(new Error(incompatibility), { status: 409 });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: prevPerms } = await client.query(
      `SELECT permission_key, status FROM plugin_permissions WHERE plugin_id = $1`,
      [id]
    );

    // Sauvegarde de l'état précédent complet, écrite dans la même
    // transaction : si le reste échoue, le ROLLBACK annule aussi cette
    // sauvegarde (pas de backup orphelin d'une mise à jour qui n'a jamais
    // abouti).
    await client.query(
      `INSERT INTO plugin_update_backups (plugin_id, previous_manifest, previous_version, previous_status, previous_permissions)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, JSON.stringify(current.manifest), current.version, current.status, JSON.stringify(prevPerms)]
    );

    await client.query(
      `UPDATE plugins SET name = $2, version = $3, api_version = $4, manifest = $5, updated_at = now() WHERE id = $1`,
      [id, newManifest.name, newManifest.version, newManifest.apiVersion, JSON.stringify(newManifest)]
    );

    // Permissions du nouveau manifest : celles déjà 'granted' le restent
    // (pas de re-demande d'approbation pour une permission déjà accordée et
    // toujours déclarée) ; toute permission NOUVELLE (absente de l'ancien
    // manifest) repart en 'pending' — jamais accordée automatiquement par
    // simple continuité d'une mise à jour, une nouvelle capacité doit être
    // revalidée par un admin. Les permissions retirées du nouveau manifest
    // sont supprimées.
    const prevStatusByKey = new Map(prevPerms.map((p) => [p.permission_key, p.status]));
    const newPermissions = Array.isArray(newManifest.permissions) ? newManifest.permissions : [];
    await client.query(`DELETE FROM plugin_permissions WHERE plugin_id = $1 AND NOT (permission_key = ANY($2::text[]))`, [id, newPermissions]);
    for (const key of newPermissions) {
      const keepStatus = prevStatusByKey.has(key) ? prevStatusByKey.get(key) : 'pending';
      await client.query(
        `INSERT INTO plugin_permissions (plugin_id, permission_key, status) VALUES ($1, $2, $3)
         ON CONFLICT (plugin_id, permission_key) DO UPDATE SET status = $3`,
        [id, key, keepStatus]
      );
    }

    const { rows } = await client.query(`SELECT * FROM plugins WHERE id = $1`, [id]);
    await client.query('COMMIT');
    logger.info({ pluginId: id, fromVersion: current.version, toVersion: newManifest.version }, 'Plugin mis à jour');
    return toPublicPlugin(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logger.warn({ pluginId: id, err: err.message }, 'Mise à jour du plugin annulée (rollback)');
    throw err;
  } finally {
    client.release();
  }
}

// Healthcheck basé uniquement sur des données réelles déjà en base : aucune
// exécution de code plugin (le socle actuel n'exécute pas de code serveur
// autonome pour un plugin — voir eventBus.js/hookRegistry.js), donc pas de
// "ping" applicatif possible. Les vérifications portent sur ce qui EST
// mesurable : présence d'erreurs récentes dans le journal d'événements,
// fraîcheur du dernier événement, cohérence des permissions déclarées vs
// accordées.
export async function getPluginHealth(id) {
  const row = await requirePlugin(id);
  const checks = [];

  const { rows: recentErrors } = await query(
    `SELECT event_type, created_at FROM plugin_events_log WHERE plugin_id = $1 AND event_type ILIKE '%error%' ORDER BY created_at DESC LIMIT 5`,
    [id]
  );
  checks.push({
    name: 'recent_errors',
    ok: recentErrors.length === 0,
    detail: recentErrors.length === 0 ? 'Aucune erreur récente dans le journal des événements' : `${recentErrors.length} événement(s) d'erreur récent(s) (dernier: ${recentErrors[0].event_type} à ${recentErrors[0].created_at.toISOString()})`
  });

  const { rows: lastEventRows } = await query(
    `SELECT created_at FROM plugin_events_log WHERE plugin_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  );
  const lastEventAt = lastEventRows[0]?.created_at || null;
  const staleThresholdMs = 30 * 24 * 60 * 60 * 1000; // 30 jours
  const stale = lastEventAt ? (Date.now() - new Date(lastEventAt).getTime()) > staleThresholdMs : null;
  checks.push({
    name: 'event_freshness',
    ok: lastEventAt === null || stale === false,
    detail: lastEventAt ? `Dernier événement : ${new Date(lastEventAt).toISOString()}${stale ? ' (plus de 30 jours)' : ''}` : "Aucun événement journalisé pour ce plugin"
  });

  const declaredPermissions = Array.isArray(row.manifest?.permissions) ? row.manifest.permissions : [];
  const { rows: perms } = await query(`SELECT permission_key, status FROM plugin_permissions WHERE plugin_id = $1`, [id]);
  const statusByKey = new Map(perms.map((p) => [p.permission_key, p.status]));
  const notGranted = declaredPermissions.filter((k) => statusByKey.get(k) !== 'granted');
  checks.push({
    name: 'permissions_consistency',
    ok: notGranted.length === 0,
    detail: notGranted.length === 0 ? 'Toutes les permissions déclarées sont accordées' : `Permission(s) non accordée(s) : ${notGranted.join(', ')}`
  });

  checks.push({
    name: 'status',
    ok: row.status === 'active',
    detail: `Statut actuel : ${row.status}`
  });

  // Statut agrégé : 'unhealthy' si des erreurs récentes existent ou si des
  // permissions déclarées ne sont pas accordées (problèmes bloquants pour
  // le fonctionnement réel du plugin) ; 'degraded' si seul le plugin est
  // inactif ou si son dernier événement est ancien (rien de cassé, juste
  // pas d'activité récente) ; 'healthy' sinon.
  const failing = checks.filter((c) => !c.ok);
  const blocking = failing.filter((c) => c.name === 'recent_errors' || c.name === 'permissions_consistency');
  const status = blocking.length > 0 ? 'unhealthy' : failing.length > 0 ? 'degraded' : 'healthy';

  return { ok: failing.length === 0, status, checks };
}
