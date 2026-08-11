import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sshpk from 'sshpk';
import { encryptSecret, decryptSecret } from './crypto.js';
import { dataDir } from '../config/paths.js';

const privFile = path.join(dataDir, '.ssh_console_key.enc');
const pubFile = path.join(dataDir, '.ssh_console_key.pub');

// Paire de clés RSA propre à cette installation de la console, utilisée pour
// s'authentifier sur les hôtes gérés (catalogue d'agents, cf. agentCatalog.js).
// La clé privée est chiffrée au repos (même mécanisme que les secrets
// d'intégration) ; la clé publique est en clair, à copier manuellement dans
// ~/.ssh/authorized_keys des hôtes cibles.
function generate() {
  // ssh2 attend une clé privée au format PKCS#1 ("BEGIN RSA PRIVATE KEY") ou
  // OpenSSH — PKCS#8 ("BEGIN PRIVATE KEY") n'est pas reconnu par son parseur.
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' }
  });
  const sshPublicKey = `${sshpk.parseKey(publicKey, 'pem').toString('ssh')} nexus-console\n`;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(privFile, encryptSecret(privateKey), { mode: 0o600 });
  fs.writeFileSync(pubFile, sshPublicKey, { mode: 0o644 });
  return { privateKey, publicKey: sshPublicKey };
}

export function getConsoleKeypair() {
  if (!fs.existsSync(privFile) || !fs.existsSync(pubFile)) return generate();
  return {
    privateKey: decryptSecret(fs.readFileSync(privFile, 'utf8')),
    publicKey: fs.readFileSync(pubFile, 'utf8')
  };
}

export function getConsolePublicKey() {
  return getConsoleKeypair().publicKey;
}
