import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
const keyFile = path.join(dataDir, '.master.key');

function loadOrCreateKey() {
  if (env.masterKey) return Buffer.from(env.masterKey, 'hex').length === 32
    ? Buffer.from(env.masterKey, 'hex')
    : crypto.createHash('sha256').update(env.masterKey).digest();

  fs.mkdirSync(dataDir, { recursive: true });
  if (fs.existsSync(keyFile)) {
    return Buffer.from(fs.readFileSync(keyFile, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, key.toString('hex'), { mode: 0o600 });
  return key;
}

const masterKey = loadOrCreateKey();

// Chiffrement AES-256-GCM des secrets (tokens API, mots de passe...) avant écriture disque.
// Le frontend ne reçoit jamais ces valeurs en clair (voir store/settingsStore.js#redact).
export function encryptSecret(plainText) {
  if (plainText == null || plainText === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

export function decryptSecret(payload) {
  if (!payload) return null;
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) return null;
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  if (!stored) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const attempt = crypto.scryptSync(plain, salt, 64);
  return hash.length === attempt.length && crypto.timingSafeEqual(hash, attempt);
}
