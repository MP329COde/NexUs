import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScorecard } from '../src/services/catalogScorecard.js';

const FULL_COMPONENT = {
  description: 'API de facturation', owner_team_id: 'team-1', repository_url: 'https://github.com/x/y',
  language: 'TypeScript', framework: 'NestJS', project_environment_count: 2, lifecycle: 'production'
};

test('computeScorecard : un composant complet obtient 100 et est production eligible', () => {
  const result = computeScorecard(FULL_COMPONENT);
  assert.equal(result.score, 100);
  assert.equal(result.productionEligible, true);
  assert.ok(result.checks.every((c) => c.passed));
});

test('computeScorecard : un composant vide obtient 0 et n\'est pas production eligible', () => {
  const result = computeScorecard({ description: '', owner_team_id: null, repository_url: '', language: '', framework: '', project_environment_count: 0, lifecycle: 'experimental' });
  assert.equal(result.score, 0);
  assert.equal(result.productionEligible, false);
  assert.ok(result.checks.every((c) => !c.passed));
});

test('computeScorecard : project_environment_count "0" (chaîne, comme renvoyé par Postgres COUNT) est traité comme absent', () => {
  const result = computeScorecard({ ...FULL_COMPONENT, project_environment_count: '0' });
  assert.equal(result.checks.find((c) => c.id === 'environments').passed, false);
});

test('computeScorecard : lifecycle "experimental" bloque productionEligible même si tout le reste est complet', () => {
  const result = computeScorecard({ ...FULL_COMPONENT, lifecycle: 'experimental' });
  assert.equal(result.productionEligible, false);
  // Le score reste élevé (5/6) : seul le critère lifecycle échoue.
  assert.equal(result.score, Math.round((5 / 6) * 100));
});

test('computeScorecard : "stack" exige langage ET framework, pas l\'un ou l\'autre', () => {
  const onlyLanguage = computeScorecard({ ...FULL_COMPONENT, framework: '' });
  assert.equal(onlyLanguage.checks.find((c) => c.id === 'stack').passed, false);
});
