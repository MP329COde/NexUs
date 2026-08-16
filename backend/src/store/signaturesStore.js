import { readStore, writeStore } from './jsonStore.js';

// Signatures cosign des SBOM (voir services/cosignService.js), indexées par
// id de SBOM — un SBOM n'a qu'une signature active à la fois.
export function getSignature(sbomId) {
  const signatures = readStore('signatures') || {};
  return signatures[sbomId] || null;
}

export function recordSignature(sbomId, { signature, publicKey, algorithm }) {
  const signatures = readStore('signatures') || {};
  signatures[sbomId] = { signature, publicKey, algorithm, signedAt: new Date().toISOString() };
  writeStore('signatures', signatures);
  return signatures[sbomId];
}
