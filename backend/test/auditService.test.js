import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-audit-'));

const { logAudit, listAuditEntries } = await import('../src/services/auditService.js');

test('logAudit enregistre une entrée avec acteur et méta', () => {
  logAudit({ user: { id: 'u1', email: 'admin@test.local' }, ip: '127.0.0.1' }, 'proxy.create', { proxyId: 'p1' });
  const entries = listAuditEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].actorEmail, 'admin@test.local');
  assert.equal(entries[0].action, 'proxy.create');
  assert.equal(entries[0].meta.proxyId, 'p1');
});

test('logAudit ne plante jamais, même sans req.user (acteur anonyme)', () => {
  assert.doesNotThrow(() => logAudit({}, 'auth.login.failed', {}));
  const entries = listAuditEntries();
  assert.equal(entries[0].actorEmail, null);
});

test('les entrées les plus récentes arrivent en premier', () => {
  logAudit({ user: { email: 'a@test.local' } }, 'action.un', {});
  logAudit({ user: { email: 'b@test.local' } }, 'action.deux', {});
  const entries = listAuditEntries();
  assert.equal(entries[0].action, 'action.deux');
  assert.equal(entries[1].action, 'action.un');
});

test('listAuditEntries respecte la limite demandée', () => {
  for (let i = 0; i < 10; i++) logAudit({ user: { email: 'x@test.local' } }, `bulk.${i}`, {});
  assert.equal(listAuditEntries({ limit: 3 }).length, 3);
});
