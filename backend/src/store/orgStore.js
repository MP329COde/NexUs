import { query } from '../db/pool.js';

// Couche d'accès au socle relationnel (organisations, équipes, projets,
// environnements). Toute la logique de visibilité/permission vit dans
// middleware/projectAccess.js — ce module ne fait que lire/écrire.

export async function listOrganizationsForUser(userId) {
  const { rows } = await query(
    `SELECT o.*, m.role AS my_role FROM organizations o
     JOIN org_members m ON m.org_id = o.id
     WHERE m.user_id = $1 ORDER BY o.name`,
    [userId]
  );
  return rows;
}

export async function createOrganization({ name, slug, ownerUserId }) {
  const client = await (await import('../db/pool.js')).requirePool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *',
      [name, slug]
    );
    const org = rows[0];
    await client.query(
      'INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)',
      [org.id, ownerUserId, 'owner']
    );
    await client.query('COMMIT');
    return org;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getOrgRole(orgId, userId) {
  const { rows } = await query(
    'SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  return rows[0]?.role || null;
}

// --- Projets ---

const PROJECT_ROLE_RANK = { viewer: 1, developer: 2, maintainer: 3, owner: 4 };

export function projectRoleAtLeast(role, min) {
  if (!role) return false;
  return (PROJECT_ROLE_RANK[role] || 0) >= (PROJECT_ROLE_RANK[min] || 0);
}

export async function listProjectsForUser(userId) {
  const { rows } = await query(
    `SELECT DISTINCT p.*, COALESCE(pm.role,
        CASE om.role WHEN 'owner' THEN 'owner' WHEN 'admin' THEN 'owner' ELSE NULL END
      ) AS my_role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
     LEFT JOIN org_members om ON om.org_id = p.org_id AND om.user_id = $1
     WHERE pm.user_id = $1 OR om.role IN ('owner', 'admin')
     ORDER BY p.name`,
    [userId]
  );
  return rows;
}

export async function getProjectRole(projectId, userId) {
  const { rows } = await query(
    `SELECT COALESCE(pm.role,
        CASE om.role WHEN 'owner' THEN 'owner' WHEN 'admin' THEN 'owner' ELSE NULL END
      ) AS role
     FROM projects p
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     LEFT JOIN org_members om ON om.org_id = p.org_id AND om.user_id = $2
     WHERE p.id = $1`,
    [projectId, userId]
  );
  return rows[0]?.role || null;
}

export async function getProject(id) {
  const { rows } = await query('SELECT * FROM projects WHERE id = $1', [id]);
  return rows[0] || null;
}

// L'API expose l'identifiant historique (legacy_id, celui du store JSON
// d'origine) dans les URLs de projet pour ne jamais casser un lien existant
// ni les sous-ressources qui référencent encore ce même id (tâches,
// raccourcis, coffre-fort projet — voir routes/projects.routes.js).
export async function getProjectByLegacyId(legacyId) {
  const { rows } = await query('SELECT * FROM projects WHERE legacy_id = $1', [legacyId]);
  return rows[0] || null;
}

export async function createProject({ orgId, name, slug, description, tags, repoKeys, ownerUserId, legacyId }) {
  const client = await (await import('../db/pool.js')).requirePool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO projects (org_id, name, slug, description, tags, repo_keys, legacy_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [orgId, name, slug, description || '', JSON.stringify(tags || []), JSON.stringify(repoKeys || []), legacyId || null]
    );
    const project = rows[0];
    if (ownerUserId) {
      await client.query(
        'INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)',
        [project.id, ownerUserId, 'owner']
      );
    }
    await client.query(
      `INSERT INTO environments (project_id, name, kind, is_production) VALUES
        ($1, 'production', 'production', true),
        ($1, 'staging', 'staging', false)`,
      [project.id]
    );
    await client.query('COMMIT');
    return project;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listMembers(projectId) {
  const { rows } = await query(
    'SELECT user_id, role FROM project_members WHERE project_id = $1 ORDER BY created_at',
    [projectId]
  );
  return rows;
}

export async function setMemberRole(projectId, userId, role) {
  const { rows } = await query(
    `INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role = excluded.role
     RETURNING *`,
    [projectId, userId, role]
  );
  return rows[0];
}

export async function removeMember(projectId, userId) {
  await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
}

export async function listEnvironments(projectId) {
  const { rows } = await query(
    'SELECT * FROM environments WHERE project_id = $1 ORDER BY is_production DESC, name',
    [projectId]
  );
  return rows;
}

export async function createEnvironment(projectId, { name, kind, isProduction }) {
  const { rows } = await query(
    `INSERT INTO environments (project_id, name, kind, is_production) VALUES ($1, $2, $3, $4) RETURNING *`,
    [projectId, name, kind || 'custom', Boolean(isProduction)]
  );
  return rows[0];
}
