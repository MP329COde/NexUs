import { test } from 'node:test';
import assert from 'node:assert/strict';

// hostsStore.js est passé sur Postgres (ÉTAPE 27 IDP) : provisioningService
// en dépend directement (startInstall crée un hôte à chaque appel), ce
// fichier a donc rejoint la convention *.postgres.test.js — ignoré
// proprement si DATABASE_URL n'est pas défini. Lancer avec DATABASE_URL,
// comme jobService.postgres.test.js.
const hasPostgres = Boolean(process.env.DATABASE_URL);

if (!hasPostgres) {
  test('provisioningService (Postgres) : ignoré — DATABASE_URL non défini', { skip: true }, () => {});
} else {
  const { runMigrations } = await import('../src/db/migrate.js');
  await runMigrations();
  const { startInstall, getJobs, _resetJobs } = await import('../src/services/provisioningService.js');
  const { query } = await import('../src/db/pool.js');

  test.beforeEach(() => _resetJobs());
  test.afterEach(async () => { await query("DELETE FROM hosts WHERE name LIKE 'Setup · %'"); });

  test('refuse une adresse manquante', async () => {
    await assert.rejects(() => startInstall({ toolId: 'grafana', address: '' }), /Adresse/);
  });

  test('refuse un outil hors catalogue', async () => {
    const job = await startInstall({ toolId: 'wazuh', address: '10.0.0.10' });
    assert.equal(job.status, 'error');
    assert.match(job.message, /indisponible/);
  });

  test('démarre un job puis passe à success quand le script SSH réussit', async () => {
    let resolveRun;
    const fakeRun = () => new Promise((resolve) => { resolveRun = resolve; });
    const job = await startInstall({ toolId: 'grafana', address: '10.0.0.20', sshUser: 'root' }, { run: fakeRun });

    assert.equal(job.status, 'installing');
    assert.equal(job.toolId, 'grafana');
    assert.ok(job.id);

    resolveRun({ ok: true, exitCode: 0, stdout: 'grafana installé et démarré', stderr: '' });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r)); // laisse la mise à jour Postgres asynchrone se terminer

    const [refreshed] = getJobs([job.id]);
    assert.equal(refreshed.status, 'success');
  });

  test('passe en erreur quand le script SSH échoue', async () => {
    const fakeRun = () => Promise.resolve({ ok: false, exitCode: 1, stdout: '', stderr: 'boom' });
    const job = await startInstall({ toolId: 'prometheus', address: '10.0.0.30' }, { run: fakeRun });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const [refreshed] = getJobs([job.id]);
    assert.equal(refreshed.status, 'error');
    assert.match(refreshed.message, /Échec/);
  });

  test('passe en erreur quand la connexion SSH lève une exception', async () => {
    const fakeRun = () => Promise.reject(new Error('Connexion SSH impossible vers 10.0.0.40'));
    const job = await startInstall({ toolId: 'loki', address: '10.0.0.40' }, { run: fakeRun });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const [refreshed] = getJobs([job.id]);
    assert.equal(refreshed.status, 'error');
    assert.match(refreshed.message, /Connexion SSH impossible/);
  });

  test('getJobs sans filtre renvoie tous les jobs connus', async () => {
    const fakeRun = () => new Promise(() => {});
    await startInstall({ toolId: 'grafana', address: '10.0.0.50' }, { run: fakeRun });
    await startInstall({ toolId: 'prometheus', address: '10.0.0.51' }, { run: fakeRun });
    assert.equal(getJobs().length, 2);
  });

  // Vraie couverture de l'intégration Postgres (ÉTAPE 27 IDP) : hostsStore
  // lui-même — CRUD complet, jamais testé directement avant la migration.
  test('hostsStore : CRUD complet contre Postgres', async () => {
    const hostsStore = await import('../src/store/hostsStore.js');
    const host = await hostsStore.createHost({ name: 'test-host', address: '10.0.0.99', port: 2222, sshUser: 'deploy', role: 'db', critical: true });
    assert.equal(host.port, 2222);
    assert.equal(host.critical, true);

    const fetched = await hostsStore.getHost(host.id);
    assert.equal(fetched.address, '10.0.0.99');

    const updated = await hostsStore.updateHost(host.id, { role: 'cache' });
    assert.equal(updated.role, 'cache');
    assert.equal(updated.address, '10.0.0.99'); // champs non fournis conservés

    const withInstall = await hostsStore.recordInstallResult(host.id, { agentId: 'grafana', ok: true, message: 'ok' });
    assert.equal(withInstall.lastInstall.agentId, 'grafana');
    assert.ok(withInstall.lastInstall.at);

    const deleted = await hostsStore.deleteHost(host.id);
    assert.equal(deleted, true);
    assert.equal(await hostsStore.getHost(host.id), undefined);
  });
}
