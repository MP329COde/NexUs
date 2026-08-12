import { readStore, writeStore } from './jsonStore.js';

const IP_PATTERN = /^(\d{1,3}\.){3}\d{1,3}$/;

function isValidIp(ip) {
  if (!IP_PATTERN.test(ip)) return false;
  return ip.split('.').every((octet) => Number(octet) >= 0 && Number(octet) <= 255);
}

// req.ip peut se présenter sous forme IPv4-mappée IPv6 (::ffff:127.0.0.1) ou
// en loopback IPv6 pur (::1) selon qu'on est derrière nginx (trust proxy,
// X-Forwarded-For déjà en IPv4) ou en accès direct (npm run dev). On
// normalise pour que le bannissement et son application se comparent de
// façon cohérente quel que soit le mode d'accès.
export function normalizeIp(ip) {
  if (!ip) return ip;
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

export function listBannedIps() {
  return readStore('banlist') || [];
}

export function isBanned(ip) {
  const normalized = normalizeIp(ip);
  return listBannedIps().some((b) => b.ip === normalized);
}

export function banIp(ip, reason, actorEmail) {
  if (!isValidIp(ip)) {
    throw Object.assign(new Error('Adresse IPv4 invalide'), { status: 400 });
  }
  const list = listBannedIps();
  if (list.some((b) => b.ip === ip)) {
    throw Object.assign(new Error('Cette adresse est déjà bannie'), { status: 409 });
  }
  const entry = { ip, reason: reason || '', bannedBy: actorEmail || null, bannedAt: new Date().toISOString() };
  list.push(entry);
  writeStore('banlist', list);
  return entry;
}

export function unbanIp(ip) {
  const list = listBannedIps();
  const next = list.filter((b) => b.ip !== ip);
  if (next.length === list.length) return false;
  writeStore('banlist', next);
  return true;
}
