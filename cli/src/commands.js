import { createClient, login as apiLogin, ApiError } from './apiClient.js';
import { loadConfig, saveConfig, clearConfig } from './config.js';
import { promptHiddenPassword } from './prompt.js';
import { formatTable } from './format.js';

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

export async function cmdLogin([baseUrl, identifier], { home } = {}) {
  if (!baseUrl || !identifier) throw new Error('Usage : nexus login <url> <email-ou-identifiant>');
  const password = await promptHiddenPassword('Mot de passe : ');
  const { token, user } = await apiLogin(baseUrl.replace(/\/$/, ''), identifier, password);
  saveConfig({ baseUrl: baseUrl.replace(/\/$/, ''), token, email: user?.email || identifier }, home);
  return `Connecté en tant que ${user?.email || identifier} (${baseUrl}).`;
}

export function cmdLogout(_args, { home } = {}) {
  const cleared = clearConfig(home);
  return cleared ? 'Déconnecté (session locale effacée).' : 'Aucune session locale à effacer.';
}

export async function cmdWhoami(_args, { home } = {}) {
  const { client } = requireClient(home);
  const data = await client.get('/auth/me');
  return `${data.user.email} (rôle : ${data.user.role})`;
}

export async function cmdCatalogList(args, { home } = {}) {
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

export async function cmdServiceGet([componentId], { home } = {}) {
  if (!componentId) throw new Error('Usage : nexus service get <componentId>');
  const { client } = requireClient(home);
  const data = await client.get(`/catalog/components/${componentId}`);
  return JSON.stringify(data.component, null, 2);
}

export async function cmdEnvList([legacyProjectId], { home } = {}) {
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
  logs: cmdLogs
};

export { ApiError };
