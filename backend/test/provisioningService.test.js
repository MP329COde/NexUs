import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-provisioning-'));

await import('../src/store/jsonStore.js');
const { startInstall, getJobs, _resetJobs } = await import('../src/services/provisioningService.js');

test.beforeEach(() => _resetJobs());

test('refuse une adresse manquante', () => {
  assert.throws(() => startInstall({ toolId: 'grafana', address: '' }), /Adresse/);
});

test('refuse un outil hors catalogue', () => {
  const job = startInstall({ toolId: 'wazuh', address: '10.0.0.10' });
  assert.equal(job.status, 'error');
  assert.match(job.message, /indisponible/);
});

test('démarre un job puis passe à success quand le script SSH réussit', async () => {
  let resolveRun;
  const fakeRun = () => new Promise((resolve) => { resolveRun = resolve; });
  const job = startInstall({ toolId: 'grafana', address: '10.0.0.20', sshUser: 'root' }, { run: fakeRun });

  assert.equal(job.status, 'installing');
  assert.equal(job.toolId, 'grafana');
  assert.ok(job.id);

  resolveRun({ ok: true, exitCode: 0, stdout: 'grafana installé et démarré', stderr: '' });
  await new Promise((r) => setImmediate(r));

  const [refreshed] = getJobs([job.id]);
  assert.equal(refreshed.status, 'success');
});

test('passe en erreur quand le script SSH échoue', async () => {
  const fakeRun = () => Promise.resolve({ ok: false, exitCode: 1, stdout: '', stderr: 'boom' });
  const job = startInstall({ toolId: 'prometheus', address: '10.0.0.30' }, { run: fakeRun });
  await new Promise((r) => setImmediate(r));

  const [refreshed] = getJobs([job.id]);
  assert.equal(refreshed.status, 'error');
  assert.match(refreshed.message, /Échec/);
});

test('passe en erreur quand la connexion SSH lève une exception', async () => {
  const fakeRun = () => Promise.reject(new Error('Connexion SSH impossible vers 10.0.0.40'));
  const job = startInstall({ toolId: 'loki', address: '10.0.0.40' }, { run: fakeRun });
  await new Promise((r) => setImmediate(r));

  const [refreshed] = getJobs([job.id]);
  assert.equal(refreshed.status, 'error');
  assert.match(refreshed.message, /Connexion SSH impossible/);
});

test('getJobs sans filtre renvoie tous les jobs connus', () => {
  const fakeRun = () => new Promise(() => {});
  startInstall({ toolId: 'grafana', address: '10.0.0.50' }, { run: fakeRun });
  startInstall({ toolId: 'prometheus', address: '10.0.0.51' }, { run: fakeRun });
  assert.equal(getJobs().length, 2);
});
