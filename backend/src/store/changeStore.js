import { query } from '../db/pool.js';

// Accès pur (pas de RBAC ici — voir routes/projects.routes.js), cohérent
// avec store/incidentStore.js et store/orgStore.js.

export async function listForProject(projectId, { status } = {}) {
  if (status) {
    const { rows } = await query('SELECT * FROM changes WHERE project_id = $1 AND status = $2 ORDER BY created_at DESC', [projectId, status]);
    return rows;
  }
  const { rows } = await query('SELECT * FROM changes WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
  return rows;
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM changes WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create({ projectId, environmentId, title, description, impact, requestedBy }) {
  const { rows } = await query(
    `INSERT INTO changes (project_id, environment_id, title, description, impact, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [projectId, environmentId || null, title, description || '', impact || '', requestedBy]
  );
  return rows[0];
}

export async function decide(id, { status, decidedBy, decisionNote }) {
  const { rows } = await query(
    `UPDATE changes SET status = $1, decided_by = $2, decision_note = $3, decided_at = now() WHERE id = $4 RETURNING *`,
    [status, decidedBy, decisionNote || null, id]
  );
  return rows[0] || null;
}

export async function markExecuted(id) {
  const { rows } = await query(`UPDATE changes SET status = 'executed', executed_at = now() WHERE id = $1 RETURNING *`, [id]);
  return rows[0] || null;
}
