import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-groupsesc-'));
process.env.JWT_SECRET = 'test-secret';

const { default: groupsRoutes } = await import('../src/routes/groups.routes.js');
const { createUser } = await import('../src/store/usersStore.js');
const { createGroup } = await import('../src/store/groupsStore.js');
const { signSession, SESSION_COOKIE } = await import('../src/middleware/auth.js');
const { readStore, writeStore } = await import('../src/store/jsonStore.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/groups', groupsRoutes);

async function withServer(fn) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

function headersFor(user) {
  return { 'Content-Type': 'application/json', Cookie: `${SESSION_COOKIE}=${signSession(user)}` };
}

function addMember(groupId, userId) {
  const groups = readStore('groups');
  groups.find((g) => g.id === groupId).memberIds.push(userId);
  writeStore('groups', groups);
}

test("un manager de groupe (users:admin via groupe) ne peut pas créer un groupe qui s'accorde à lui-même un niveau supérieur à son plafond actuel", async () => {
  const manager = createUser({ email: 'groupmgr1@example.com', password: 'Password123!', role: 'user' });
  const managerGroup = createGroup({ name: 'Gestionnaires RBAC', permissions: { users: 'admin' } });
  addMember(managerGroup.id, manager.id);

  await withServer(async (base) => {
    const res = await fetch(`${base}/groups`, {
      method: 'POST',
      headers: headersFor(manager),
      body: JSON.stringify({ name: 'Auto-élévation', memberIds: [manager.id], permissions: { vault: 'admin' } })
    });
    assert.equal(res.status, 403);
  });
});

test('le même manager peut créer un groupe qui accorde vault:admin à un AUTRE utilisateur (pas lui-même)', async () => {
  const manager = createUser({ email: 'groupmgr2@example.com', password: 'Password123!', role: 'user' });
  const other = createUser({ email: 'other2@example.com', password: 'Password123!', role: 'user' });
  const managerGroup = createGroup({ name: 'Gestionnaires RBAC 2', permissions: { users: 'admin' } });
  addMember(managerGroup.id, manager.id);

  await withServer(async (base) => {
    const res = await fetch(`${base}/groups`, {
      method: 'POST',
      headers: headersFor(manager),
      body: JSON.stringify({ name: 'Accès Vault équipe', memberIds: [other.id], permissions: { vault: 'admin' } })
    });
    assert.equal(res.status, 201);
  });
});

test("un manager ne peut pas s'ajouter lui-même à un groupe existant plus privilégié que son plafond via PUT", async () => {
  const manager = createUser({ email: 'groupmgr3@example.com', password: 'Password123!', role: 'user' });
  const managerGroup = createGroup({ name: 'Gestionnaires RBAC 3', permissions: { users: 'admin' } });
  const privilegedGroup = createGroup({ name: 'Vault Admins', permissions: { vault: 'admin' } });
  addMember(managerGroup.id, manager.id);

  await withServer(async (base) => {
    const res = await fetch(`${base}/groups/${privilegedGroup.id}`, {
      method: 'PUT',
      headers: headersFor(manager),
      body: JSON.stringify({ memberIds: [manager.id] })
    });
    assert.equal(res.status, 403);
  });
});

test('un manager peut modifier un groupe privilégié dont il est déjà membre tant que le niveau ne dépasse pas ce qu\'il a déjà', async () => {
  const manager = createUser({ email: 'groupmgr4@example.com', password: 'Password123!', role: 'user' });
  const managerGroup = createGroup({ name: 'Gestionnaires RBAC 4', permissions: { users: 'admin', vault: 'admin' } });
  addMember(managerGroup.id, manager.id);

  await withServer(async (base) => {
    const res = await fetch(`${base}/groups/${managerGroup.id}`, {
      method: 'PUT',
      headers: headersFor(manager),
      body: JSON.stringify({ description: 'mise à jour bénigne' })
    });
    assert.equal(res.status, 200);
  });
});

test('un admin plateforme (role admin) reste libre de créer un groupe qui se donne vault:admin', async () => {
  const admin = createUser({ email: 'platformadmin1@example.com', password: 'Password123!', role: 'admin' });
  await withServer(async (base) => {
    const res = await fetch(`${base}/groups`, {
      method: 'POST',
      headers: headersFor(admin),
      body: JSON.stringify({ name: 'Admin group', memberIds: [admin.id], permissions: { vault: 'admin' } })
    });
    assert.equal(res.status, 201);
  });
});
