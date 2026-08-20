import { test } from 'node:test';
import assert from 'node:assert/strict';

const { isValidIpv4, isValidCidr, ipMatchesCidr, ipMatchesAnyCidr } = await import('../src/utils/cidr.js');

test('isValidIpv4 accepte des IPv4 valides et rejette le reste', () => {
  assert.equal(isValidIpv4('10.0.0.1'), true);
  assert.equal(isValidIpv4('255.255.255.255'), true);
  assert.equal(isValidIpv4('256.0.0.1'), false);
  assert.equal(isValidIpv4('::1'), false);
  assert.equal(isValidIpv4('not-an-ip'), false);
});

test('isValidCidr accepte une plage ou une IP seule (/32 implicite)', () => {
  assert.equal(isValidCidr('10.0.0.0/24'), true);
  assert.equal(isValidCidr('192.168.1.42'), true);
  assert.equal(isValidCidr('10.0.0.0/33'), false);
  assert.equal(isValidCidr('10.0.0.0/-1'), false);
  assert.equal(isValidCidr('not-a-cidr'), false);
});

test('ipMatchesCidr respecte le préfixe', () => {
  assert.equal(ipMatchesCidr('10.0.0.42', '10.0.0.0/24'), true);
  assert.equal(ipMatchesCidr('10.0.1.42', '10.0.0.0/24'), false);
  assert.equal(ipMatchesCidr('127.0.0.1', '127.0.0.1/32'), true);
  assert.equal(ipMatchesCidr('127.0.0.2', '127.0.0.1/32'), false);
  assert.equal(ipMatchesCidr('1.2.3.4', '0.0.0.0/0'), true);
});

test('ipMatchesAnyCidr vérifie contre plusieurs plages', () => {
  const list = ['10.0.0.0/24', '192.168.1.0/24'];
  assert.equal(ipMatchesAnyCidr('192.168.1.5', list), true);
  assert.equal(ipMatchesAnyCidr('8.8.8.8', list), false);
  assert.equal(ipMatchesAnyCidr('8.8.8.8', []), false);
});
