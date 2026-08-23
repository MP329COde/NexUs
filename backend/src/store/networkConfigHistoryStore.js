import { query } from '../db/pool.js';

// Historique des configurations réseau appliquées (table network_config_history,
// migration 0043) — voir services/integrations/haproxyService.js pour l'usage
// (diff/rollback de la config brute HAProxy, la Data Plane API n'en garde pas trace).

export async function snapshot(module, content, appliedBy, note = '') {
  const { rows } = await query(
    'INSERT INTO network_config_history (module, content, applied_by, note) VALUES ($1, $2, $3, $4) RETURNING *',
    [module, content, appliedBy, note]
  );
  return rows[0];
}

export async function snapshotRollback(module, content, appliedBy, rollbackOf, note = '') {
  const { rows } = await query(
    'INSERT INTO network_config_history (module, content, applied_by, rollback_of, note) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [module, content, appliedBy, rollbackOf, note]
  );
  return rows[0];
}

export async function listHistory(module, limit = 30) {
  const { rows } = await query(
    'SELECT id, module, applied_by, applied_at, rollback_of, note FROM network_config_history WHERE module = $1 ORDER BY applied_at DESC LIMIT $2',
    [module, limit]
  );
  return rows;
}

export async function getEntry(module, id) {
  const { rows } = await query('SELECT * FROM network_config_history WHERE module = $1 AND id = $2', [module, id]);
  return rows[0] || null;
}
