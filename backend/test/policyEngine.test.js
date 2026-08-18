import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// policyEngine lit codeScansStore/dastScansStore (store JSON partagé) pour
// les policies block_* : isolé dans un répertoire de données temporaire,
// comme usersStore.test.js — sinon ce fichier lirait les scans réels de
// l'instance de dev en cours (voir bug trouvé en le lançant la première
// fois : un vrai scan Semgrep à 3 ERROR faisait échouer le test "aucun scan
// enregistré").
process.env.NEXUS_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-policy-'));

const { evaluatePolicies } = await import('../src/services/policyEngine.js');

const POLICIES = [
  { id: 'p1', name: 'Owner requis', kind: 'require_owner_team', enabled: true },
  { id: 'p2', name: 'Production requise', kind: 'require_production_lifecycle', enabled: true },
  { id: 'p3', name: 'Description requise', kind: 'require_description', enabled: true },
  { id: 'p4', name: 'Dépôt requis', kind: 'require_repository', enabled: true }
];

test('evaluatePolicies : un composant complet passe toutes les policies activées', () => {
  const component = { owner_team_id: 't1', lifecycle: 'production', description: 'x', repository_url: 'https://x' };
  const result = evaluatePolicies(component, POLICIES);
  assert.equal(result.allowed, true);
  assert.ok(result.results.every((r) => r.passed));
});

test('evaluatePolicies : un composant incomplet est bloqué avec un détail par règle en échec', () => {
  const component = { owner_team_id: null, lifecycle: 'experimental', description: '', repository_url: '' };
  const result = evaluatePolicies(component, POLICIES);
  assert.equal(result.allowed, false);
  assert.equal(result.results.filter((r) => !r.passed).length, 4);
  assert.ok(result.results.every((r) => !r.passed ? typeof r.detail === 'string' && r.detail.length > 0 : true));
});

test('evaluatePolicies : une policy désactivée n\'est jamais évaluée (absente des résultats)', () => {
  const disabled = POLICIES.map((p) => (p.kind === 'require_owner_team' ? { ...p, enabled: false } : p));
  const component = { owner_team_id: null, lifecycle: 'production', description: 'x', repository_url: 'https://x' };
  const result = evaluatePolicies(component, disabled);
  assert.equal(result.allowed, true);
  assert.ok(!result.results.some((r) => r.kind === 'require_owner_team'));
});

test('evaluatePolicies : aucune policy activée → allowed=true par défaut (rien à faire respecter)', () => {
  const result = evaluatePolicies({}, POLICIES.map((p) => ({ ...p, enabled: false })));
  assert.equal(result.allowed, true);
  assert.deepEqual(result.results, []);
});

test('evaluatePolicies : block_critical_code_scan et block_high_dast_scan passent en l\'absence de tout scan enregistré', () => {
  // listCodeScans()/listDastScans() peuvent renvoyer [] (aucun scan jamais
  // lancé) — même choix que le Security Gate existant
  // (environmentPromotionService.js) : ne jamais pénaliser une instance qui
  // n'a pas encore de scanner configuré.
  const result = evaluatePolicies({}, [
    { id: 'p5', name: 'Pas de CRITICAL', kind: 'block_critical_code_scan', enabled: true },
    { id: 'p6', name: 'Pas de High DAST', kind: 'block_high_dast_scan', enabled: true }
  ]);
  assert.equal(result.allowed, true);
});

test('evaluatePolicies : require_linked_environment — existence d\'environnements ne suffit plus, il en faut un réellement relié à Argo CD', () => {
  const policy = [{ id: 'p7', name: 'Environnement relié requis', kind: 'require_linked_environment', enabled: true }];
  const noneLinked = evaluatePolicies({ project_linked_environment_count: 0 }, policy);
  assert.equal(noneLinked.allowed, false);
  assert.match(noneLinked.results[0].detail, /Aucun environnement/);

  const oneLinked = evaluatePolicies({ project_linked_environment_count: 1 }, policy);
  assert.equal(oneLinked.allowed, true);
  assert.equal(oneLinked.results[0].detail, null);

  // Comme project_environment_count ailleurs : Postgres renvoie parfois un
  // COUNT sous forme de chaîne ("0"), jamais confondu avec un nombre truthy.
  const stringZero = evaluatePolicies({ project_linked_environment_count: '0' }, policy);
  assert.equal(stringZero.allowed, false);
});
