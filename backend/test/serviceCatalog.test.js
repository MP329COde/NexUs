import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listInstallableIds, isInstallable, buildServiceScript, getServiceMeta } from '../src/services/serviceCatalog.js';

test('expose une liste non vide d\'outils installables', () => {
  const ids = listInstallableIds();
  assert.ok(ids.length > 0);
  assert.ok(ids.includes('grafana'));
});

test('isInstallable distingue les outils du catalogue des autres', () => {
  assert.equal(isInstallable('grafana'), true);
  assert.equal(isInstallable('wazuh'), false); // multi-conteneurs, hors catalogue
  assert.equal(isInstallable('outil-inconnu'), false);
});

test('buildServiceScript produit un script docker run idempotent', () => {
  const script = buildServiceScript('prometheus');
  assert.match(script, /docker run -d --name prometheus/);
  assert.match(script, /docker inspect prometheus/); // vérifie l'idempotence avant de relancer
  assert.match(script, /prom\/prometheus:latest/);
});

test('buildServiceScript rejette un outil hors catalogue', () => {
  assert.throws(() => buildServiceScript('inconnu'), /indisponible/);
});

test('buildServiceScript injecte l\'adresse cible quand le script en a besoin (step-ca)', () => {
  const script = buildServiceScript('step-ca', { address: '10.0.0.42' });
  assert.match(script, /DOCKER_STEPCA_INIT_DNS_NAMES=10\.0\.0\.42/);
});

test('getServiceMeta renvoie le port par défaut de l\'outil', () => {
  assert.equal(getServiceMeta('grafana').port, 3000);
  assert.equal(getServiceMeta('inconnu'), null);
});
