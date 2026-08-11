import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-crypto-'));

const { encryptSecret, decryptSecret, hashPassword, verifyPassword } = await import('../src/utils/crypto.js');

test('encryptSecret/decryptSecret round-trip', () => {
  const plain = 'gl-pat-xxxxxxxxxxxxxxxxxxxx';
  const encrypted = encryptSecret(plain);
  assert.notEqual(encrypted, plain);
  assert.equal(decryptSecret(encrypted), plain);
});

test('encryptSecret renvoie null pour une valeur vide (ne stocke pas de secret vide)', () => {
  assert.equal(encryptSecret(''), null);
  assert.equal(encryptSecret(null), null);
  assert.equal(encryptSecret(undefined), null);
});

test('decryptSecret renvoie null pour une valeur malformée plutôt que de planter', () => {
  assert.equal(decryptSecret('pas-un-payload-chiffre'), null);
  assert.equal(decryptSecret(null), null);
});

test('deux chiffrements du même secret produisent des payloads différents (IV aléatoire)', () => {
  const a = encryptSecret('même-secret');
  const b = encryptSecret('même-secret');
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), 'même-secret');
  assert.equal(decryptSecret(b), 'même-secret');
});

test('hashPassword/verifyPassword: mot de passe correct accepté', () => {
  const hash = hashPassword('correct-horse-battery-staple');
  assert.equal(verifyPassword('correct-horse-battery-staple', hash), true);
});

test('hashPassword/verifyPassword: mot de passe incorrect rejeté', () => {
  const hash = hashPassword('correct-horse-battery-staple');
  assert.equal(verifyPassword('mauvais-mot-de-passe', hash), false);
});

test('verifyPassword ne plante jamais sur un hash absent/malformé', () => {
  assert.equal(verifyPassword('quoi-que-ce-soit', null), false);
  assert.equal(verifyPassword('quoi-que-ce-soit', 'pas-un-hash'), false);
});

test('deux hash du même mot de passe diffèrent (sel aléatoire)', () => {
  const h1 = hashPassword('même-mot-de-passe');
  const h2 = hashPassword('même-mot-de-passe');
  assert.notEqual(h1, h2);
});
