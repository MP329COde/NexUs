import { query } from '../db/pool.js';

// Commentaires génériques (table entity_comments, migration 0041) — pas de
// RBAC ici, voir routes/projects.routes.js et routes/wiki.routes.js pour les
// vérifications de rôle/portée, cohérent avec store/incidentStore.js.

export async function addComment(entityType, entityId, authorId, body) {
  const { rows } = await query(
    'INSERT INTO entity_comments (entity_type, entity_id, author_id, body) VALUES ($1, $2, $3, $4) RETURNING *',
    [entityType, entityId, authorId, body]
  );
  return rows[0];
}

export async function listComments(entityType, entityId) {
  const { rows } = await query(
    'SELECT * FROM entity_comments WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at',
    [entityType, entityId]
  );
  return rows;
}
