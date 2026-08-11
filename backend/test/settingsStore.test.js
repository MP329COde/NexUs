import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-settings-'));

const { saveIntegration, getRedactedIntegration, getRawIntegration, getAllRedacted } = await import('../src/store/settingsStore.js');

test('un secret enregistré ne réapparaît jamais en clair côté redacted', () => {
  saveIntegration('kubernetes', { apiServer: 'https://10.0.0.1:6443', token: 'super-secret-token' });
  const redacted = getRedactedIntegration('kubernetes');
  assert.equal(redacted.token, undefined);
  assert.equal(redacted.tokenSet, true);
  assert.equal(JSON.stringify(redacted).includes('super-secret-token'), false);
});

test('le secret reste lisible côté raw (utilisé uniquement côté serveur pour appeler les API)', () => {
  const raw = getRawIntegration('kubernetes');
  assert.equal(raw.token, 'super-secret-token');
});

test('un payload sans secret conserve le secret déjà enregistré (ne l\'écrase pas avec vide)', () => {
  saveIntegration('kubernetes', { apiServer: 'https://10.0.0.2:6443' });
  const raw = getRawIntegration('kubernetes');
  assert.equal(raw.token, 'super-secret-token');
  assert.equal(raw.apiServer, 'https://10.0.0.2:6443');
});

test('getAllRedacted ne fuit aucun secret, toutes intégrations confondues', () => {
  saveIntegration('grafana', { baseUrl: 'https://grafana.local', apiKey: 'gf-secret-key' });
  saveIntegration('wazuh', { baseUrl: 'https://wazuh.local', username: 'admin', password: 'wazuh-secret' });
  const all = getAllRedacted();
  const serialized = JSON.stringify(all);
  assert.equal(serialized.includes('gf-secret-key'), false);
  assert.equal(serialized.includes('wazuh-secret'), false);
  assert.equal(serialized.includes('super-secret-token'), false);
});

test('une intégration inconnue est rejetée', () => {
  assert.throws(() => saveIntegration('inconnue', {}), /Intégration inconnue/);
});
