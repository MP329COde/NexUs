import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServiceManifest, componentToManifest, ManifestError } from '../src/services/serviceManifest.js';

const VALID_YAML = `
apiVersion: nexus.dev/v1
kind: Service
metadata:
  name: billing-api
  description: Billing API
spec:
  type: api
  lifecycle: production
  owner: team-finance
  language: TypeScript
  framework: NestJS
  repository:
    provider: github
    url: https://github.com/company/billing-api
  tags: [finance, critical]
  links:
    - label: Runbook
      url: https://wiki.example/runbook
`;

test('parseServiceManifest : accepte un manifeste valide complet', () => {
  const parsed = parseServiceManifest(VALID_YAML);
  assert.equal(parsed.name, 'billing-api');
  assert.equal(parsed.kind, 'api');
  assert.equal(parsed.lifecycle, 'production');
  assert.equal(parsed.ownerTeamSlug, 'team-finance');
  assert.equal(parsed.repositoryProvider, 'github');
  assert.deepEqual(parsed.tags, ['finance', 'critical']);
  assert.deepEqual(parsed.links, [{ label: 'Runbook', url: 'https://wiki.example/runbook' }]);
});

test('parseServiceManifest : applique les valeurs par défaut (type, lifecycle)', () => {
  const parsed = parseServiceManifest(`
apiVersion: nexus.dev/v1
kind: Service
metadata:
  name: minimal-service
`);
  assert.equal(parsed.kind, 'service');
  assert.equal(parsed.lifecycle, 'experimental');
  assert.equal(parsed.ownerTeamSlug, null);
});

test('parseServiceManifest : rejette un YAML syntaxiquement invalide', () => {
  assert.throws(() => parseServiceManifest('apiVersion: [unclosed'), ManifestError);
});

test('parseServiceManifest : rejette une apiVersion non supportée', () => {
  assert.throws(() => parseServiceManifest(`
apiVersion: nexus.dev/v2
kind: Service
metadata:
  name: x
`), /apiVersion/);
});

test('parseServiceManifest : rejette un kind non supporté', () => {
  assert.throws(() => parseServiceManifest(`
apiVersion: nexus.dev/v1
kind: Component
metadata:
  name: x
`), /kind/);
});

test('parseServiceManifest : rejette un metadata.name absent ou invalide', () => {
  assert.throws(() => parseServiceManifest(`
apiVersion: nexus.dev/v1
kind: Service
metadata: {}
`), /metadata\.name/);
  assert.throws(() => parseServiceManifest(`
apiVersion: nexus.dev/v1
kind: Service
metadata:
  name: "Billing API"
`), /metadata\.name/);
});

test('parseServiceManifest : rejette un spec.type invalide', () => {
  assert.throws(() => parseServiceManifest(`
apiVersion: nexus.dev/v1
kind: Service
metadata:
  name: x
spec:
  type: not-a-real-kind
`), /spec\.type/);
});

test('parseServiceManifest : rejette spec.links mal formé', () => {
  assert.throws(() => parseServiceManifest(`
apiVersion: nexus.dev/v1
kind: Service
metadata:
  name: x
spec:
  links:
    - url: https://example.com
`), /spec\.links/);
});

test('componentToManifest : round-trip — un composant exporté puis réimporté redonne les mêmes champs', () => {
  const component = {
    slug: 'billing-api', description: 'Billing API', kind: 'api', lifecycle: 'production',
    owner_team_slug: 'team-finance', language: 'TypeScript', framework: 'NestJS',
    repository_provider: 'github', repository_url: 'https://github.com/company/billing-api',
    tags: ['finance'], links: [{ label: 'Runbook', url: 'https://wiki.example/runbook' }]
  };
  const yaml = componentToManifest(component);
  const reparsed = parseServiceManifest(yaml);
  assert.equal(reparsed.name, component.slug);
  assert.equal(reparsed.kind, component.kind);
  assert.equal(reparsed.lifecycle, component.lifecycle);
  assert.equal(reparsed.ownerTeamSlug, component.owner_team_slug);
  assert.deepEqual(reparsed.tags, component.tags);
  assert.deepEqual(reparsed.links, component.links);
});
