import { EventEmitter } from 'node:events';
import { pool, query } from '../../db/pool.js';
import { logger } from '../../utils/logger.js';
import { isCoreEvent } from './coreEvents.js';

// Bus d'événements interne au process (pas de file de messages externe —
// même choix que jobService.js). Les services du cœur émettent en
// best-effort en fin de flux réussi ; un abonné (handler de plugin) qui
// lève une erreur ne doit jamais faire échouer l'opération métier
// d'origine, ni empêcher les autres abonnés de recevoir l'événement.
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function emit(eventType, payload = {}) {
  if (!isCoreEvent(eventType)) {
    logger.warn({ eventType }, "Événement plugin émis hors du catalogue CORE_EVENTS — ignoré par le bus");
    return;
  }
  // Journalisation best-effort, avant diffusion : un abonné planté ne doit
  // jamais empêcher la trace de l'événement lui-même.
  if (pool) {
    query(`INSERT INTO plugin_events_log (plugin_id, event_type, payload) VALUES (NULL, $1, $2)`, [eventType, JSON.stringify(payload)])
      .catch((err) => logger.warn({ err, eventType }, "Échec de journalisation d'un événement plugin"));
  }
  emitter.emit(eventType, payload);
}

export function subscribe(eventType, handler) {
  if (!isCoreEvent(eventType)) {
    throw Object.assign(new Error(`Événement inconnu: ${eventType}`), { status: 400 });
  }
  const wrapped = async (payload) => {
    try {
      await handler(payload);
    } catch (err) {
      logger.error({ err, eventType }, "Erreur dans un abonné plugin à un événement — isolée, n'affecte pas les autres abonnés");
    }
  };
  emitter.on(eventType, wrapped);
  return () => emitter.off(eventType, wrapped);
}
