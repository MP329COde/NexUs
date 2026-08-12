import { normalizeIp, isBanned, banIp } from '../store/banlistStore.js';
import { getFirewallSettings } from '../store/firewallStore.js';
import { logger } from '../utils/logger.js';

// Tampon circulaire en mémoire (pas de persistance : c'est du temps réel,
// redémarrer l'API le vide sans conséquence). Suffisant pour une seule
// instance homelab ; ne vise pas un usage multi-process.
const MAX_ENTRIES = 500;
const entries = [];

// Compteur glissant par IP des requêtes "suspectes" (échecs d'authentification,
// accès refusés, rate-limit). Une entrée par IP : { count, firstAt }.
const suspicionByIp = new Map();
const SUSPECT_STATUSES = new Set([401, 403, 429]);

function pruneSuspicion(ip, windowMs) {
  const s = suspicionByIp.get(ip);
  if (s && Date.now() - s.firstAt > windowMs) {
    suspicionByIp.delete(ip);
    return null;
  }
  return s || null;
}

export function recordRequest({ ip, method, path, status }) {
  const normalized = normalizeIp(ip) || 'inconnue';
  const entry = { ip: normalized, method, path, status, ts: new Date().toISOString() };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  if (!SUSPECT_STATUSES.has(status)) return;

  const { autoBlockEnabled, threshold, windowMs } = getFirewallSettings();
  const existing = pruneSuspicion(normalized, windowMs);
  const next = existing ? { count: existing.count + 1, firstAt: existing.firstAt } : { count: 1, firstAt: Date.now() };
  suspicionByIp.set(normalized, next);

  if (autoBlockEnabled && next.count >= threshold && !isBanned(normalized) && normalized !== '127.0.0.1') {
    try {
      banIp(normalized, `Blocage automatique : ${next.count} requêtes suspectes en ${Math.round(windowMs / 1000)}s`, 'system');
      logger.warn(`Blocage automatique de ${normalized} après ${next.count} requêtes suspectes`);
    } catch {
      // déjà bannie entre-temps (concurrence) : rien à faire
    }
    suspicionByIp.delete(normalized);
  }
}

export function getRecentTraffic(limit = 100) {
  return entries.slice(-limit).reverse();
}

export function getSuspiciousIps() {
  const { windowMs, threshold } = getFirewallSettings();
  const now = Date.now();
  return [...suspicionByIp.entries()]
    .filter(([, s]) => now - s.firstAt <= windowMs)
    .map(([ip, s]) => ({ ip, count: s.count, threshold, banned: isBanned(ip) }))
    .sort((a, b) => b.count - a.count);
}
