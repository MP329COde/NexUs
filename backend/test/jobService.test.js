import { test } from 'node:test';
import assert from 'node:assert/strict';

// Sans DATABASE_URL, query()/requirePool() lèvent une erreur explicite
// (503) plutôt que d'échouer silencieusement ou de planter le process —
// c'est ce que enqueue() doit laisser remonter tel quel à l'appelant HTTP
// (voir db/pool.js#requirePool, déjà utilisé partout ailleurs pour ce cas).
const { enqueue, getJob, listJobsForProject, recoverInterruptedJobs } = await import('../src/services/jobService.js');

test('enqueue sans DATABASE_URL rejette explicitement (pas de crash silencieux)', async () => {
  await assert.rejects(
    () => enqueue({ type: 'test.job', projectId: null, userId: 'u1' }, async () => 'ok'),
    /DATABASE_URL/
  );
});

test('getJob/listJobsForProject sans DATABASE_URL rejettent explicitement', async () => {
  await assert.rejects(() => getJob('some-id'), /DATABASE_URL/);
  await assert.rejects(() => listJobsForProject('some-project'), /DATABASE_URL/);
});

test('recoverInterruptedJobs sans DATABASE_URL ne fait rien (pas d\'erreur) : appelé sans condition au démarrage', async () => {
  await assert.doesNotReject(() => recoverInterruptedJobs());
});
