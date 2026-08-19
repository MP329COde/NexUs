// Génère le squelette d'un plugin NexUs (`nexus plugin create <name>`) :
// un manifest valide dès la génération (voir pluginManifest.js) et
// l'arborescence attendue par le registre backend, pour que le
// développeur enchaîne directement `nexus plugin validate` puis
// `nexus plugin install` sans étape de configuration manuelle.
export function manifestFor(name) {
  return {
    id: name,
    name: name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '),
    version: '0.1.0',
    apiVersion: '1.0',
    minNexusVersion: '0.1.0',
    permissions: [],
    contributes: { menus: [], pages: [], tabs: [], widgets: [], actions: [] },
    backend: 'backend/index.js',
    frontend: 'frontend/index.js'
  };
}

export function templateFiles(name) {
  const manifest = manifestFor(name);
  return {
    'manifest.json': JSON.stringify(manifest, null, 2) + '\n',
    'package.json': JSON.stringify({ name: `nexus-plugin-${name}`, version: '0.1.0', private: true, type: 'module' }, null, 2) + '\n',
    'README.md': `# ${manifest.name}\n\nPlugin NexUs généré par \`nexus plugin create ${name}\`.\n\n## Développement\n\n\`\`\`\nnexus plugin validate .\nnexus plugin install .\n\`\`\`\n`,
    'backend/index.js': `// Point d'entrée backend du plugin — enregistré par le registre NexUs\n// (voir backend/src/services/plugins/pluginRegistry.js) une fois activé.\nexport default function register(ctx) {\n  // ctx.registerHook('afterServiceCreate', async (context) => { ... });\n  // ctx.subscribeEvent('deployment.completed', async (payload) => { ... });\n}\n`,
    'frontend/index.js': `// Point d'entrée frontend du plugin — points d'extension UI déclarés dans\n// manifest.json (contributes.menus/pages/tabs/widgets/actions).\nexport default {};\n`,
    'migrations/.gitkeep': '',
    'tests/.gitkeep': ''
  };
}
