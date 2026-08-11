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

export function listAuditEntries({ limit = 200 } = {}) {
  return readStore('audit').slice(0, limit);
}
