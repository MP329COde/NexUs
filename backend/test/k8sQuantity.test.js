import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCpuToMillicores, parseMemoryToBytes, formatMillicores, formatBytesAsMi, QuantityError } from '../src/services/k8sQuantity.js';

test('parseCpuToMillicores : suffixe "m" et valeur entière/décimale sans suffixe', () => {
  assert.equal(parseCpuToMillicores('500m'), 500);
  assert.equal(parseCpuToMillicores('2'), 2000);
  assert.equal(parseCpuToMillicores('0.5'), 500);
  assert.equal(parseCpuToMillicores(''), 0);
  assert.equal(parseCpuToMillicores(null), 0);
});

test('parseCpuToMillicores : valeur invalide lève une erreur explicite, jamais NaN silencieux', () => {
  assert.throws(() => parseCpuToMillicores('beaucoup'), QuantityError);
  assert.throws(() => parseCpuToMillicores('-1'), QuantityError);
});

test('parseMemoryToBytes : suffixes binaires (Ki/Mi/Gi/Ti)', () => {
  assert.equal(parseMemoryToBytes('512Mi'), 512 * 1024 * 1024);
  assert.equal(parseMemoryToBytes('1Gi'), 1024 ** 3);
  assert.equal(parseMemoryToBytes('2Ki'), 2048);
});

test('parseMemoryToBytes : suffixes décimaux (K/M/G/T), distincts des suffixes binaires', () => {
  assert.equal(parseMemoryToBytes('1M'), 1_000_000);
  assert.equal(parseMemoryToBytes('1G'), 1_000_000_000);
  // 1M (décimal) < 1Mi (binaire) : vérifie qu'on ne confond jamais les deux bases.
  assert.ok(parseMemoryToBytes('1M') < parseMemoryToBytes('1Mi'));
});

test('parseMemoryToBytes : octets bruts sans suffixe, valeur invalide rejetée', () => {
  assert.equal(parseMemoryToBytes('1024'), 1024);
  assert.throws(() => parseMemoryToBytes('grand'), QuantityError);
});

test('formatMillicores / formatBytesAsMi : lisibles, cohérents avec le format d\'entrée des blueprints', () => {
  assert.equal(formatMillicores(2000), '2');
  assert.equal(formatMillicores(500), '500m');
  assert.equal(formatBytesAsMi(512 * 1024 * 1024), '512Mi');
});
