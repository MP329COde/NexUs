import { pool, query } from '../db/pool.js';

// Feature flags (voir 0035_feature_flags.sql) : activation progressive
// d'une fonctionnalité expérimentale, globalement ou ciblée par
// organisation/utilisateur — todo.md item 26. Aucun flag n'existe par
// défaut : une fonctionnalité gérée par flag doit d'abord être déclarée
// (upsertFlag) avant de pouvoir être vérifiée.
export async function listFlags() {
  if (!pool) return [];
  const { rows } = await query('SELECT * FROM feature_flags ORDER BY key');
  return rows;
}

export async function getFlag(key) {
  if (!pool) return null;
  const { rows } = await query('SELECT * FROM feature_flags WHERE key = $1', [key]);
  return rows[0] || null;
}

export async function upsertFlag(key, { label, description, enabled, orgIds, userIds, userId }) {
  const { rows } = await query(
    `INSERT INTO feature_flags (key, label, description, enabled, org_ids, user_ids, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (key) DO UPDATE SET
       label = $2, description = $3, enabled = $4, org_ids = $5, user_ids = $6, updated_by = $7, updated_at = now()
     RETURNING *`,
    [key, label, description || '', !!enabled, JSON.stringify(orgIds || []), JSON.stringify(userIds || []), userId]
  );
  return rows[0];
}

export async function deleteFlag(key) {
  const { rowCount } = await query('DELETE FROM feature_flags WHERE key = $1', [key]);
  return rowCount > 0;
}

// Vérification consommée par le reste de la plateforme pour activer/
// désactiver une fonctionnalité — jamais utilisée elle-même par ce
// service (pas de dépendance circulaire vers une fonctionnalité précise).
// Un flag inconnu (jamais déclaré) est considéré désactivé, jamais activé
// par défaut.
export async function isFeatureEnabled(key, { orgId, userId } = {}) {
  const flag = await getFlag(key);
  if (!flag) return false;
  if (flag.enabled) return true;
  if (orgId && (flag.org_ids || []).includes(orgId)) return true;
  if (userId && (flag.user_ids || []).includes(userId)) return true;
  return false;
}
