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
// Annulation coopérative (voir migration 0020_job_cancel.sql) : un job en
// cours ne peut pas être tué à mi-exécution (pas de worker séparé à
// interrompre), mais run() peut vérifier isCancelled() entre deux étapes
// pour s'arrêter de lui-même — voir scaffolderService.js. La map ne vit que
// pour la durée du process : après un redémarrage, recoverInterruptedJobs()
// marque déjà tout job resté 'running' en échec, donc rien à annuler.
const cancellationFlags = new Map();

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
  const flag = { cancelled: false };
  cancellationFlags.set(job.id, flag);

  (async () => {
    await query(`UPDATE jobs SET status = 'running', started_at = now() WHERE id = $1`, [job.id]);
    try {
      const result = await run(job, { isCancelled: () => flag.cancelled });
      // Ne cible que 'running' : si cancelJob() a déjà écrit 'cancelled'
      // pendant que run() terminait son travail, cette annulation gagne —
      // le résultat obtenu après coup n'est pas affiché comme un succès.
      await query(
        `UPDATE jobs SET status = 'succeeded', result = $2, finished_at = now() WHERE id = $1 AND status = 'running'`,
        [job.id, JSON.stringify(result ?? null)]
      );
    } catch (err) {
      logger.error({ err, jobId: job.id, type }, 'Échec de job asynchrone');
      await query(
        `UPDATE jobs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1 AND status = 'running'`,
        [job.id, err.message || 'Erreur inconnue']
      );
    } finally {
      cancellationFlags.delete(job.id);
    }
  })();

  return job;
}

// Demande d'annulation d'un job 'pending' ou 'running'. Coopérative : si le
// job tourne déjà dans ce process, le flag est levé pour que run() puisse
// s'arrêter à la prochaine étape qu'il vérifie ; dans tous les cas, l'état
// en base passe immédiatement à 'cancelled' pour que le client cesse
// d'afficher le job comme actif, quelle que soit la rapidité de run() à
// réagir. Renvoie null si le job n'existe pas ou n'est plus annulable.
export async function cancelJob(id) {
  const flag = cancellationFlags.get(id);
  if (flag) flag.cancelled = true;
  const { rows } = await query(
    `UPDATE jobs SET status = 'cancelled', error = 'Annulé', finished_at = now()
     WHERE id = $1 AND status IN ('pending', 'running') RETURNING *`,
    [id]
  );
  return rows[0] || null;
}

export async function getJob(id) {
  const { rows } = await query('SELECT * FROM jobs WHERE id = $1', [id]);
  return rows[0] || null;
}

// Progression en direct pour un job à plusieurs étapes (voir
// services/scaffolderService.js) : append d'une entrée { step, status,
// detail, at } dans payload.steps, consultable par un client qui interroge
// GET /projects/:id/jobs/:jobId pendant que run() s'exécute encore — sans
// ce mécanisme, un job de plusieurs secondes (création de dépôt distant,
// plusieurs commits) resterait une boîte noire jusqu'à sa fin.
export async function appendJobStep(jobId, step, status, detail) {
  await query(
    `UPDATE jobs SET payload = jsonb_set(
       payload, '{steps}',
       COALESCE(payload->'steps', '[]'::jsonb) || $2::jsonb
     ) WHERE id = $1`,
    [jobId, JSON.stringify([{ step, status, detail: detail ?? null, at: new Date().toISOString() }])]
  );
}

export async function listJobsForProject(projectId, limit = 50) {
  const { rows } = await query(
    'SELECT * FROM jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2',
    [projectId, limit]
  );
  return rows;
}

// Vue tous projets confondus — voir routes/jobs.routes.js GET /. Sans
// ownerId (admin), répond à "qu'est-ce qui est en cours / a échoué sur
// toute la plateforme en ce moment", explicitement demandé pour le tableau
// de bord d'un responsable système. Avec ownerId (non-admin), la liste est
// restreinte aux jobs sans projet créés par cet utilisateur — même portée
// que celle déjà appliquée par GET /:id (voir jobs.routes.js), pour ne pas
// laisser un utilisateur lister ce qu'il ne pourrait pas consulter par id.
export async function listRecentJobs({ status, limit = 100, ownerId } = {}) {
  const conditions = [];
  const params = [];
  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (ownerId) {
    params.push(ownerId);
    conditions.push(`created_by = $${params.length}`);
    conditions.push('project_id IS NULL');
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  const { rows } = await query(
    `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
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
