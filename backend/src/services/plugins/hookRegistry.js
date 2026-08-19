import { logger } from '../../utils/logger.js';

// Hooks avant/après les opérations sensibles du cœur : contrairement à
// eventBus.js (notification best-effort après coup), un hook `before*` peut
// bloquer ou faire échouer l'opération (en levant une erreur), un hook
// `after*` s'exécute une fois l'opération déjà réussie. Liste fermée, comme
// CORE_EVENTS — un plugin ne peut pas déclarer son propre point d'ancrage
// dans le cœur.
export const CORE_HOOKS = Object.freeze([
  'beforeServiceCreate', 'afterServiceCreate',
  'beforeDeployment', 'afterDeployment',
  'beforeEnvironmentCreate', 'afterEnvironmentCreate',
  'beforeProvision', 'afterProvision',
  'beforeRollback', 'afterRollback'
]);

const handlers = new Map(CORE_HOOKS.map((name) => [name, []]));

export function registerHook(name, handler) {
  if (!handlers.has(name)) throw Object.assign(new Error(`Hook inconnu: ${name}`), { status: 400 });
  handlers.get(name).push(handler);
  return () => {
    const list = handlers.get(name);
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  };
}

// Séquentiel et isolé : un hook `before*` qui lève interrompt la chaîne (et
// donc l'opération appelante, volontairement) ; un hook `after*` qui lève
// est seulement journalisé, l'opération d'origine ayant déjà réussi.
export async function runHooks(name, context = {}) {
  const list = handlers.get(name) || [];
  for (const handler of list) {
    try {
      await handler(context);
    } catch (err) {
      if (name.startsWith('before')) throw err;
      logger.error({ err, hook: name }, "Erreur dans un hook 'after' de plugin — isolée");
    }
  }
}
