import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-csrf-'));
process.env.JWT_SECRET = 'test-secret';

const { csrfProtection, SESSION_COOKIE, CSRF_COOKIE } = await import('../src/middleware/auth.js');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(csrfProtection);
app.get('/ping', (req, res) => res.json({ ok: true }));
app.post('/mutate', (req, res) => res.json({ ok: true }));
app.post('/auth/login', (req, res) => res.json({ ok: true }));

async function withServer(fn) {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test('une requête GET passe sans jeton CSRF', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ping`);
    assert.equal(res.status, 200);
  });
});

test('une requête mutative sans cookie de session (client Bearer/API) passe sans jeton CSRF', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/mutate`, { method: 'POST' });
    assert.equal(res.status, 200);
  });
});

test('une requête mutative avec cookie de session mais sans jeton CSRF est rejetée', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/mutate`, {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=fake-session-token` }
    });
    assert.equal(res.status, 403);
  });
});

test('une requête mutative avec cookie CSRF mais en-tête absent ou différent est rejetée', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/mutate`, {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=fake-session-token; ${CSRF_COOKIE}=abc123`, 'X-CSRF-Token': 'different' }
    });
    assert.equal(res.status, 403);
  });
});

test('une requête mutative avec cookie et en-tête CSRF correspondants est acceptée', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/mutate`, {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=fake-session-token; ${CSRF_COOKIE}=abc123`, 'X-CSRF-Token': 'abc123' }
    });
    assert.equal(res.status, 200);
  });
});

// Reproduit le vrai verrou trouvé en testant le Software Catalog à la
// souris : un onglet resté connecté longtemps avec un nexus_session encore
// valide mais un nexus_csrf disparu (purge partielle du navigateur) ne
// pouvait plus jamais se reconnecter, /auth/login exigeant lui aussi un
// jeton CSRF introuvable — sans issue puisque le logout est tout aussi
// mutatif. /auth/login émet une NOUVELLE session, il n'a donc pas besoin de
// prouver la connaissance d'un jeton CSRF lié à l'ancienne.
test("POST /auth/login passe sans jeton CSRF même avec un cookie de session périmé présent", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { Cookie: `${SESSION_COOKIE}=stale-session-token` }
    });
    assert.equal(res.status, 200);
  });
});

test('une requête mutative authentifiée par Bearer (pas de cookie de session) passe sans jeton CSRF', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/mutate`, {
      method: 'POST',
      headers: { Authorization: 'Bearer some-jwt' }
    });
    assert.equal(res.status, 200);
  });
});
