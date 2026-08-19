/**
 * Types TypeScript du manifest et du runtime des plugins NexUs.
 * Miroir de backend/src/services/plugins/{manifestSchema,coreEvents,hookRegistry}.js
 * — voir index.js pour les catalogues fermés correspondants (valeurs à l'exécution).
 */

/** Format d'une permission plugin : "plugin:<domaine>.<niveau>", limité au catalogue fermé PLUGIN_PERMISSION_CATALOG. */
export type PluginPermission =
  | 'plugin:catalog.read' | 'plugin:catalog.write'
  | 'plugin:kubernetes.read' | 'plugin:kubernetes.write'
  | 'plugin:secrets.read'
  | 'plugin:deployment.create'
  | 'plugin:network.read'
  | 'plugin:projects.read' | 'plugin:projects.write'
  | 'plugin:notifications.write';

/** Événement du cœur NexUs auquel un plugin peut s'abonner (eventBus.js). */
export type CoreEventType =
  | 'service.created' | 'service.updated'
  | 'environment.created' | 'environment.provisioned'
  | 'deployment.started' | 'deployment.completed' | 'deployment.failed' | 'deployment.rollback'
  | 'pipeline.started' | 'pipeline.completed'
  | 'preview.created' | 'preview.destroyed'
  | 'secret.updated'
  | 'user.created'
  | 'team.updated'
  | 'incident.created';

/** Hook avant/après une opération sensible du cœur (hookRegistry.js). */
export type CoreHookName =
  | 'beforeServiceCreate' | 'afterServiceCreate'
  | 'beforeDeployment' | 'afterDeployment'
  | 'beforeEnvironmentCreate' | 'afterEnvironmentCreate'
  | 'beforeProvision' | 'afterProvision'
  | 'beforeRollback' | 'afterRollback';

export interface PluginContribution {
  label: string;
  [key: string]: unknown;
}

export interface PluginContributes {
  menus?: PluginContribution[];
  pages?: PluginContribution[];
  tabs?: PluginContribution[];
  widgets?: PluginContribution[];
  actions?: PluginContribution[];
}

/** manifest.json d'un plugin — voir `nexus plugin create` (cli/) pour le squelette généré. */
export interface PluginManifest {
  /** Identifiant unique, minuscules/chiffres/tirets, ne commence jamais par un tiret. */
  id: string;
  name: string;
  version: string;
  /** Version de l'API plugin ciblée (pas la version de NexUs lui-même). */
  apiVersion: string;
  minNexusVersion?: string;
  maxNexusVersion?: string;
  /** Sous-ensemble de PLUGIN_PERMISSION_CATALOG — jamais d'héritage admin automatique. */
  permissions?: PluginPermission[];
  contributes?: PluginContributes;
  /** Chemin relatif vers le point d'entrée backend (voir PluginBackendModule). */
  backend?: string;
  /** Chemin relatif vers le point d'entrée frontend. */
  frontend?: string;
  /** { pluginId: versionRange } */
  dependencies?: Record<string, string>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Contexte injecté au point d'entrée backend d'un plugin (voir PluginBackendModule). */
export interface PluginContext {
  pluginId: string;
  registerHook(name: CoreHookName, handler: (context: Record<string, unknown>) => void | Promise<void>): () => void;
  subscribeEvent(type: CoreEventType, handler: (payload: Record<string, unknown>) => void | Promise<void>): () => void;
}

/** Signature attendue de l'export par défaut du point d'entrée backend (manifest.backend). */
export type PluginBackendModule = (ctx: PluginContext) => void | Promise<void>;

export declare const CORE_EVENTS: readonly CoreEventType[];
export declare const CORE_HOOKS: readonly CoreHookName[];
export declare const PLUGIN_PERMISSION_CATALOG: readonly PluginPermission[];

export declare function validateManifest(manifest: unknown): ValidationResult;
export declare function isCoreEvent(type: string): type is CoreEventType;
export declare function isCoreHook(name: string): name is CoreHookName;
