import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from '../store/jsonStore.js';

const MAX_ENTRIES = 1000;

// Journal des actions administratives sensibles (création/suppression de
// proxy, installation d'agent, gestion des utilisateurs, sauvegardes...).
// Best-effort et non bloquant : une erreur de journalisation ne doit jamais
// faire échouer l'action métier elle-même.
export function logAudit(req, action, meta = {}) {
  try {
    const entries = readStore('audit');
    entries.unshift({
      id: uuid(),
      at: new Date().toISOString(),
      actorId: req.user?.id || null,
      actorEmail: req.user?.email || null,
      action,
      meta,
      ip: req.ip
    });
    writeStore('audit', entries.slice(0, MAX_ENTRIES));
  } catch {
    // journalisation best-effort : ne jamais bloquer l'action métier
  }
}

// `action` : préfixe exact ("vault." trouve vault.create, vault.reveal...) —
// évite de devoir connaître le nom d'action complet. `q` : recherche libre
// insensible à la casse sur action/e-mail auteur/IP/JSON des métadonnées,
// pour retrouver une action sans se souvenir dans quel champ chercher.
// `since`/`until` : bornes ISO 8601 inclusives sur `at`.
export function listAuditEntries({ limit = 200, integrationKey = null, action = null, q = null, since = null, until = null } = {}) {
  let filtered = readStore('audit');
  if (integrationKey) filtered = filtered.filter((e) => e.meta?.key === integrationKey);
  if (action) filtered = filtered.filter((e) => e.action === action || e.action.startsWith(`${action}.`));
  if (since) { const t = new Date(since).getTime(); if (!Number.isNaN(t)) filtered = filtered.filter((e) => new Date(e.at).getTime() >= t); }
  if (until) { const t = new Date(until).getTime(); if (!Number.isNaN(t)) filtered = filtered.filter((e) => new Date(e.at).getTime() <= t); }
  if (q) {
    const needle = q.toLowerCase();
    filtered = filtered.filter((e) => (
      e.action.toLowerCase().includes(needle)
      || (e.actorEmail || '').toLowerCase().includes(needle)
      || (e.ip || '').toLowerCase().includes(needle)
      || JSON.stringify(e.meta || {}).toLowerCase().includes(needle)
    ));
  }
  return filtered.slice(0, limit);
}
