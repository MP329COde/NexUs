import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-projectaccess-'));
// Pas de DATABASE_URL dans cette suite : resolveProjectRole() retombe donc
// systématiquement sur le modèle legacy (memberIds plat) — la branche
// Postgres (rôle granulaire réel) est vérifiée manuellement avec un
// conteneur Postgres local, voir le message du commit associé.

const { resolveProjectRole } = await import('../src/middleware/projectAccess.js');

const project = { id: 'proj-1', memberIds: ['user-1'] };

test('resolveProjectRole : un administrateur de plateforme est toujours owner', async () => {
  const role = await resolveProjectRole(project, { id: 'someone-else', role: 'admin' });
  assert.equal(role, 'owner');
});

test('resolveProjectRole : un membre (modèle legacy) reçoit maintainer (accès complet historique)', async () => {
  const role = await resolveProjectRole(project, { id: 'user-1', role: 'user' });
  assert.equal(role, 'maintainer');
});

test('resolveProjectRole : un non-membre ne reçoit aucun rôle', async () => {
  const role = await resolveProjectRole(project, { id: 'stranger', role: 'user' });
  assert.equal(role, null);
});

test('resolveProjectRole : projet inexistant (null) ne reçoit aucun rôle', async () => {
  const role = await resolveProjectRole(null, { id: 'user-1', role: 'user' });
  assert.equal(role, null);
});
