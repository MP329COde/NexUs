import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-users-'));

const { createUser, setUserAdminFields, deleteUser, countAdmins, findUserByEmail } = await import('../src/store/usersStore.js');

test('createUser: rôle par défaut = user', () => {
  const u = createUser({ email: 'membre@test.local', password: 'motdepasse123' });
  assert.equal(u.role, 'user');
  assert.equal(u.active, true);
  assert.notEqual(u.passwordHash, 'motdepasse123'); // jamais en clair
});

test('createUser: refuse un e-mail déjà utilisé', () => {
  createUser({ email: 'dup@test.local', password: 'motdepasse123' });
  assert.throws(() => createUser({ email: 'dup@test.local', password: 'autremdp123' }), /existe déjà/);
});

test('impossible de retirer le dernier administrateur (rétrogradation)', () => {
  const admin = createUser({ email: 'seul-admin@test.local', password: 'motdepasse123', role: 'admin' });
  assert.equal(countAdmins(), 1);
  assert.throws(() => setUserAdminFields(admin.id, { role: 'user' }), /dernier compte administrateur/);
});

test('impossible de désactiver le dernier administrateur', () => {
  const admin = findUserByEmail('seul-admin@test.local');
  assert.throws(() => setUserAdminFields(admin.id, { active: false }), /dernier compte administrateur/);
});

test('impossible de supprimer le dernier administrateur', () => {
  const admin = findUserByEmail('seul-admin@test.local');
  assert.throws(() => deleteUser(admin.id), /dernier compte administrateur/);
});

test('retirer un admin reste possible tant qu\'un autre admin actif existe', () => {
  const second = createUser({ email: 'second-admin@test.local', password: 'motdepasse123', role: 'admin' });
  assert.equal(countAdmins(), 2);
  const updated = setUserAdminFields(second.id, { role: 'user' });
  assert.equal(updated.role, 'user');
  assert.equal(countAdmins(), 1);
});
