import { test } from 'node:test';
import assert from 'node:assert/strict';

const { generateSecret, generateTotpCode, verifyTotpCode, buildOtpauthUrl } = await import('../src/utils/totp.js');

test('generateSecret produit un secret base32 valide et différent à chaque appel', () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.match(a, /^[A-Z2-7]+$/);
  assert.notEqual(a, b);
});

test('un code généré à partir d\'un secret se vérifie avec le même secret', () => {
  const secret = generateSecret();
  const code = generateTotpCode(secret);
  assert.equal(verifyTotpCode(secret, code), true);
});

test('un code généré avec un autre secret ne se vérifie pas', () => {
  const secretA = generateSecret();
  const secretB = generateSecret();
  const code = generateTotpCode(secretA);
  assert.equal(verifyTotpCode(secretB, code), false);
});

test('un code mal formé est rejeté sans lever d\'exception', () => {
  const secret = generateSecret();
  assert.equal(verifyTotpCode(secret, ''), false);
  assert.equal(verifyTotpCode(secret, 'abcdef'), false);
  assert.equal(verifyTotpCode(secret, '12345'), false);
  assert.equal(verifyTotpCode(secret, undefined), false);
});

test('un code d\'une fenêtre de temps adjacente reste valide (tolérance de dérive d\'horloge)', () => {
  const secret = generateSecret();
  const STEP_MS = 30_000;
  const codePrev = generateTotpCode(secret, Date.now() - STEP_MS);
  assert.equal(verifyTotpCode(secret, codePrev), true);
});

test('buildOtpauthUrl produit une URL otpauth://totp bien formée', () => {
  const url = buildOtpauthUrl({ secret: 'JBSWY3DPEHPK3PXP', accountName: 'admin@nexus.local', issuer: 'Nexus Console' });
  assert.match(url, /^otpauth:\/\/totp\//);
  assert.match(url, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(url, /issuer=Nexus(\+|%20)Console/);
});
