import { pool, query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

// Notifications persistantes par utilisateur — voir 0032_user_notifications.sql.
// Best-effort et non bloquant, comme logAudit() : un échec d'écriture ne
// doit jamais faire échouer l'action métier qui l'a déclenché (assignation
// de tâche, etc.). No-op silencieux si Postgres n'est pas configuré (comme
// le reste du socle relationnel).
export async function notifyUser(userId, { type, title, message, meta } = {}) {
  if (!pool || !userId || !message) return null;
  try {
    const { rows } = await query(
      `INSERT INTO user_notifications (user_id, type, title, message, meta) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, type, title || null, message, meta ? JSON.stringify(meta) : null]
    );
    return rows[0];
  } catch (err) {
    logger.warn({ err, userId, type }, "Échec d'écriture d'une notification utilisateur");
    return null;
  }
}

export async function listForUser(userId, { unreadOnly = false, limit = 50 } = {}) {
  if (!pool) return [];
  const { rows } = unreadOnly
    ? await query(`SELECT * FROM user_notifications WHERE user_id = $1 AND read = false ORDER BY created_at DESC LIMIT $2`, [userId, limit])
    : await query(`SELECT * FROM user_notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
  return rows;
}

export async function countUnread(userId) {
  if (!pool) return 0;
  const { rows } = await query(`SELECT count(*)::int AS n FROM user_notifications WHERE user_id = $1 AND read = false`, [userId]);
  return rows[0]?.n || 0;
}

export async function markRead(userId, id) {
  const { rows } = await query(`UPDATE user_notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId]);
  return rows[0] || null;
}

export async function markAllRead(userId) {
  const { rowCount } = await query(`UPDATE user_notifications SET read = true WHERE user_id = $1 AND read = false`, [userId]);
  return rowCount;
}
