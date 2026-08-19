// Catalogue des événements du cœur NexUs auxquels un plugin peut s'abonner
// (eventBus.js). Liste fermée volontairement : un plugin ne peut pas
// inventer un type d'événement cœur, seulement en émettre sous son propre
// namespace `plugin.<pluginId>.<name>` (non couvert ici).
export const CORE_EVENTS = Object.freeze([
  'service.created',
  'service.updated',
  'environment.created',
  'environment.provisioned',
  'deployment.started',
  'deployment.completed',
  'deployment.failed',
  'deployment.rollback',
  'pipeline.started',
  'pipeline.completed',
  'preview.created',
  'preview.destroyed',
  'secret.updated',
  'user.created',
  'team.updated',
  'incident.created'
]);

export function isCoreEvent(type) {
  return CORE_EVENTS.includes(type);
}
