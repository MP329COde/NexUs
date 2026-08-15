import { query } from '../db/pool.js';

// Accès pur (pas de RBAC ici — voir routes/projects.routes.js), même
// pattern que store/changeStore.js et store/incidentStore.js.

export async function listForProject(projectId) {
  const { rows } = await query(
    'SELECT * FROM maintenance_windows WHERE project_id = $1 ORDER BY starts_at DESC',
    [projectId]
  );
  return rows;
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM maintenance_windows WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create({ projectId, environmentId, title, description, startsAt, endsAt, createdBy }) {
  const { rows } = await query(
    `INSERT INTO maintenance_windows (project_id, environment_id, title, description, starts_at, ends_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [projectId, environmentId || null, title, description || '', startsAt, endsAt, createdBy]
  );
  return rows[0];
}

export async function cancel(id) {
  const { rows } = await query(
    `UPDATE maintenance_windows SET cancelled_at = now() WHERE id = $1 AND cancelled_at IS NULL RETURNING *`,
    [id]
  );
  return rows[0] || null;
}
