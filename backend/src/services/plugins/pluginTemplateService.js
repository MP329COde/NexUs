import { deflateRawSync, crc32 } from 'node:zlib';
import { buildCiWorkflow } from '../ciWorkflowService.js';
import { PLUGIN_PERMISSION_CATALOG } from './manifestSchema.js';

// Génère le contenu réel des fichiers du template officiel de plugin NexUs
// (Lot D8, point 1) — réutilisé à la fois par l'endpoint ZIP téléchargeable
// (routes/plugins.routes.js) et par toute future création de dépôt Git
// (point 7). Aucun texte générique : chaque fichier est produit à partir de
// l'id/nom/version réels fournis par l'appelant, jamais d'un exemple
// figé sans rapport avec le plugin demandé.

function defaultManifest({ id, name, version }) {
  return {
    id,
    name,
    version,
    apiVersion: '1.0',
    description: `Plugin NexUs "${name}" — généré depuis le template officiel.`,
    permissions: ['plugin:catalog.read'],
    contributes: {
      menus: [{ label: name, icon: 'puzzle' }],
      pages: [{ path: `/plugins/${id}`, label: name }]
    }
  };
}

function buildPackageJson({ id, name, version }) {
  return {
    name: `nexus-plugin-${id}`,
    version,
    description: `Plugin NexUs "${name}"`,
    type: 'module',
    private: true,
    scripts: {
      test: 'node --test'
    },
    main: 'src/index.js'
  };
}

function buildIndexJs({ id, name }) {
  return `// Point d'entrée d'exemple du plugin NexUs "${name}" (id: ${id}).
// Le socle NexUs actuel ne fait PAS exécuter ce fichier côté serveur — les
// contributions déclarées dans manifest.json (menus/pages/tabs/widgets/
// actions) sont ce que le cœur NexUs consomme réellement aujourd'hui. Ce
// fichier reste un exemple de structure pour préparer une future exécution
// de code de plugin, et documente comment le manifest est censé se lire.

export const plugin = {
  id: '${id}',
  name: '${name}',

  // Exemple de handler pour une contribution "actions" déclarée dans
  // manifest.json (si vous en ajoutez une) : reçoit le contexte NexUs
  // (utilisateur, permissions accordées) et ne doit jamais dépasser les
  // permissions listées dans manifest.json > permissions.
  async onAction(actionId, context) {
    console.log(\`[${id}] action déclenchée: \${actionId}\`, context);
  }
};

export default plugin;
`;
}

function buildTestJs({ id, name, version }) {
  return `// Test basique (node --test, aucune dépendance externe) qui valide que
// manifest.json parse et respecte le schéma minimal attendu par NexUs
// (backend/src/services/plugins/manifestSchema.js#validateManifest).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(new URL('../manifest.json', import.meta.url));

test('manifest.json parse en JSON valide', () => {
  const raw = readFileSync(manifestPath, 'utf8');
  assert.doesNotThrow(() => JSON.parse(raw));
});

test('manifest.json respecte le schéma minimal NexUs', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.id, '${id}');
  assert.equal(manifest.name, '${name}');
  assert.equal(manifest.version, '${version}');
  assert.match(manifest.id, /^[a-z0-9][a-z0-9-]*$/, 'id doit être en minuscules/chiffres/tirets');
  assert.ok(typeof manifest.apiVersion === 'string' && manifest.apiVersion.length > 0, 'apiVersion requise');
  if (manifest.permissions) {
    assert.ok(Array.isArray(manifest.permissions), 'permissions doit être un tableau');
  }
});
`;
}

function buildReadme({ id, name, version, manifest, fileTree }) {
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const permsBlock = permissions.length
    ? permissions.map((p) => `- \`${p}\`${PLUGIN_PERMISSION_CATALOG.includes(p) ? '' : ' (⚠️ hors catalogue NexUs — sera rejetée à l\'installation)'}`).join('\n')
    : '- (aucune permission déclarée)';
  const treeBlock = fileTree.map((f) => `${f}`).join('\n');
  return `# ${name}

Plugin NexUs — id \`${id}\`, version \`${version}\`.

Ce dépôt a été généré depuis le template officiel de plugin NexUs
(\`GET /api/plugins/template\`). Il contient un manifest valide, un exemple
de code d'entrée, un test \`node --test\` qui valide le manifest, et une
chaîne CI GitHub Actions réelle (build/test) prête à l'emploi.

## Structure du dépôt

\`\`\`
${treeBlock}
\`\`\`

## Manifest

- **id** : \`${id}\`
- **name** : \`${name}\`
- **version** : \`${version}\`
- **apiVersion** : \`${manifest.apiVersion}\`

### Permissions déclarées

${permsBlock}

Chaque permission demandée par ce plugin devra être **approuvée manuellement
par un administrateur NexUs** après installation (Paramètres → Plugins →
détail du plugin → Accorder/Refuser). Le plugin ne pourra pas être activé
tant qu'une permission déclarée reste en statut \`pending\` ou \`denied\`.

## Développement

Lancer les tests localement :

\`\`\`sh
node --test
\`\`\`

Installer ce plugin en mode développeur local sur une instance NexUs (le
dossier doit être accessible depuis le serveur backend) :

\`\`\`sh
curl -X POST http://localhost:4000/api/plugins/install-local \\
  -H "Content-Type: application/json" \\
  -H "Cookie: <cookie de session admin>" \\
  -d '{"path": "/chemin/absolu/vers/${id}"}'
\`\`\`

## Publication

1. Poussez ce dépôt sur GitHub, GitLab ou Gitea (le workflow CI ci-dessous
   s'exécute automatiquement à chaque push).
2. Installez-le depuis NexUs directement depuis le dépôt Git distant :

\`\`\`sh
curl -X POST http://localhost:4000/api/plugins/install-git \\
  -H "Content-Type: application/json" \\
  -H "Cookie: <cookie de session admin>" \\
  -d '{"repoUrl": "https://github.com/<votre-compte>/<votre-repo>", "ref": "main"}'
\`\`\`

Le fichier \`manifest.json\` doit rester à la racine du dépôt, sur la
branche/ref passée en \`ref\` (par défaut \`main\`).
`;
}

// Fichiers du template, sous forme { path: contenu (string) }. L'ordre
// reflète l'arborescence réellement produite dans le ZIP.
export function buildPluginTemplateFiles({ id, name, version = '0.1.0' } = {}) {
  const pluginId = (id && String(id).trim()) || 'mon-plugin';
  const pluginName = (name && String(name).trim()) || 'Mon plugin';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(pluginId)) {
    throw Object.assign(new Error("id invalide : lettres minuscules, chiffres, tirets, ne doit pas commencer par un tiret"), { status: 400 });
  }

  const manifest = defaultManifest({ id: pluginId, name: pluginName, version });
  const packageJson = buildPackageJson({ id: pluginId, name: pluginName, version });
  const ciWorkflow = buildCiWorkflow({ stack: ['Node.js / JavaScript'], packageManager: 'npm', hasDockerfile: false });

  const fileTree = [
    'manifest.json',
    'package.json',
    'README.md',
    '.github/workflows/ci.yml',
    'src/index.js',
    'test/plugin.test.js'
  ];

  const readme = buildReadme({ id: pluginId, name: pluginName, version, manifest, fileTree });

  return {
    'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
    'README.md': readme,
    '.github/workflows/ci.yml': ciWorkflow,
    'src/index.js': buildIndexJs({ id: pluginId, name: pluginName }),
    'test/plugin.test.js': buildTestJs({ id: pluginId, name: pluginName, version })
  };
}

// --- Écriture ZIP minimale, sans dépendance externe -------------------
// Aucune lib zip (archiver/adm-zip/jszip) n'est présente dans
// backend/package.json (vérifié avant d'écrire ce module) : on construit un
// vrai fichier ZIP (format PKZIP standard, méthode DEFLATE) à la main avec
// node:zlib (deflateRawSync + crc32, tous deux natifs depuis Node 22),
// plutôt que d'ajouter une dépendance pour un besoin aussi simple.
function toDosTime(date) {
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

export function buildZip(files) {
  const now = new Date();
  const { dosTime, dosDate } = toDosTime(now);
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [path, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(path, 'utf8');
    const dataBuf = Buffer.from(content, 'utf8');
    const compressed = deflateRawSync(dataBuf);
    const crc = crc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // method = deflate
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(8, 10); // method
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBuf);

    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralDirStart = offset;
  const centralDirBuf = Buffer.concat(centralParts);
  const centralDirSize = centralDirBuf.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirStart, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuf, eocd]);
}

export function buildPluginTemplateZip(options) {
  const files = buildPluginTemplateFiles(options);
  return buildZip(files);
}
