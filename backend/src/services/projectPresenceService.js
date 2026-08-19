import { pool, query } from '../db/pool.js';

// Présence temps quasi-réel par projet — voir 0038_project_presence.sql.
// PRÉSENT = vu dans la dernière fenêtre (60s) : pas de vraie connexion
// WebSocket (aucune infrastructure de ce type dans ce projet), mais un
// ping périodique côté client (voir ProjectPresenceBar.jsx, pollMs) donne
// une vue "à jour à la minute près", cohérente avec le reste de l'app
// (polling partout ailleurs — jobs, status, notifications).
const PRESENCE_WINDOW_SECONDS = 60;

export async function ping(projectId, userId) {
  if (!pool) return;
  await query(
    `INSERT INTO project_presence (project_id, user_id, last_seen_at) VALUES ($1, $2, now())
     ON CONFLICT (project_id, user_id) DO UPDATE SET last_seen_at = now()`,
    [projectId, userId]
  );
}

export async function listPresence(projectId) {
  if (!pool) return [];
  const { rows } = await query(
    `SELECT user_id, last_seen_at FROM project_presence
     WHERE project_id = $1 AND last_seen_at > now() - interval '${PRESENCE_WINDOW_SECONDS} seconds'
     ORDER BY last_seen_at DESC`,
    [projectId]
  );
  return rows;
}
