import fs from 'node:fs';
import path from 'node:path';
import { createClient, login as apiLogin, ApiError } from './apiClient.js';
import { loadConfig, saveConfig, clearConfig } from './config.js';
import { promptHiddenPassword } from './prompt.js';
import { formatTable } from './format.js';
import { validateManifest } from './pluginManifest.js';
import { templateFiles } from './pluginTemplate.js';

// Chaque commande fait un ou plusieurs vrais appels à l'API existante de la
// console (aucune route inventée pour le CLI) — voir README.md pour la
// correspondance commande → endpoint. requireClient() échoue explicitement
// si aucune session n'a été établie, jamais un appel anonyme silencieux.
function requireClient(home) {
  const config = loadConfig(home);
  if (!config?.token || !config?.baseUrl) {
    throw new Error('Non connecté — lancez `nexus login <url> <email>` d\'abord.');
  }
  return { client: createClient(config), config };
}

export async function cmdLogin([baseUrl, identifier], _opts, { home } = {}) {
  if (!baseUrl || !identifier) throw new Error('Usage : nexus login <url> <email-ou-identifiant>');
  const password = await promptHiddenPassword('Mot de passe : ');
  const { token, user } = await apiLogin(baseUrl.replace(/\/$/, ''), identifier, password);
  saveConfig({ baseUrl: baseUrl.replace(/\/$/, ''), token, email: user?.email || identifier }, home);
  return `Connecté en tant que ${user?.email || identifier} (${baseUrl}).`;
}

export function cmdLogout(_args, _opts, { home } = {}) {
  const cleared = clearConfig(home);
  return cleared ? 'Déconnecté (session locale effacée).' : 'Aucune session locale à effacer.';
}

export async function cmdWhoami(_args, _opts, { home } = {}) {
  const { client } = requireClient(home);
  const data = await client.get('/auth/me');
  return `${data.user.email} (rôle : ${data.user.role})`;
}

export async function cmdCatalogList(args, _opts, { home } = {}) {
  const { client } = requireClient(home);
  const data = await client.get('/catalog/components');
  return formatTable(data.items, [
    { header: 'ID', value: (c) => c.id },
    { header: 'NOM', value: (c) => c.name },
    { header: 'TYPE', value: (c) => c.kind },
    { header: 'CYCLE DE VIE', value: (c) => c.lifecycle },
    { header: 'PROJET', value: (c) => c.project_name || '' }
  ]);
}

export async function cmdServiceGet([componentId], _opts, { home } = {}) {
  if (!componentId) throw new Error('Usage : nexus service get <componentId>');
  const { client } = requireClient(home);
  const data = await client.get(`/catalog/components/${componentId}`);
  return JSON.stringify(data.component, null, 2);
}

export async function cmdEnvList([legacyProjectId], _opts, { home } = {}) {
  if (!legacyProjectId) throw new Error('Usage : nexus env list <legacyProjectId>');
  const { client } = requireClient(home);
  const data = await client.get(`/projects/${legacyProjectId}/environments`);
  return formatTable(data.items, [
    { header: 'ID', value: (e) => e.id },
    { header: 'NOM', value: (e) => e.name },
    { header: 'TYPE', value: (e) => (e.is_production ? 'production' : e.kind) },
    { header: 'APP ARGO CD', value: (e) => e.argocd_app || '—' }
  ]);
}

export async function cmdDeploy([legacyProjectId, linkId], opts, { home } = {}) {
  if (!legacyProjectId || !linkId) throw new Error('Usage : nexus deploy <legacyProjectId> <linkId> [--revision <rev>]');
  const { client } = requireClient(home);
  const data = await client.post(`/projects/${legacyProjectId}/deployments/${linkId}/sync`, { revision: opts?.revision || null });
  return `Job de synchronisation créé : ${data.job?.id || '(exécuté directement)'}`;
}

export async function cmdPromote([legacyProjectId, envId], opts, { home } = {}) {
  if (!legacyProjectId || !envId) throw new Error('Usage : nexus promote <legacyProjectId> <envId> [--from <fromEnvironmentId>]');
  const { client } = requireClient(home);
  const data = await client.post(`/projects/${legacyProjectId}/environments/${envId}/promote`, { fromEnvironmentId: opts?.from || null });
  return `Promotion ${data.promotion.status} — ${data.promotion.message}`;
}

export async function cmdRollback([legacyProjectId, envId, toPromotionId], _opts, { home } = {}) {
  if (!legacyProjectId || !envId || !toPromotionId) throw new Error('Usage : nexus rollback <legacyProjectId> <envId> <toPromotionId>');
  const { client } = requireClient(home);
  const data = await client.post(`/projects/${legacyProjectId}/environments/${envId}/rollback`, { toPromotionId });
  return `Rollback ${data.rollback.status} — ${data.rollback.message}`;
}

export async function cmdLogs([namespace, pod], opts, { home } = {}) {
  if (!namespace || !pod) throw new Error('Usage : nexus logs <namespace> <pod> [--tail <n>]');
  const { client } = requireClient(home);
  const tail = opts?.tail ? `?tail=${encodeURIComponent(opts.tail)}` : '';
  const data = await client.get(`/kubernetes/pods/${namespace}/${pod}/logs${tail}`);
  return data.logs ?? JSON.stringify(data);
}

// --- Plugins (Lot 3 : outillage local + install via l'API du Lot 1) ---
//
// create/validate/build sont purement locaux (aucun réseau) : un
// développeur doit pouvoir itérer sur son manifest sans instance NexUs à
// portée. install/remove parlent au registre réel (POST/DELETE /plugins).

function readManifest(dir) {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Aucun manifest.json dans ${dir}`);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`manifest.json invalide : ${err.message}`);
  }
  return manifest;
}

export function cmdPluginCreate([name]) {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error('Usage : nexus plugin create <nom> (lettres minuscules, chiffres, tirets)');
  }
  const dir = path.resolve(name);
  if (fs.existsSync(dir)) throw new Error(`${dir} existe déjà`);
  const files = templateFiles(name);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return `Plugin créé dans ${dir}\n\nProchaine étape :\n  cd ${name}\n  nexus plugin validate .\n  nexus plugin install .`;
}

export function cmdPluginValidate([dir = '.']) {
  const manifest = readManifest(path.resolve(dir));
  const { valid, errors } = validateManifest(manifest);
  if (!valid) throw new Error(`Manifest invalide :\n  - ${errors.join('\n  - ')}`);
  return `Manifest valide : ${manifest.id}@${manifest.version}`;
}

// Aucun bundler n'est intégré à ce lot (pas de build JS réel à produire pour
// un plugin backend/frontend en ESM natif) : `build` se limite à la
// vérification qui compte réellement avant publication — un manifest
// valide et les points d'entrée déclarés présents sur disque.
export function cmdPluginBuild([dir = '.']) {
  const resolved = path.resolve(dir);
  const manifest = readManifest(resolved);
  const { valid, errors } = validateManifest(manifest);
  if (!valid) throw new Error(`Manifest invalide :\n  - ${errors.join('\n  - ')}`);
  const missing = [manifest.backend, manifest.frontend]
    .filter(Boolean)
    .filter((entry) => !fs.existsSync(path.join(resolved, entry)));
  if (missing.length) throw new Error(`Point(s) d'entrée manquant(s) : ${missing.join(', ')}`);
  return `${manifest.id}@${manifest.version} — prêt (manifest valide, points d'entrée présents)`;
}

export async function cmdPluginInstall([dir = '.'], _opts, { home } = {}) {
  const manifest = readManifest(path.resolve(dir));
  const { valid, errors } = validateManifest(manifest);
  if (!valid) throw new Error(`Manifest invalide :\n  - ${errors.join('\n  - ')}`);
  const { client } = requireClient(home);
  const data = await client.post('/plugins/install', { manifest });
  return `Plugin installé : ${data.plugin.id}@${data.plugin.version} (statut : ${data.plugin.status})`;
}

// Le registre (Lot 1) ne distingue pas encore une opération "update" d'un
// réinstall — désinstaller puis réinstaller avec le manifest local est donc
// la seule voie honnête aujourd'hui plutôt que de prétendre à une mise à
// jour en place non implémentée côté serveur.
export async function cmdPluginUpdate([dir = '.'], opts, ctx) {
  const manifest = readManifest(path.resolve(dir));
  const { client } = requireClient(ctx?.home);
  await client.del(`/plugins/${manifest.id}`).catch(() => {}); // absent au premier déploiement : pas une erreur
  return cmdPluginInstall([dir], opts, ctx);
}

export async function cmdPluginRemove([id], _opts, { home } = {}) {
  if (!id) throw new Error('Usage : nexus plugin remove <id>');
  const { client } = requireClient(home);
  await client.del(`/plugins/${id}`);
  return `Plugin désinstallé : ${id}`;
}

// Rechargement à chaud honnête : le registre backend ne charge pas encore de
// code de plugin à l'exécution (Lot 1 stocke le manifest, pas le
// code — voir pluginRegistry.js), donc "hot reload" ici revalide et
// réinstalle le manifest à chaque sauvegarde plutôt que de simuler un
// remplacement de code qui n'existe pas encore côté serveur.
export async function cmdPluginDev([dir = '.'], opts, ctx) {
  const resolved = path.resolve(dir);
  const manifestPath = path.join(resolved, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Aucun manifest.json dans ${resolved}`);

  async function sync() {
    try {
      const result = await cmdPluginUpdate([resolved], opts, ctx);
      console.log(`[dev] ${new Date().toLocaleTimeString('fr-FR')} — ${result}`);
    } catch (err) {
      console.error(`[dev] ${new Date().toLocaleTimeString('fr-FR')} — erreur : ${err.message}`);
    }
  }

  console.log(`Mode développement — surveillance de ${resolved} (Ctrl+C pour arrêter)`);
  await sync();
  fs.watch(resolved, { recursive: true }, (_event, filename) => {
    if (filename) sync();
  });
  return new Promise(() => {}); // reste actif jusqu'à interruption manuelle
}

export const COMMANDS = {
  login: cmdLogin,
  logout: cmdLogout,
  whoami: cmdWhoami,
  'catalog:list': cmdCatalogList,
  'service:get': cmdServiceGet,
  'env:list': cmdEnvList,
  deploy: cmdDeploy,
  promote: cmdPromote,
  rollback: cmdRollback,
  logs: cmdLogs,
  'plugin:create': cmdPluginCreate,
  'plugin:validate': cmdPluginValidate,
  'plugin:build': cmdPluginBuild,
  'plugin:install': cmdPluginInstall,
  'plugin:update': cmdPluginUpdate,
  'plugin:remove': cmdPluginRemove,
  'plugin:dev': cmdPluginDev
};

export { ApiError };
