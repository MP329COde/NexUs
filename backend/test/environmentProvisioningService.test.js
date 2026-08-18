import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveNamespace } from '../src/services/environmentProvisioningService.js';

// resolveNamespace() est pure (pas d'appel Kubernetes) : testable sans
// DATABASE_URL, contrairement à provisionFromBlueprint() (voir
// relationalStores.postgres.test.js pour le comportement de bout en bout,
// Kubernetes non configuré dans l'environnement de test).

test('resolveNamespace : substitue {project} et {env} dans le pattern du blueprint', () => {
  assert.equal(resolveNamespace('{project}-{env}', { projectSlug: 'billing', envName: 'staging' }), 'billing-staging');
});

test('resolveNamespace : pattern vide retombe sur "<projet>-<env>"', () => {
  assert.equal(resolveNamespace('', { projectSlug: 'billing', envName: 'staging' }), 'billing-staging');
  assert.equal(resolveNamespace(null, { projectSlug: 'billing', envName: 'staging' }), 'billing-staging');
});

test('resolveNamespace : sanitise en nom de namespace RFC 1123 valide (minuscules, tirets, sans tiret en bord)', () => {
  assert.equal(resolveNamespace('{project}_{env} Prod!!', { projectSlug: 'Billing', envName: 'Staging' }), 'billing-staging-prod');
});

test('resolveNamespace : tronque à 63 caractères', () => {
  const long = resolveNamespace('a'.repeat(100), { projectSlug: 'x', envName: 'y' });
  assert.ok(long.length <= 63);
});
