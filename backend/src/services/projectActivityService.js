import { pool, query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

// Activité d'équipe par projet — voir 0036_project_activity.sql. Best-effort
// et non bloquant, comme logAudit() : ne doit jamais faire échouer l'action
// métier qui l'a déclenchée. No-op silencieux si Postgres n'est pas
// configuré ou si le projet n'a pas de pendant relationnel (projet legacy
// non migré) — auquel cas l'appelant passe simplement un id qui échoue en
// silence ici plutôt que de complexifier chaque site d'appel avec une
// vérification préalable.
export async function logProjectActivity(projectId, actorId, action, meta = {}) {
  if (!pool || !projectId) return;
  try {
    await query('INSERT INTO project_activity (project_id, actor_id, action, meta) VALUES ($1, $2, $3, $4)', [projectId, actorId, action, JSON.stringify(meta)]);
  } catch (err) {
    logger.warn({ err, projectId, action }, "Échec de journalisation d'une activité de projet");
  }
}

export async function listProjectActivity(projectId, limit = 50) {
  if (!pool) return [];
  const { rows } = await query('SELECT * FROM project_activity WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2', [projectId, Math.min(limit, 200)]);
  return rows;
}
