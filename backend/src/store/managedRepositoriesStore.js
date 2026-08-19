import { query } from '../db/pool.js';

// Repository provisioning (Lot 54) : CRUD pur sur la table
// `managed_repositories` (0042_managed_repositories.sql). Aucune fonction
// ici n'appelle GitHub/GitLab/Gitea réellement — c'est délibéré, voir le
// commentaire d'en-tête de la migration : le point d'entrée `provision()`
// qui appellerait `githubPlatformService` avec des credentials de
// plateforme réels n'est pas implémenté (non testable dans cet
// environnement, cf. todo.md / todo-lot54.md).

// Deux templates de départ réalistes (métadonnées seulement — pas de
// génération de fichiers). D'autres pourront être ajoutés (Python API,
// Worker, Library, Docusaurus, Storybook...) une fois le provisioning réel
// branché (Étape 20 du plan, chantiers #41/#42/#43).
export const REPOSITORY_TEMPLATES = [
  {
    key: 'react-app',
    name: 'Application React',
    description: 'SPA React + Vite, ESLint/Prettier, tests Vitest, CI lint/test/build préconfigurée.',
    stack: ['react', 'vite', 'vitest', 'eslint']
  },
  {
    key: 'node-api',
    name: 'API Node (Express)',
    description: 'Service HTTP Express + migrations SQL, tests Jest/Vitest, CI lint/test/build préconfigurée.',
    stack: ['node', 'express', 'postgres']
  }
];

export function listTemplates() {
  return REPOSITORY_TEMPLATES;
}

export function getTemplate(key) {
  return REPOSITORY_TEMPLATES.find((t) => t.key === key) || null;
}

export async function listManagedRepositories({ orgId, projectId, teamId, status } = {}) {
  const clauses = [];
  const params = [];
  if (orgId) { params.push(orgId); clauses.push(`org_id = $${params.length}`); }
  if (projectId) { params.push(projectId); clauses.push(`project_id = $${params.length}`); }
  if (teamId) { params.push(teamId); clauses.push(`team_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM managed_repositories ${where} ORDER BY created_at DESC`,
    params
  );
  return rows;
}

export async function getManagedRepository(id) {
  const { rows } = await query('SELECT * FROM managed_repositories WHERE id = $1', [id]);
  return rows[0] || null;
}

// Crée une DEMANDE de provisioning, toujours au statut 'pending' — jamais
// un statut inventé comme "success" par défaut : rien n'a réellement été
// créé chez le fournisseur externe à ce stade.
export async function createProvisioningRequest({
  provider = 'github', owner, name, orgId, projectId, teamId, componentId, templateKey, requestedBy
}) {
  const { rows } = await query(
    `INSERT INTO managed_repositories
       (provider, owner, name, org_id, project_id, team_id, component_id, template_key, status, requested_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
     RETURNING *`,
    [provider, owner, name, orgId || null, projectId || null, teamId || null, componentId || null, templateKey, requestedBy]
  );
  return rows[0];
}

// Permet de refléter l'échec/succès d'un provisioning une fois qu'il sera
// réellement déclenché (fonction non encore appelée par aucune route :
// aucune route n'affirme aujourd'hui qu'un provisioning a réussi).
export async function updateProvisioningStatus(id, { status, statusDetail, webUrl }) {
  const { rows } = await query(
    `UPDATE managed_repositories
     SET status = $2, status_detail = COALESCE($3, status_detail), web_url = COALESCE($4, web_url), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, status, statusDetail || null, webUrl || null]
  );
  return rows[0] || null;
}

export async function deleteManagedRepository(id) {
  const { rowCount } = await query('DELETE FROM managed_repositories WHERE id = $1', [id]);
  return rowCount > 0;
}
