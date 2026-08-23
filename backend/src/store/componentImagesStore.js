import { query } from '../db/pool.js';

// CRUD sur component_images (migration 0045) — voir routes/catalog.routes.js
// pour les vérifications de rôle (même politique que le composant parent).

export async function listForComponent(componentId) {
  const { rows } = await query(
    'SELECT * FROM component_images WHERE component_id = $1 ORDER BY created_at DESC',
    [componentId]
  );
  return rows;
}

export async function createImage(componentId, { repository, tag = 'latest', digest, pipelineProvider = '', pipelineUrl = '', createdBy }) {
  const { rows } = await query(
    `INSERT INTO component_images (component_id, repository, tag, digest, pipeline_provider, pipeline_url, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (component_id, repository, tag) DO UPDATE
       SET digest = EXCLUDED.digest, pipeline_provider = EXCLUDED.pipeline_provider, pipeline_url = EXCLUDED.pipeline_url, created_at = now()
     RETURNING *`,
    [componentId, repository, tag, digest || null, pipelineProvider, pipelineUrl, createdBy || null]
  );
  return rows[0];
}

export async function getImage(componentId, imageId) {
  const { rows } = await query('SELECT * FROM component_images WHERE id = $1 AND component_id = $2', [imageId, componentId]);
  return rows[0] || null;
}

export async function deleteImage(componentId, imageId) {
  const { rowCount } = await query('DELETE FROM component_images WHERE id = $1 AND component_id = $2', [imageId, componentId]);
  return rowCount > 0;
}
