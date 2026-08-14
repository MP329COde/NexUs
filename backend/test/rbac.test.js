import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectRoleAtLeast } from '../src/store/orgStore.js';

test('projectRoleAtLeast : hiérarchie viewer < developer < maintainer < owner', () => {
  assert.equal(projectRoleAtLeast('owner', 'viewer'), true);
  assert.equal(projectRoleAtLeast('owner', 'owner'), true);
  assert.equal(projectRoleAtLeast('maintainer', 'owner'), false);
  assert.equal(projectRoleAtLeast('developer', 'maintainer'), false);
  assert.equal(projectRoleAtLeast('viewer', 'developer'), false);
  assert.equal(projectRoleAtLeast('developer', 'developer'), true);
});

test('projectRoleAtLeast : aucun rôle (null/undefined) ne satisfait jamais un minimum', () => {
  assert.equal(projectRoleAtLeast(null, 'viewer'), false);
  assert.equal(projectRoleAtLeast(undefined, 'viewer'), false);
});

test('projectRoleAtLeast : un rôle inconnu est traité comme rang 0 (refusé)', () => {
  assert.equal(projectRoleAtLeast('superadmin', 'viewer'), false);
});
