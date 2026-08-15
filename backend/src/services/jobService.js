import { query, pool } from '../db/pool.js';
import { logger } from '../utils/logger.js';

// Exécution asynchrone en tâche de fond, dans le même process (pas de worker
// séparé ni de file de messages externe — inutile à l'échelle d'un homelab,
// et ça évite une dépendance Redis/RabbitMQ supplémentaire). Le job est
// persisté en base AVANT de démarrer le travail réel : un client peut
// immédiatement recevoir son id (202) et suivre la progression en
// interrogeant GET /projects/:id/jobs/:jobId, y compris si le travail met
// plusieurs secondes (synchronisation GitOps, rollback...).
//
// run(job) doit renvoyer une valeur sérialisable (stockée dans `result`) ou
// lever une erreur (stockée dans `error`, job marqué 'failed'). Ne renvoie
// jamais le job final ici : l'appelant a déjà répondu au client avant que
// run() ne se termine — utiliser listJobs/getJob pour suivre l'état.
//
// idempotencyKey (optionnelle) : si un job ACTIF (pending/running) porte
// déjà cette clé, il est renvoyé tel quel au lieu d'en créer un second —
// un double-clic ou un retry réseau côté client ne déclenche jamais deux
// fois la même opération réelle. Une fois le job terminé (succeeded/failed),
// la clé redevient libre : un retry explicite après échec (voir
// routes/projects.routes.js POST /:id/jobs/:jobId/retry) peut réutiliser la
// même clé (`retry:<jobId original>`) pour rester idempotent lui aussi.
//
// retryOf (optionnelle) : id du job d'origine dont celui-ci est la
// relance — pure traçabilité (`retry_of`), n'affecte pas l'exécution.
export async function enqueue({ type, projectId, userId, payload = {}, idempotencyKey = null, retryOf = null }, run) {
  if (idempotencyKey) {
    const { rows: existing } = await query(
      `SELECT * FROM jobs WHERE idempotency_key = $1 AND status IN ('pending', 'running')`,
      [idempotencyKey]
    );
    if (existing[0]) return existing[0];
  }
  let job;
  try {
    const { rows } = await query(
      `INSERT INTO jobs (type, project_id, created_by, payload, idempotency_key, retry_of) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [type, projectId, userId, JSON.stringify(payload), idempotencyKey, retryOf]
    );
    job = rows[0];
  } catch (err) {
    // Requête concurrente arrivée entre le SELECT et l'INSERT ci-dessus
    // (fenêtre de course) : l'index unique partiel a tranché à notre place,
    // on récupère le job gagnant plutôt que de faire échouer la requête.
    if (err.code === '23505' && idempotencyKey) {
      const { rows: winner } = await query(
        `SELECT * FROM jobs WHERE idempotency_key = $1 AND status IN ('pending', 'running')`,
        [idempotencyKey]
      );
      if (winner[0]) return winner[0];
    }
    throw err;
  }

  // Volontairement non "awaité" par l'appelant : la promesse continue en
  // arrière-plan pendant que la réponse HTTP 202 part déjà. Toute erreur non
  // interceptée par run() elle-même est capturée ici pour ne jamais planter
  // le process avec une rejection non gérée.
  (async () => {
    await query(`UPDATE jobs SET status = 'running', started_at = now() WHERE id = $1`, [job.id]);
    try {
      const result = await run(job);
      await query(
        `UPDATE jobs SET status = 'succeeded', result = $2, finished_at = now() WHERE id = $1`,
        [job.id, JSON.stringify(result ?? null)]
      );
    } catch (err) {
      logger.error({ err, jobId: job.id, type }, 'Échec de job asynchrone');
      await query(
        `UPDATE jobs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`,
        [job.id, err.message || 'Erreur inconnue']
      );
    }
  })();

  return job;
}

export async function getJob(id) {
  const { rows } = await query('SELECT * FROM jobs WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function listJobsForProject(projectId, limit = 50) {
  const { rows } = await query(
    'SELECT * FROM jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2',
    [projectId, limit]
  );
  return rows;
}

// Vue globale (tous projets confondus) réservée aux administrateurs — voir
// routes/jobs.routes.js GET /. Permet de répondre à "qu'est-ce qui est en
// cours / a échoué sur toute la plateforme en ce moment", explicitement
// demandé pour le tableau de bord d'un responsable système.
export async function listRecentJobs({ status, limit = 100 } = {}) {
  if (status) {
    const { rows } = await query(
      'SELECT * FROM jobs WHERE status = $1 ORDER BY created_at DESC LIMIT $2',
      [status, limit]
    );
    return rows;
  }
  const { rows } = await query('SELECT * FROM jobs ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows;
}

// Un job resté 'running' au démarrage du process ne peut être que le
// résidu d'un redémarrage/crash pendant son exécution (ce process est le
// seul à en écrire le statut) : on ne prétend jamais le reprendre
// silencieusement — il est marqué en échec explicite, consultable, plutôt
// que de rester bloqué indéfiniment en 'running' aux yeux de l'utilisateur.
export async function recoverInterruptedJobs() {
  if (!pool) return;
  const { rowCount } = await query(
    `UPDATE jobs SET status = 'failed', error = 'Interrompu par un redémarrage du backend', finished_at = now()
     WHERE status IN ('pending', 'running')`
  );
  if (rowCount > 0) logger.warn(`${rowCount} job(s) marqué(s) en échec après redémarrage (étaient en cours).`);
}
