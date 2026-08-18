import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-csrfflow-'));
process.env.JWT_SECRET = 'test-secret';

const { default: authRoutes } = await import('../src/routes/auth.routes.js');
const { csrfProtection, requireAuth, SESSION_COOKIE, CSRF_COOKIE } = await import('../src/middleware/auth.js');
const { createUser } = await import('../src/store/usersStore.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRoutes);
app.use(csrfProtection);
app.put('/protected/profile', requireAuth, (req, res) => res.json({ ok: true }));

function parseCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')];
  const jar = {};
  for (const line of raw) {
    if (!line) continue;
    const [pair] = line.split(';');
    const [k, v] = pair.split('=');
    jar[k] = v;
  }
  return jar;
}

test('flux complet : login pose les deux cookies, une mutation sans en-tête CSRF échoue, avec réussit', async () => {
  createUser({ email: 'flow@example.com', password: 'Password123!', role: 'user' });
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'flow@example.com', password: 'Password123!' })
    });
    assert.equal(loginRes.status, 200);
    const cookies = parseCookies(loginRes);
    assert.ok(cookies[SESSION_COOKIE], 'cookie de session posé');
    assert.ok(cookies[CSRF_COOKIE], 'cookie CSRF posé');
    const cookieHeader = `${SESSION_COOKIE}=${cookies[SESSION_COOKIE]}; ${CSRF_COOKIE}=${cookies[CSRF_COOKIE]}`;

    const withoutToken = await fetch(`${base}/protected/profile`, {
      method: 'PUT',
      headers: { Cookie: cookieHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(withoutToken.status, 403);

    const withToken = await fetch(`${base}/protected/profile`, {
      method: 'PUT',
      headers: { Cookie: cookieHeader, 'Content-Type': 'application/json', 'X-CSRF-Token': cookies[CSRF_COOKIE] },
      body: JSON.stringify({})
    });
    assert.equal(withToken.status, 200);
  } finally {
    server.close();
  }
});
