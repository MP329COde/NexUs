import { getEnvironment, setEnvironmentArgocdApp, recordPromotion, listPromotions as listPromotionsStore, listEnvironments } from '../store/orgStore.js';
import { getApplication, syncApplication } from './integrations/argocdService.js';
import { IntegrationError } from './integrations/httpClient.js';

// Promotion réelle entre environnements : jamais de "version" inventée. Un
// environnement doit être lié à une application Argo CD existante (voir
// setEnvironmentArgocdApp) — la promotion lit alors l'état réel de
// l'environnement source (revision Git actuellement synchronisée, via
// l'API Argo CD) et synchronise l'application de l'environnement cible sur
// exactement cette revision, avant de consigner le résultat réel (succès ou
// erreur Argo CD) dans environment_promotions.
export async function listEnvironmentsWithStatus(projectId) {
  const envs = await listEnvironments(projectId);
  return Promise.all(envs.map(async (env) => {
    if (!env.argocd_app) return { ...env, app: null };
    try {
      const app = await getApplication(env.argocd_app);
      return {
        ...env,
        app: {
          syncStatus: app.status?.sync?.status || null,
          healthStatus: app.status?.health?.status || null,
          revision: app.status?.sync?.revision?.slice(0, 7) || null,
          targetRevision: app.spec?.source?.targetRevision || null
        }
      };
    } catch (err) {
      return { ...env, app: { error: err.message } };
    }
  }));
}

export async function linkEnvironment(environmentId, argocdApp) {
  if (argocdApp) {
    await getApplication(argocdApp); // 404 réel si l'application n'existe pas — jamais un lien vers rien
  }
  const env = await setEnvironmentArgocdApp(environmentId, argocdApp);
  if (!env) throw Object.assign(new Error('Environnement introuvable'), { status: 404 });
  return env;
}

export async function promote({ projectId, fromEnvironmentId, toEnvironmentId, triggeredBy }) {
  const toEnv = await getEnvironment(toEnvironmentId);
  if (!toEnv || toEnv.project_id !== projectId) throw Object.assign(new Error('Environnement cible introuvable'), { status: 404 });
  if (!toEnv.argocd_app) throw Object.assign(new Error('Environnement cible non lié à une application Argo CD'), { status: 409 });

  let revision;
  if (fromEnvironmentId) {
    const fromEnv = await getEnvironment(fromEnvironmentId);
    if (!fromEnv || fromEnv.project_id !== projectId) throw Object.assign(new Error('Environnement source introuvable'), { status: 404 });
    if (!fromEnv.argocd_app) throw Object.assign(new Error('Environnement source non lié à une application Argo CD'), { status: 409 });
    const fromApp = await getApplication(fromEnv.argocd_app);
    revision = fromApp.status?.sync?.revision;
    if (!revision) throw Object.assign(new Error("Impossible de déterminer la revision actuelle de l'environnement source"), { status: 409 });
  }

  try {
    await syncApplication(toEnv.argocd_app, revision);
    return recordPromotion({
      projectId, fromEnvironmentId: fromEnvironmentId || null, toEnvironmentId,
      argocdApp: toEnv.argocd_app, revision: revision || null, status: 'synced',
      message: revision ? `Synchronisé sur ${revision.slice(0, 7)}` : 'Synchronisation déclenchée', triggeredBy
    });
  } catch (err) {
    const message = err instanceof IntegrationError ? err.message : (err.message || 'Échec de la synchronisation');
    await recordPromotion({
      projectId, fromEnvironmentId: fromEnvironmentId || null, toEnvironmentId,
      argocdApp: toEnv.argocd_app, revision: revision || null, status: 'error', message, triggeredBy
    });
    throw Object.assign(new Error(message), { status: 502 });
  }
}

export function listPromotions(projectId) {
  return listPromotionsStore(projectId);
}
