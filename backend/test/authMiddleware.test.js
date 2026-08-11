import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-authmw-'));
process.env.JWT_SECRET = 'test-secret';

const { requireRole } = await import('../src/middleware/auth.js');

function callMiddleware(mw, req) {
  let called = false;
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; }
  };
  mw(req, res, () => { called = true; });
  return { called, statusCode, body };
}

test('requireRole laisse passer un utilisateur avec le bon rôle', () => {
  const mw = requireRole('admin');
  const { called, statusCode } = callMiddleware(mw, { user: { role: 'admin' } });
  assert.equal(called, true);
  assert.equal(statusCode, null);
});

test('requireRole bloque un utilisateur avec un rôle différent (403)', () => {
  const mw = requireRole('admin');
  const { called, statusCode, body } = callMiddleware(mw, { user: { role: 'user' } });
  assert.equal(called, false);
  assert.equal(statusCode, 403);
  assert.equal(body.ok, false);
});

test('requireRole bloque une requête sans utilisateur authentifié', () => {
  const mw = requireRole('admin');
  const { called, statusCode } = callMiddleware(mw, {});
  assert.equal(called, false);
  assert.equal(statusCode, 403);
});
