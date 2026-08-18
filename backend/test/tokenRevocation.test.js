import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-tokenrev-'));
process.env.JWT_SECRET = 'test-secret';

const { default: authRoutes } = await import('../src/routes/auth.routes.js');
const { requireAuth, signSession, SESSION_COOKIE } = await import('../src/middleware/auth.js');
const { createUser, findUserById, updatePassword } = await import('../src/store/usersStore.js');
const { hashPassword } = await import('../src/utils/crypto.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRoutes);
app.get('/protected', requireAuth, (req, res) => res.json({ ok: true, user: req.user.id }));

async function withServer(fn) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test('le logout révoque le token courant : une requête ultérieure avec le même JWT est rejetée', async () => {
  const user = createUser({ email: 'revoke-logout@example.com', password: 'Password123!', role: 'user' });
  const token = signSession(user);
  await withServer(async (base) => {
    const before = await fetch(`${base}/protected`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } });
    assert.equal(before.status, 200);

    const logoutRes = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${token}` } });
    assert.equal(logoutRes.status, 200);

    const after = await fetch(`${base}/protected`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } });
    assert.equal(after.status, 401);
  });
});

test('un changement de mot de passe révoque les tokens émis avant le changement', async () => {
  const user = createUser({ email: 'revoke-pwd@example.com', password: 'Password123!', role: 'user' });
  const token = signSession(user);
  await withServer(async (base) => {
    const before = await fetch(`${base}/protected`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } });
    assert.equal(before.status, 200);

    updatePassword(user.id, hashPassword('NewPassword456!'));

    const after = await fetch(`${base}/protected`, { headers: { Cookie: `${SESSION_COOKIE}=${token}` } });
    assert.equal(after.status, 401);
  });
});

test('un token émis après révocation reste valide', async () => {
  const user = createUser({ email: 'revoke-fresh@example.com', password: 'Password123!', role: 'user' });
  await withServer(async (base) => {
    await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: `${SESSION_COOKIE}=${signSession(user)}` } });
    const refreshed = findUserById(user.id);
    const freshToken = signSession(refreshed);
    const res = await fetch(`${base}/protected`, { headers: { Cookie: `${SESSION_COOKIE}=${freshToken}` } });
    assert.equal(res.status, 200);
  });
});
