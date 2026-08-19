import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, CORE_EVENTS, CORE_HOOKS, PLUGIN_PERMISSION_CATALOG, isCoreEvent, isCoreHook } from '../src/index.js';

test('validateManifest : accepte un manifest minimal correct', () => {
  const { valid } = validateManifest({ id: 'my-plugin', name: 'My Plugin', version: '1.0.0', apiVersion: '1.0' });
  assert.equal(valid, true);
});

test('validateManifest : rejette une permission hors catalogue', () => {
  const { valid, errors } = validateManifest({
    id: 'x', name: 'X', version: '1.0.0', apiVersion: '1.0', permissions: ['plugin:admin.full-access']
  });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('inconnue')));
});

test('validateManifest : accepte une permission du catalogue', () => {
  const { valid } = validateManifest({
    id: 'x', name: 'X', version: '1.0.0', apiVersion: '1.0', permissions: ['plugin:catalog.read']
  });
  assert.equal(valid, true);
});

test('validateManifest : rejette un id invalide', () => {
  const { valid, errors } = validateManifest({ id: '-bad', name: 'X', version: '1.0.0', apiVersion: '1.0' });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => e.includes('id invalide')));
});

test('isCoreEvent / isCoreHook : cohérents avec les catalogues exportés', () => {
  for (const e of CORE_EVENTS) assert.equal(isCoreEvent(e), true);
  assert.equal(isCoreEvent('not.a.real.event'), false);
  for (const h of CORE_HOOKS) assert.equal(isCoreHook(h), true);
  assert.equal(isCoreHook('notAHook'), false);
});

test('PLUGIN_PERMISSION_CATALOG : non vide et bien formé', () => {
  assert.ok(PLUGIN_PERMISSION_CATALOG.length > 0);
  for (const p of PLUGIN_PERMISSION_CATALOG) assert.match(p, /^plugin:[a-z0-9-]+\.[a-z-]+$/);
});
