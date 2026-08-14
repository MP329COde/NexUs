import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-deployments-'));

const { createLink, updateLink, getLink } = await import('../src/store/deploymentStore.js');

// projectId/environmentId doivent être conservés à la création : c'est ce
// qui permet aux routes scopées (routes/projects.routes.js
// /:id/deployments/:linkId/sync|rollback) de vérifier l'appartenance au
// projet avant d'autoriser une action Argo CD — un oubli silencieux ici
// rouvrirait la faille (n'importe qui agit sur n'importe quel déploiement).
test('createLink conserve projectId et environmentId', () => {
  const link = createLink({ name: 'App', argocdAppName: 'app', projectId: 'proj-1', environmentId: 'env-1' });
  assert.equal(link.projectId, 'proj-1');
  assert.equal(link.environmentId, 'env-1');
});

test('createLink sans projectId/environmentId les laisse null (déploiement non rattaché, legacy)', () => {
  const link = createLink({ name: 'App orpheline', argocdAppName: 'app2' });
  assert.equal(link.projectId, null);
  assert.equal(link.environmentId, null);
});

test('updateLink peut rattacher a posteriori un déploiement existant à un projet', () => {
  const link = createLink({ name: 'App', argocdAppName: 'app3' });
  const updated = updateLink(link.id, { projectId: 'proj-2', environmentId: 'env-2' });
  assert.equal(updated.projectId, 'proj-2');
  assert.equal(getLink(link.id).environmentId, 'env-2');
});
