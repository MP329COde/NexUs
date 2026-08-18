import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-networksvc-'));
process.env.JWT_SECRET = 'test-secret';

const { default: networkServicesRoutes } = await import('../src/routes/networkServices.routes.js');
const { createUser } = await import('../src/store/usersStore.js');
const { SESSION_COOKIE } = await import('../src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/network-services', networkServicesRoutes);

function cookieFor(user) {
  const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
  return `${SESSION_COOKIE}=${token}`;
}

const admin = createUser({ email: 'net-admin@example.com', password: 'Password123!', role: 'admin' });
const regular = createUser({ email: 'net-user@example.com', password: 'Password123!', role: 'user' });

test('un utilisateur non-admin ne peut pas créer un VLAN', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/network-services/vlans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieFor(regular) },
      body: JSON.stringify({ name: 'vlan-test' })
    });
    assert.equal(res.status, 403);
  } finally {
    server.close();
  }
});

test('un admin peut créer un VLAN', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/network-services/vlans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieFor(admin) },
      body: JSON.stringify({ vlanId: 42, name: 'vlan-test', cidr: '10.0.42.0/24' })
    });
    assert.equal(res.status, 201);
  } finally {
    server.close();
  }
});

test('un utilisateur non-admin peut toujours lister les VLAN', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/network-services/vlans`, {
      headers: { Cookie: cookieFor(regular) }
    });
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});
