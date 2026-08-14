import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Reproduit exactement la logique de vérification de
// routes/webhooks.routes.js (timingSafeEqualStr + HMAC GitHub), sans
// dépendre d'un serveur HTTP ni de Postgres — la route elle-même est
// vérifiée manuellement en conditions réelles (voir le message du commit
// associé).
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function githubSignature(secret, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

test('timingSafeEqualStr : accepte une correspondance exacte', () => {
  assert.equal(timingSafeEqualStr('secret-123', 'secret-123'), true);
});

test('timingSafeEqualStr : refuse une valeur différente', () => {
  assert.equal(timingSafeEqualStr('secret-123', 'secret-124'), false);
});

test('timingSafeEqualStr : refuse une longueur différente sans lever d\'exception', () => {
  assert.equal(timingSafeEqualStr('secret-123', 'secret-12'), false);
  assert.equal(timingSafeEqualStr('secret-123', 'secret-123-trop-long'), false);
});

test('timingSafeEqualStr : refuse undefined/null sans lever d\'exception (en-tête absent)', () => {
  assert.equal(timingSafeEqualStr(undefined, 'secret-123'), false);
  assert.equal(timingSafeEqualStr(null, 'secret-123'), false);
});

test('signature GitHub : la même clé/corps produit une signature vérifiable', () => {
  const secret = 'a-real-webhook-secret';
  const body = Buffer.from(JSON.stringify({ action: 'completed' }));
  const sig = githubSignature(secret, body);
  assert.equal(timingSafeEqualStr(sig, githubSignature(secret, body)), true);
});

test('signature GitHub : un corps modifié après signature est détecté', () => {
  const secret = 'a-real-webhook-secret';
  const original = Buffer.from(JSON.stringify({ action: 'completed' }));
  const tampered = Buffer.from(JSON.stringify({ action: 'completed', injected: true }));
  const sig = githubSignature(secret, original);
  assert.equal(timingSafeEqualStr(sig, githubSignature(secret, tampered)), false);
});

test('signature GitHub : un mauvais secret produit une signature différente', () => {
  const body = Buffer.from(JSON.stringify({ action: 'completed' }));
  const sig = githubSignature('secret-correct', body);
  assert.equal(timingSafeEqualStr(sig, githubSignature('secret-devine', body)), false);
});
