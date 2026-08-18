import crypto from 'node:crypto';
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

// Même palette rotative que projectsStore.js (PROJECT_COLORS), pour une
// cohérence visuelle entre organisations et projets.
const ORG_COLORS = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B', '#F43F5E', '#0EA5E9', '#EC4899'];

export async function createOrganization({ name, slug, ownerUserId, icon, color }) {
  const client = await (await import('../db/pool.js')).requirePool().connect();
  try {
    await client.query('BEGIN');
    const { rows: countRows } = await client.query('SELECT COUNT(*)::int AS n FROM organizations');
    const defaultColor = ORG_COLORS[countRows[0].n % ORG_COLORS.length];
    const { rows } = await client.query(
      'INSERT INTO organizations (name, slug, icon, color) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, slug, icon || null, color || defaultColor]
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

// Fiche organisation seule (contrairement à listOrganizationsForUser, qui ne
// renvoie que celles dont l'appelant est membre) : l'appelant vérifie
// lui-même son rôle via getOrgRole() avant d'exposer quoi que ce soit,
// exactement comme getProject() plus bas pour les projets.
export async function getOrganization(orgId) {
  const { rows } = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
  return rows[0] || null;
}

export async function getOrgRole(orgId, userId) {
  const { rows } = await query(
    'SELECT role FROM org_members WHERE org_id = $1 AND user_id = $2',
    [orgId, userId]
  );
  return rows[0]?.role || null;
}

const ORG_ROLE_RANK = { member: 1, admin: 2, owner: 3 };

// Remplace la vérification `role !== 'owner' && role !== 'admin'` répétée
// dans routes/organizations.routes.js et routes/wiki.routes.js — à
// combiner avec middleware/auth.js#isPlatformAdmin(req.user) pour le
// bypass admin plateforme, que cette fonction ne connaît pas (portée
// volontairement limitée au seul rôle organisation).
export function orgRoleAtLeast(role, min) {
  if (!role) return false;
  return (ORG_ROLE_RANK[role] || 0) >= (ORG_ROLE_RANK[min] || 0);
}

export async function updateOrganization(orgId, { name, icon, color }) {
  // icon n'était pas protégé par COALESCE (contrairement à name/color) : une
  // mise à jour ne renseignant pas l'icône (ex. juste renommer l'organisation)
  // l'effaçait silencieusement à NULL — trouvé en auditant le même défaut
  // que celui corrigé dans projectsStore.updateProject().
  const { rows } = await query(
    `UPDATE organizations SET name = COALESCE($2, name), icon = COALESCE($3, icon), color = COALESCE($4, color) WHERE id = $1 RETURNING *`,
    [orgId, name || null, icon || null, color || null]
  );
  return rows[0] || null;
}

// Suppression réelle (ON DELETE CASCADE sur org_members/teams/projects/
// wiki_pages, voir migrations 0001_core.sql et 0012_wiki.sql) : irréversible,
// d'où le comptage préalable des projets pour que la route appelante puisse
// exiger une confirmation explicite si l'organisation n'est pas vide plutôt
// que de supprimer silencieusement des projets entiers.
export async function countOrgProjects(orgId) {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM projects WHERE org_id = $1', [orgId]);
  return rows[0].n;
}

export async function deleteOrganization(orgId) {
  const { rowCount } = await query('DELETE FROM organizations WHERE id = $1', [orgId]);
  return rowCount > 0;
}

// --- Membres d'organisation --- (absent jusqu'ici : une organisation ne
// pouvait avoir que son créateur comme membre, aucun moyen d'y ajouter un
// collègue — bloquant pour tout usage à plusieurs. Distinct de listMembers()
// plus bas, qui liste les membres d'un PROJET, pas d'une organisation.)
// Pas de jointure SQL vers une table "users" : les comptes vivent dans le
// store SQLite historique (usersStore.js), pas dans Postgres — même
// convention que listMembers() (projets) ci-dessous, résolu côté frontend
// via GET /users (déjà comment fait ProjectDetailPage.jsx).
export async function listOrgMembers(orgId) {
  const { rows } = await query(
    'SELECT user_id, role FROM org_members WHERE org_id = $1 ORDER BY created_at',
    [orgId]
  );
  return rows;
}

export async function addOrgMember(orgId, userId, role = 'member') {
  const { rows } = await query(
    `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = excluded.role
     RETURNING *`,
    [orgId, userId, role]
  );
  return rows[0];
}

export async function countOrgOwners(orgId) {
  const { rows } = await query(`SELECT COUNT(*)::int AS n FROM org_members WHERE org_id = $1 AND role = 'owner'`, [orgId]);
  return rows[0].n;
}

export async function removeOrgMember(orgId, userId) {
  const { rowCount } = await query('DELETE FROM org_members WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
  return rowCount > 0;
}

// --- Projets ---

const PROJECT_ROLE_RANK = { viewer: 1, developer: 2, maintainer: 3, owner: 4 };

export function projectRoleAtLeast(role, min) {
  if (!role) return false;
  return (PROJECT_ROLE_RANK[role] || 0) >= (PROJECT_ROLE_RANK[min] || 0);
}

// --- Octrois d'accès par ressource (granularité fine, en complément du rôle
// global — voir migrations/0011_project_resource_grants.sql) ---

const RESOURCE_LEVEL_RANK = { read: 1, write: 2 };
// Rôle global minimal qui donne déjà accès à une ressource, indépendamment
// de tout octroi — un octroi ne fait jamais que combler l'écart en dessous
// de ce seuil, jamais le dépasser à la baisse.
const RESOURCE_BASE_ROLE = { vault: 'developer' };

export function hasResourceAccess(projectRole, grantLevel, resource, minLevel) {
  if (projectRoleAtLeast(projectRole, RESOURCE_BASE_ROLE[resource])) return true;
  if (!grantLevel) return false;
  return (RESOURCE_LEVEL_RANK[grantLevel] || 0) >= (RESOURCE_LEVEL_RANK[minLevel] || 0);
}

export function resourceLevelAtLeast(level, min) {
  if (!level) return false;
  return (RESOURCE_LEVEL_RANK[level] || 0) >= (RESOURCE_LEVEL_RANK[min] || 0);
}

export async function listResourceGrants(projectId) {
  const { rows } = await query(
    'SELECT * FROM project_resource_grants WHERE project_id = $1 ORDER BY resource, user_id',
    [projectId]
  );
  return rows;
}

export async function getResourceGrant(projectId, userId, resource) {
  const { rows } = await query(
    'SELECT * FROM project_resource_grants WHERE project_id = $1 AND user_id = $2 AND resource = $3',
    [projectId, userId, resource]
  );
  return rows[0] || null;
}

export async function setResourceGrant(projectId, userId, resource, level, grantedBy) {
  if (!level) {
    await query('DELETE FROM project_resource_grants WHERE project_id = $1 AND user_id = $2 AND resource = $3', [projectId, userId, resource]);
    return null;
  }
  const { rows } = await query(
    `INSERT INTO project_resource_grants (project_id, user_id, resource, level, granted_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id, user_id, resource) DO UPDATE SET level = excluded.level, granted_by = excluded.granted_by
     RETURNING *`,
    [projectId, userId, resource, level, grantedBy]
  );
  return rows[0];
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

// Répercute les champs partagés (name/description/tags/repoKeys) sur le
// projet relationnel après une modification côté store JSON legacy — sans
// cet appel, GET /api/organizations/:id/projects (routes/organizations.routes.js)
// aurait continué à afficher le nom/description d'origine indéfiniment,
// même après un renommage via PUT /api/projects/:id.
export async function updateProjectByLegacyId(legacyId, { name, description, tags, repoKeys }) {
  const sets = ['updated_at = now()'];
  const params = [];
  if (name !== undefined) { params.push(name); sets.push(`name = $${params.length}`); }
  if (description !== undefined) { params.push(description); sets.push(`description = $${params.length}`); }
  if (tags !== undefined) { params.push(JSON.stringify(tags)); sets.push(`tags = $${params.length}`); }
  if (repoKeys !== undefined) { params.push(JSON.stringify(repoKeys)); sets.push(`repo_keys = $${params.length}`); }
  if (params.length === 0) return;
  params.push(legacyId);
  await query(`UPDATE projects SET ${sets.join(', ')} WHERE legacy_id = $${params.length}`, params);
}

// Supprime le projet relationnel (et tout ce qui en dépend en cascade :
// project_members, environments, jobs, incidents — voir les FK ON DELETE
// CASCADE des migrations) quand un projet legacy migré est supprimé. Sans
// cet appel, la suppression via DELETE /api/projects/:id (routes/projects.routes.js)
// ne touchait que le store JSON et laissait le projet Postgres orphelin
// indéfiniment, avec tous ses membres/jobs/incidents pointant vers un
// legacy_id qui n'existe plus.
export async function deleteProjectByLegacyId(legacyId) {
  await query('DELETE FROM projects WHERE legacy_id = $1', [legacyId]);
}

// Régénère le secret de webhook d'un projet (révoque implicitement
// l'ancienne URL/jeton — voir routes/projects.routes.js POST
// /:id/webhook/rotate). Un projet créé avant cette migration (webhook_secret
// NULL) reçoit son premier secret via cette même fonction, appelée à la
// demande plutôt que rétroactivement pour tous les projets existants.
export async function rotateWebhookSecret(projectId) {
  const secret = crypto.randomBytes(24).toString('hex');
  const { rows } = await query('UPDATE projects SET webhook_secret = $1 WHERE id = $2 RETURNING webhook_secret', [secret, projectId]);
  return rows[0]?.webhook_secret || null;
}

export async function createProject({ orgId, name, slug, description, tags, repoKeys, ownerUserId, legacyId }) {
  const client = await (await import('../db/pool.js')).requirePool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO projects (org_id, name, slug, description, tags, repo_keys, legacy_id, webhook_secret)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [orgId, name, slug, description || '', JSON.stringify(tags || []), JSON.stringify(repoKeys || []), legacyId || null, crypto.randomBytes(24).toString('hex')]
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
    `SELECT e.*, b.name AS blueprint_name
     FROM environments e
     LEFT JOIN environment_blueprints b ON b.id = e.blueprint_id
     WHERE e.project_id = $1 ORDER BY e.is_production DESC, e.name`,
    [projectId]
  );
  return rows;
}

export async function createEnvironment(projectId, { name, kind, isProduction, blueprintId }) {
  const { rows } = await query(
    `INSERT INTO environments (project_id, name, kind, is_production, blueprint_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [projectId, name, kind || 'custom', Boolean(isProduction), blueprintId || null]
  );
  return rows[0];
}

// --- Environment Blueprints ------------------------------------------
export async function listEnvironmentBlueprintsForOrg(orgId) {
  const { rows } = await query('SELECT * FROM environment_blueprints WHERE org_id = $1 ORDER BY name', [orgId]);
  return rows;
}

export async function getEnvironmentBlueprint(id) {
  const { rows } = await query('SELECT * FROM environment_blueprints WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function createEnvironmentBlueprint({ orgId, name, slug, kind, namespacePattern, replicas, cpu, memory, storageGb, ingressDomain, ttlMinutes, monitoringEnabled }) {
  const { rows } = await query(
    `INSERT INTO environment_blueprints (org_id, name, slug, kind, namespace_pattern, replicas, cpu, memory, storage_gb, ingress_domain, ttl_minutes, monitoring_enabled)
     VALUES ($1, $2, $3, COALESCE($4, 'custom'), COALESCE($5, ''), COALESCE($6, 1), COALESCE($7, ''), COALESCE($8, ''), $9, COALESCE($10, ''), $11, COALESCE($12, true))
     RETURNING *`,
    [orgId, name, slug, kind || null, namespacePattern || null, replicas ?? null, cpu || null, memory || null, storageGb ?? null, ingressDomain || null, ttlMinutes ?? null, monitoringEnabled ?? null]
  );
  return rows[0];
}

export async function updateEnvironmentBlueprint(id, { name, kind, namespacePattern, replicas, cpu, memory, storageGb, ingressDomain, ttlMinutes, monitoringEnabled }) {
  const sets = ['updated_at = now()'];
  const params = [];
  const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (name !== undefined) set('name', name);
  if (kind !== undefined) set('kind', kind);
  if (namespacePattern !== undefined) set('namespace_pattern', namespacePattern);
  if (replicas !== undefined) set('replicas', replicas);
  if (cpu !== undefined) set('cpu', cpu);
  if (memory !== undefined) set('memory', memory);
  if (storageGb !== undefined) set('storage_gb', storageGb);
  if (ingressDomain !== undefined) set('ingress_domain', ingressDomain);
  if (ttlMinutes !== undefined) set('ttl_minutes', ttlMinutes);
  if (monitoringEnabled !== undefined) set('monitoring_enabled', monitoringEnabled);
  params.push(id);
  const { rows } = await query(`UPDATE environment_blueprints SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return rows[0] || null;
}

export async function deleteEnvironmentBlueprint(id) {
  const { rowCount } = await query('DELETE FROM environment_blueprints WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function getEnvironment(id) {
  const { rows } = await query('SELECT * FROM environments WHERE id = $1', [id]);
  return rows[0] || null;
}

// Lie un environnement à une application Argo CD réelle existante — jamais
// une valeur inventée : c'est ce lien qui permet ensuite de lire un état de
// déploiement réel (revision/santé) et de déclencher de vraies promotions
// (voir services/environmentPromotionService.js).
export async function setEnvironmentArgocdApp(id, argocdApp) {
  const { rows } = await query(
    'UPDATE environments SET argocd_app = $2 WHERE id = $1 RETURNING *',
    [id, argocdApp || null]
  );
  return rows[0] || null;
}

export async function recordPromotion({ projectId, fromEnvironmentId, toEnvironmentId, argocdApp, revision, status, message, triggeredBy }) {
  const { rows } = await query(
    `INSERT INTO environment_promotions (project_id, from_environment_id, to_environment_id, argocd_app, revision, status, message, triggered_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [projectId, fromEnvironmentId || null, toEnvironmentId, argocdApp, revision || null, status, message || null, triggeredBy]
  );
  return rows[0];
}

export async function listPromotions(projectId, limit = 30) {
  const { rows } = await query(
    `SELECT p.*, fe.name AS from_environment_name, te.name AS to_environment_name
     FROM environment_promotions p
     LEFT JOIN environments fe ON fe.id = p.from_environment_id
     JOIN environments te ON te.id = p.to_environment_id
     WHERE p.project_id = $1 ORDER BY p.created_at DESC LIMIT $2`,
    [projectId, limit]
  );
  return rows;
}

// --- Équipes : regroupement d'utilisateurs distinct des projets (une
// équipe peut travailler sur plusieurs projets, un projet peut impliquer
// plusieurs équipes — contrairement à project_members qui reste la source
// de vérité pour l'accès effectif à un projet donné). Portée à
// l'organisation, comme les projets.

export async function listTeamsForOrg(orgId, userId) {
  // userId sert uniquement à exposer my_role (rôle de CET utilisateur dans
  // l'équipe, null s'il n'en est pas membre) — la liste elle-même n'est pas
  // filtrée par appartenance : voir teams.routes.js pour la vérification
  // d'accès (membre de l'organisation).
  const { rows } = await query(
    `SELECT t.*, tm.role AS my_role,
        (SELECT COUNT(*) FROM team_members tm2 WHERE tm2.team_id = t.id) AS member_count
     FROM teams t
     LEFT JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $2
     WHERE t.org_id = $1
     ORDER BY t.name`,
    [orgId, userId]
  );
  return rows;
}

export async function getTeam(id) {
  const { rows } = await query('SELECT * FROM teams WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function createTeam({ orgId, name, slug, ownerUserId }) {
  const client = await (await import('../db/pool.js')).requirePool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO teams (org_id, name, slug) VALUES ($1, $2, $3) RETURNING *',
      [orgId, name, slug]
    );
    const team = rows[0];
    if (ownerUserId) {
      await client.query(
        'INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)',
        [team.id, ownerUserId, 'lead']
      );
    }
    await client.query('COMMIT');
    return team;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listTeamMembers(teamId) {
  const { rows } = await query(
    'SELECT user_id, role, created_at FROM team_members WHERE team_id = $1 ORDER BY created_at',
    [teamId]
  );
  return rows;
}

export async function getTeamRole(teamId, userId) {
  const { rows } = await query('SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
  return rows[0]?.role || null;
}

export async function addTeamMember(teamId, userId, role = 'member') {
  const { rows } = await query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)
     ON CONFLICT (team_id, user_id) DO UPDATE SET role = excluded.role
     RETURNING *`,
    [teamId, userId, role]
  );
  return rows[0];
}

export async function removeTeamMember(teamId, userId) {
  await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
}

export async function deleteTeam(id) {
  const { rowCount } = await query('DELETE FROM teams WHERE id = $1', [id]);
  return rowCount > 0;
}

// --- Wiki d'équipe (voir db/migrations/0012_wiki.sql pour le pourquoi :
// contenu réellement stocké, contrairement au lien runbook des incidents).

export async function listWikiPages(orgId, projectId) {
  const { rows } = projectId
    ? await query('SELECT * FROM wiki_pages WHERE org_id = $1 AND project_id = $2 ORDER BY title', [orgId, projectId])
    : await query('SELECT * FROM wiki_pages WHERE org_id = $1 ORDER BY title', [orgId]);
  return rows;
}

export async function searchWikiPages(orgId, q) {
  const { rows } = await query(
    `SELECT * FROM wiki_pages WHERE org_id = $1 AND (title ILIKE $2 OR content ILIKE $2) ORDER BY title LIMIT 50`,
    [orgId, `%${q}%`]
  );
  return rows;
}

export async function getWikiPage(id) {
  const { rows } = await query('SELECT * FROM wiki_pages WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function createWikiPage({ orgId, projectId, slug, title, content, userId }) {
  const { rows } = await query(
    `INSERT INTO wiki_pages (org_id, project_id, slug, title, content, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
    [orgId, projectId || null, slug, title, content || '', userId]
  );
  return rows[0];
}

// Écrit l'état courant dans wiki_page_revisions avant de l'écraser, pour
// garder un historique complet (une révision = une version précédente).
export async function updateWikiPage(id, { title, content, userId }) {
  const client = await (await import('../db/pool.js')).requirePool().connect();
  try {
    await client.query('BEGIN');
    const { rows: current } = await client.query('SELECT * FROM wiki_pages WHERE id = $1 FOR UPDATE', [id]);
    if (!current[0]) { await client.query('ROLLBACK'); return null; }
    await client.query(
      'INSERT INTO wiki_page_revisions (page_id, title, content, edited_by) VALUES ($1, $2, $3, $4)',
      [id, current[0].title, current[0].content, userId]
    );
    const { rows } = await client.query(
      `UPDATE wiki_pages SET title = $2, content = $3, updated_by = $4, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, title, content, userId]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteWikiPage(id) {
  const { rowCount } = await query('DELETE FROM wiki_pages WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function listWikiRevisions(pageId) {
  const { rows } = await query(
    'SELECT id, title, edited_by, edited_at FROM wiki_page_revisions WHERE page_id = $1 ORDER BY edited_at DESC',
    [pageId]
  );
  return rows;
}

export async function getWikiRevision(id) {
  const { rows } = await query('SELECT * FROM wiki_page_revisions WHERE id = $1', [id]);
  return rows[0] || null;
}

// --- Software Catalog (components) ---------------------------------------
// Même portée de visibilité que listProjectsForUser : un composant est
// visible par quiconque a accès à son projet (membre direct ou owner/admin
// de l'organisation), jamais par tous les utilisateurs de la plateforme.
export async function listComponentsForUser(userId, { q, kind, lifecycle, ownerTeamId, projectId, mine } = {}) {
  const params = [userId];
  const conditions = ['(pm.user_id = $1 OR om.role IN (\'owner\', \'admin\'))'];
  if (q) { params.push(`%${q.toLowerCase()}%`); conditions.push(`(LOWER(c.name) LIKE $${params.length} OR LOWER(c.description) LIKE $${params.length})`); }
  if (kind) { params.push(kind); conditions.push(`c.kind = $${params.length}`); }
  if (lifecycle) { params.push(lifecycle); conditions.push(`c.lifecycle = $${params.length}`); }
  if (ownerTeamId) { params.push(ownerTeamId); conditions.push(`c.owner_team_id = $${params.length}`); }
  if (projectId) { params.push(projectId); conditions.push(`c.project_id = $${params.length}`); }
  // "Mes services" (ÉTAPE 25 IDP, Developer Portal) : ce dont CET
  // utilisateur est réellement responsable — son équipe en est propriétaire,
  // OU il est membre EXPLICITE du projet (pas seulement visible par bypass
  // owner/admin d'organisation, qui donne accès à tout sans en faire le
  // responsable). Distinct du filtre par projet/équipe ci-dessus : ceux-là
  // ciblent un projet/une équipe précis, celui-ci répond à "qu'est-ce qui
  // est à moi ?" quel que soit le projet.
  if (mine) {
    conditions.push(
      `(c.owner_team_id IN (SELECT team_id FROM team_members WHERE user_id = $1)
        OR EXISTS (SELECT 1 FROM project_members pm2 WHERE pm2.project_id = c.project_id AND pm2.user_id = $1))`
    );
  }
  const { rows } = await query(
    `SELECT DISTINCT c.*, p.name AS project_name, p.org_id AS org_id, t.name AS owner_team_name, t.slug AS owner_team_slug,
        (SELECT COUNT(*) FROM environments env WHERE env.project_id = c.project_id) AS project_environment_count
     FROM components c
     JOIN projects p ON p.id = c.project_id
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
     LEFT JOIN org_members om ON om.org_id = p.org_id AND om.user_id = $1
     LEFT JOIN teams t ON t.id = c.owner_team_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.name`,
    params
  );
  return rows;
}

export async function getComponent(id) {
  const { rows } = await query(
    `SELECT c.*, p.name AS project_name, p.org_id AS org_id, t.name AS owner_team_name, t.slug AS owner_team_slug,
        (SELECT COUNT(*) FROM environments env WHERE env.project_id = c.project_id) AS project_environment_count
     FROM components c
     JOIN projects p ON p.id = c.project_id
     LEFT JOIN teams t ON t.id = c.owner_team_id
     WHERE c.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Résolution utilisée par l'import service.yaml (services/serviceManifest.js) :
// spec.owner y référence une équipe par son slug (lisible, stable dans un
// fichier versionné), jamais par son UUID interne.
export async function getTeamBySlug(orgId, slug) {
  const { rows } = await query('SELECT * FROM teams WHERE org_id = $1 AND slug = $2', [orgId, slug]);
  return rows[0] || null;
}

// Upsert du même composant (même projet + même slug) : c'est ce qui permet
// à un import service.yaml répété (CI, ou nouveau collage manuel après
// modification du fichier) de mettre à jour la fiche existante plutôt que
// d'échouer sur la contrainte UNIQUE (project_id, slug) ou de créer un
// doublon.
export async function getComponentBySlug(projectId, slug) {
  const { rows } = await query('SELECT * FROM components WHERE project_id = $1 AND slug = $2', [projectId, slug]);
  return rows[0] || null;
}

export async function createComponent({ projectId, ownerTeamId, name, slug, kind, lifecycle, description, language, framework, repositoryProvider, repositoryUrl, tags, links }) {
  const { rows } = await query(
    `INSERT INTO components (project_id, owner_team_id, name, slug, kind, lifecycle, description, language, framework, repository_provider, repository_url, tags, links)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'service'), COALESCE($6, 'experimental'), COALESCE($7, ''), COALESCE($8, ''), COALESCE($9, ''), COALESCE($10, ''), COALESCE($11, ''), COALESCE($12::jsonb, '[]'::jsonb), COALESCE($13::jsonb, '[]'::jsonb))
     RETURNING *`,
    [projectId, ownerTeamId || null, name, slug, kind || null, lifecycle || null, description || null, language || null, framework || null,
      repositoryProvider || null, repositoryUrl || null, tags ? JSON.stringify(tags) : null, links ? JSON.stringify(links) : null]
  );
  return rows[0];
}

export async function updateComponent(id, { ownerTeamId, name, kind, lifecycle, description, language, framework, repositoryProvider, repositoryUrl, tags, links }) {
  const sets = ['updated_at = now()'];
  const params = [];
  const set = (col, val) => { params.push(val); sets.push(`${col} = $${params.length}`); };
  if (ownerTeamId !== undefined) set('owner_team_id', ownerTeamId || null);
  if (name !== undefined) set('name', name);
  if (kind !== undefined) set('kind', kind);
  if (lifecycle !== undefined) set('lifecycle', lifecycle);
  if (description !== undefined) set('description', description);
  if (language !== undefined) set('language', language);
  if (framework !== undefined) set('framework', framework);
  if (repositoryProvider !== undefined) set('repository_provider', repositoryProvider);
  if (repositoryUrl !== undefined) set('repository_url', repositoryUrl);
  if (tags !== undefined) set('tags', JSON.stringify(tags));
  if (links !== undefined) set('links', JSON.stringify(links));
  params.push(id);
  const { rows } = await query(`UPDATE components SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  return rows[0] || null;
}

export async function deleteComponent(id) {
  const { rowCount } = await query('DELETE FROM components WHERE id = $1', [id]);
  return rowCount > 0;
}
