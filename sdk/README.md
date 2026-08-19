# @nexus/plugin-sdk

SDK TypeScript pour développer des plugins NexUs : types du manifest
(`PluginManifest`), du contexte d'exécution backend (`PluginContext`), et
les catalogues fermés du cœur (événements, hooks, permissions) — voir
`src/index.d.ts` pour les types et `src/index.js` pour les valeurs et la
validation à l'exécution.

Miroir volontairement réduit de `backend/src/services/plugins/` : la
validation serveur à l'installation (`POST /api/plugins/install`) reste la
source de vérité finale, ce paquet permet seulement un retour rapide en
local ou en CI, sans backend NexUs à portée.

## Installation

Dans le développement local d'un plugin généré par `nexus plugin create`
(voir `cli/`) :

```bash
npm install @nexus/plugin-sdk
```

## Usage

```ts
import { validateManifest, type PluginManifest, type PluginContext } from '@nexus/plugin-sdk';
import manifest from './manifest.json' with { type: 'json' };

const { valid, errors } = validateManifest(manifest);
if (!valid) throw new Error(errors.join('\n'));
```

```ts
// backend/index.js du plugin — signature de PluginBackendModule
import type { PluginContext } from '@nexus/plugin-sdk';

export default function register(ctx: PluginContext) {
  ctx.registerHook('afterServiceCreate', async (context) => {
    // ...
  });
  ctx.subscribeEvent('deployment.completed', async (payload) => {
    // ...
  });
}
```

## Tests

```bash
npm test
```
