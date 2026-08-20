import crypto from 'node:crypto';

// TOTP (RFC 6238) implémenté sans dépendance externe (HMAC-SHA1 déjà fourni
// par node:crypto) — évite d'ajouter une librairie pour un algorithme d'une
// trentaine de lignes. Compatible avec tous les générateurs standards
// (Google Authenticator, Authy, 1Password...), qui attendent tous ce même
// profil par défaut : SHA1, 6 chiffres, pas de 30s.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function generateSecret(byteLength = 20) {
  return base32Encode(crypto.randomBytes(byteLength));
}

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const clean = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue; // ignore les espaces/tirets éventuels de saisie manuelle
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binCode % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function generateTotpCode(base32Secret, atMs = Date.now()) {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(base32Secret), counter);
}

// window=1 tolère un décalage d'horloge de ±30s entre le serveur et l'appareil
// de l'utilisateur — comportement standard de la plupart des implémentations
// TOTP, sans quoi une horloge légèrement désynchronisée rendrait le compte
// inaccessible.
export function verifyTotpCode(base32Secret, code, window = 1) {
  if (!code || !/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  const secretBuffer = base32Decode(base32Secret);
  for (let i = -window; i <= window; i++) {
    if (hotp(secretBuffer, counter + i) === code) return true;
  }
  return false;
}

export function buildOtpauthUrl({ secret, accountName, issuer }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}
