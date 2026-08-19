import { pool, query } from '../db/pool.js';
import { logger } from '../utils/logger.js';

// Activité d'équipe — voir 0036_project_activity.sql puis 0040_activity_entities.sql
// (généralisation polymorphe organisation/équipe/projet, todo.md #31/#32).
// Best-effort et non bloquant, comme logAudit() : ne doit jamais faire
// échouer l'action métier qui l'a déclenchée. No-op silencieux si Postgres
// n'est pas configuré ou si l'entité n'a pas de pendant relationnel.
export async function logActivity(entityType, entityId, actorId, action, meta = {}) {
  if (!pool || !entityId) return;
  try {
    const projectId = entityType === 'project' ? entityId : null;
    await query(
      'INSERT INTO project_activity (project_id, entity_type, entity_id, actor_id, action, meta) VALUES ($1, $2, $3, $4, $5, $6)',
      [projectId, entityType, entityId, actorId, action, JSON.stringify(meta)]
    );
  } catch (err) {
    logger.warn({ err, entityType, entityId, action }, "Échec de journalisation d'une activité");
  }
}

export async function listActivity(entityType, entityId, limit = 50) {
  if (!pool) return [];
  const { rows } = await query(
    'SELECT * FROM project_activity WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT $3',
    [entityType, entityId, Math.min(limit, 200)]
  );
  return rows;
}

export async function logProjectActivity(projectId, actorId, action, meta = {}) {
  return logActivity('project', projectId, actorId, action, meta);
}

export async function listProjectActivity(projectId, limit = 50) {
  return listActivity('project', projectId, limit);
}
