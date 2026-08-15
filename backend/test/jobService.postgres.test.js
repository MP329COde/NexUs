import { test } from 'node:test';
import assert from 'node:assert/strict';

// Contrairement à jobService.test.js (sans DATABASE_URL, vérifie que tout
// rejette explicitement), ce fichier exerce le comportement RÉEL de
// enqueue() sous Postgres — idempotence, retry, reprise après crash —
// impossible à couvrir sans une vraie base. Ignoré proprement (test.skip,
// jamais un échec) si DATABASE_URL n'est pas défini : `npm test` reste
// rapide et sans dépendance par défaut.
//
// Lancer CE FICHIER SEUL avec une base jetable pour activer la suite :
//   docker run --rm -d -p 5433:5432 -e POSTGRES_PASSWORD=x -e POSTGRES_DB=nexus postgres:16-alpine
//   DATABASE_URL=postgres://postgres:x@localhost:5433/nexus node --test test/jobService.postgres.test.js
// Ne PAS lancer `DATABASE_URL=... npm test` (suite complète) : plusieurs
// tests pré-existants (jobService.test.js, backupService.test.js)
// vérifient au contraire le comportement SANS Postgres configuré et
// échoueraient légitimement si une base est présente — les deux modes
// sont mutuellement exclusifs par conception, pas un bug de l'un ou l'autre.
const hasPostgres = Boolean(process.env.DATABASE_URL);

if (!hasPostgres) {
  test('jobService (Postgres) : ignoré — DATABASE_URL non défini', { skip: true }, () => {});
} else {
  const { runMigrations } = await import('../src/db/migrate.js');
  const { query } = await import('../src/db/pool.js');
  const jobService = await import('../src/services/jobService.js');

  await runMigrations();

  // Pas de pool.end() ici : enqueue() lance son run() en tâche de fond sans
  // l'attendre (par conception, voir jobService.js), donc une exécution du
  // dernier test peut encore être en vol quand la suite se termine — fermer
  // le pool provoquerait une rejection non gérée sur cette activité
  // asynchrone résiduelle. Le process de test se termine de toute façon.
  test.afterEach(async () => {
    await query("DELETE FROM jobs WHERE type LIKE 'test.%'");
  });

  test('enqueue avec idempotencyKey : deux appels concurrents renvoient le même job', async () => {
    const [a, b] = await Promise.all([
      jobService.enqueue({ type: 'test.dedup', projectId: null, userId: 'u1', idempotencyKey: 'test-key-1' }, async () => { await new Promise((r) => setTimeout(r, 30)); return 'ok'; }),
      jobService.enqueue({ type: 'test.dedup', projectId: null, userId: 'u1', idempotencyKey: 'test-key-1' }, async () => { await new Promise((r) => setTimeout(r, 30)); return 'ok'; })
    ]);
    assert.equal(a.id, b.id);
    const { rows } = await query("SELECT count(*)::int AS n FROM jobs WHERE idempotency_key = 'test-key-1'");
    assert.equal(rows[0].n, 1);
  });

  test('enqueue sans idempotencyKey : deux appels créent bien deux jobs distincts', async () => {
    const a = await jobService.enqueue({ type: 'test.nodedup', projectId: null, userId: 'u1' }, async () => 'ok');
    const b = await jobService.enqueue({ type: 'test.nodedup', projectId: null, userId: 'u1' }, async () => 'ok');
    assert.notEqual(a.id, b.id);
  });

  test('enqueue avec idempotencyKey déjà utilisée par un job TERMINÉ : la clé redevient libre, nouveau job créé', async () => {
    // Job d'origine inséré directement en état 'failed' (pas via enqueue()) :
    // évite toute dépendance au timing de l'exécution en tâche de fond, qui
    // s'est révélée sensible aux autres suites de tests tournant en parallèle
    // sur la même base (ex. recoverInterruptedJobs() d'un autre fichier peut
    // intercepter un job encore 'running').
    const { rows } = await query(
      `INSERT INTO jobs (type, status, created_by, idempotency_key) VALUES ('test.retry', 'failed', 'u1', 'test-key-2') RETURNING *`
    );
    const first = rows[0];

    const second = await jobService.enqueue({ type: 'test.retry', projectId: null, userId: 'u1', idempotencyKey: 'test-key-2', retryOf: first.id }, async () => 'ok');
    assert.notEqual(second.id, first.id);
    assert.equal(second.retry_of, first.id);
  });

  test('recoverInterruptedJobs marque les jobs pending/running en échec, laisse les succeeded intacts', async () => {
    await query("INSERT INTO jobs (type, status, created_by) VALUES ('test.recover', 'running', 'u1')");
    await query("INSERT INTO jobs (type, status, created_by, result) VALUES ('test.recover', 'succeeded', 'u1', '\"ok\"')");
    await jobService.recoverInterruptedJobs();
    const { rows } = await query("SELECT status FROM jobs WHERE type = 'test.recover' ORDER BY status");
    assert.deepEqual(rows.map((r) => r.status).sort(), ['failed', 'succeeded']);
  });
}
