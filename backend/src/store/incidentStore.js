import { query } from '../db/pool.js';

// Couche d'accès pure (pas de RBAC ici — voir routes/projects.routes.js et
// routes/incidents.routes.js pour les vérifications de rôle/portée),
// cohérent avec store/orgStore.js.

export async function listForProject(projectId, { status } = {}) {
  if (status) {
    const { rows } = await query(
      'SELECT * FROM incidents WHERE project_id = $1 AND status = $2 ORDER BY created_at DESC',
      [projectId, status]
    );
    return rows;
  }
  const { rows } = await query('SELECT * FROM incidents WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
  return rows;
}

export async function listGlobal({ status, severity, limit = 100 } = {}) {
  const conditions = [];
  const params = [];
  if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
  if (severity) { params.push(severity); conditions.push(`severity = $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const { rows } = await query(`SELECT * FROM incidents ${where} ORDER BY created_at DESC LIMIT $${params.length}`, params);
  return rows;
}

export async function getById(id) {
  const { rows } = await query('SELECT * FROM incidents WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function create({ projectId, jobId, title, description, severity, resourceType, resourceRef, runbookUrl, createdBy }) {
  const { rows } = await query(
    `INSERT INTO incidents (project_id, job_id, title, description, severity, resource_type, resource_ref, runbook_url, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [projectId || null, jobId || null, title, description || '', severity, resourceType || null, resourceRef || null, runbookUrl || null, createdBy]
  );
  return rows[0];
}

export async function update(id, { status, assignedTo, resolution, runbookUrl }) {
  const sets = ['updated_at = now()'];
  const params = [];
  if (status !== undefined) {
    params.push(status);
    sets.push(`status = $${params.length}`);
    if (status === 'resolved') sets.push('resolved_at = now()');
  }
  if (assignedTo !== undefined) { params.push(assignedTo); sets.push(`assigned_to = $${params.length}`); }
  if (resolution !== undefined) { params.push(resolution); sets.push(`resolution = $${params.length}`); }
  if (runbookUrl !== undefined) { params.push(runbookUrl || null); sets.push(`runbook_url = $${params.length}`); }
  params.push(id);
  const { rows } = await query(`UPDATE incidents SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return rows[0] || null;
}

export async function addComment(incidentId, authorId, body) {
  const { rows } = await query(
    'INSERT INTO incident_comments (incident_id, author_id, body) VALUES ($1, $2, $3) RETURNING *',
    [incidentId, authorId, body]
  );
  return rows[0];
}

export async function listComments(incidentId) {
  const { rows } = await query('SELECT * FROM incident_comments WHERE incident_id = $1 ORDER BY created_at', [incidentId]);
  return rows;
}
