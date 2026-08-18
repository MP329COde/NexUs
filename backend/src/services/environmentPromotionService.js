import { getEnvironment, setEnvironmentArgocdApp, recordPromotion, getPromotion, listPromotions as listPromotionsStore, listEnvironments, getProject, listPoliciesForOrg, listComponentsForProject } from '../store/orgStore.js';
import { getApplication, syncApplication, upsertApplication } from './integrations/argocdService.js';
import { IntegrationError } from './integrations/httpClient.js';
import { listScans as listCodeScans } from '../store/codeScansStore.js';
import { listScans as listDastScans } from '../store/dastScansStore.js';
import { evaluatePolicies } from './policyEngine.js';

// Security Gate réel (pas seulement l'indicateur visuel de Supply Chain
// Security) : bloque une promotion vers un environnement de production si
// le dernier scan Semgrep contient au moins une ERROR ou le dernier scan
// OWASP ZAP au moins une alerte High — mêmes seuils que le panneau affiché
// à l'admin, appliqués ici avant l'appel réel à Argo CD plutôt qu'après
// coup. Silencieux (ne bloque rien) si aucun scan n'a jamais été lancé :
// on ne pénalise pas une instance qui n'a pas encore de scanner configuré.
function checkSecurityGate() {
  const lastCode = listCodeScans()[0];
  const lastDast = listDastScans()[0];
  const semgrepErrors = lastCode?.counts?.ERROR ?? 0;
  const zapHigh = lastDast?.counts?.High ?? 0;
  if (semgrepErrors > 0) {
    return `Security Gate : ${semgrepErrors} erreur(s) Semgrep sur le dernier scan de code (voir Supply Chain Security).`;
  }
  if (zapHigh > 0) {
    return `Security Gate : ${zapHigh} alerte(s) à risque élevé sur le dernier scan OWASP ZAP (voir Supply Chain Security).`;
  }
  return null;
}

// Policy Gate (ÉTAPE 16 IDP) : en plus du Security Gate ci-dessus, bloque la
// promotion si un composant du Software Catalog RATTACHÉ À CE PROJET
// échoue une policy activée de son organisation (voir services/policyEngine.js).
// Silencieux si le projet n'a encore aucun composant déclaré au catalogue —
// même principe que le Security Gate sans scan : on ne pénalise jamais une
// absence de données, seulement un signal réel et défavorable. S'arrête au
// premier composant en échec (message actionnable plutôt qu'un mur de
// texte) ; l'admin retrouve le détail complet sur la fiche du composant
// concerné (panneau Policy Engine, CatalogComponentPage.jsx).
async function checkPolicyGate(projectId) {
  const project = await getProject(projectId);
  if (!project) return null;
  const [policies, components] = await Promise.all([
    listPoliciesForOrg(project.org_id),
    listComponentsForProject(projectId)
  ]);
  for (const component of components) {
    const { allowed, results } = evaluatePolicies(component, policies);
    if (!allowed) {
      const failed = results.filter((r) => !r.passed).map((r) => r.name).join(', ');
      return `Policy Gate : composant "${component.name}" bloqué (${failed}) — voir sa fiche dans le Software Catalog.`;
    }
  }
  return null;
}

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

// Crée (ou met à jour) réellement l'Application dans Argo CD pour un
// environnement du socle relationnel, puis le lie — équivalent, pour les
// environnements relationnels, de POST /deployments/:id/provision-argocd-app
// (routes/deployments.routes.js) sur le socle legacy. Contrairement au
// legacy, un environnement relationnel n'est pas rattaché à UN dépôt : le
// dépôt source reste un choix explicite de l'appelant (repoURL), un projet
// pouvant porter plusieurs composants avec des dépôts différents. Le
// namespace cible retombe sur celui déjà réellement provisionné depuis un
// blueprint (voir environmentProvisioningService.js) si aucun n'est fourni
// explicitement — jamais un namespace deviné au hasard.
export async function provisionArgocdApp(environmentId, projectSlug, { appName, repoURL, path, targetRevision, destinationNamespace, automatedSync }) {
  const env = await getEnvironment(environmentId);
  if (!env) throw Object.assign(new Error('Environnement introuvable'), { status: 404 });
  if (!repoURL) throw Object.assign(new Error('repoURL requis (dépôt source des manifestes)'), { status: 400 });
  const namespace = destinationNamespace || env.provisioned_namespace;
  if (!namespace) throw Object.assign(new Error('destinationNamespace requis (aucun namespace déjà provisionné pour cet environnement)'), { status: 400 });

  const name = (appName || `${projectSlug}-${env.name}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  await upsertApplication({
    name, repoURL, path: path || '.', targetRevision: targetRevision || 'HEAD',
    destinationNamespace: namespace, automatedSync: automatedSync !== false
  });
  return linkEnvironment(environmentId, name);
}

export async function promote({ projectId, fromEnvironmentId, toEnvironmentId, triggeredBy }) {
  const toEnv = await getEnvironment(toEnvironmentId);
  if (!toEnv || toEnv.project_id !== projectId) throw Object.assign(new Error('Environnement cible introuvable'), { status: 404 });
  if (!toEnv.argocd_app) throw Object.assign(new Error('Environnement cible non lié à une application Argo CD'), { status: 409 });

  if (toEnv.is_production) {
    const gateError = checkSecurityGate();
    if (gateError) {
      await recordPromotion({
        projectId, fromEnvironmentId: fromEnvironmentId || null, toEnvironmentId,
        argocdApp: toEnv.argocd_app, revision: null, status: 'blocked', message: gateError, triggeredBy
      });
      throw Object.assign(new Error(gateError), { status: 422 });
    }

    const policyError = await checkPolicyGate(projectId);
    if (policyError) {
      await recordPromotion({
        projectId, fromEnvironmentId: fromEnvironmentId || null, toEnvironmentId,
        argocdApp: toEnv.argocd_app, revision: null, status: 'blocked', message: policyError, triggeredBy
      });
      throw Object.assign(new Error(policyError), { status: 422 });
    }
  }

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

// Rollback réel (ÉTAPE 17 IDP) : jamais une "version" devinée ou
// reconstruite depuis Git — uniquement une revision RÉELLEMENT synchronisée
// à un moment donné, retrouvée dans l'historique de promotions déjà
// enregistré (environment_promotions.revision, écrit après un vrai succès
// Argo CD). Resynchronise l'environnement sur exactement cette revision et
// consigne le résultat comme une entrée d'historique à part (is_rollback),
// avec un lien vers la promotion restaurée (rollback_of) — jamais un
// "rollback terminé" avant confirmation réelle d'Argo CD.
export async function rollbackEnvironment({ projectId, environmentId, toPromotionId, triggeredBy }) {
  const env = await getEnvironment(environmentId);
  if (!env || env.project_id !== projectId) throw Object.assign(new Error('Environnement introuvable'), { status: 404 });
  if (!env.argocd_app) throw Object.assign(new Error('Environnement non lié à une application Argo CD'), { status: 409 });

  const target = await getPromotion(toPromotionId);
  if (!target || target.project_id !== projectId || target.to_environment_id !== environmentId) {
    throw Object.assign(new Error('Promotion cible introuvable pour cet environnement'), { status: 404 });
  }
  if (target.status !== 'synced' || !target.revision) {
    throw Object.assign(new Error('Cette entrée d\'historique ne correspond à aucune synchronisation réussie — rien à restaurer'), { status: 409 });
  }

  try {
    await syncApplication(env.argocd_app, target.revision);
    return recordPromotion({
      projectId, fromEnvironmentId: null, toEnvironmentId: environmentId,
      argocdApp: env.argocd_app, revision: target.revision, status: 'synced',
      message: `Rollback vers ${target.revision.slice(0, 7)} (promotion du ${new Date(target.created_at).toLocaleString('fr-FR')})`,
      triggeredBy, isRollback: true, rollbackOf: target.id
    });
  } catch (err) {
    const message = err instanceof IntegrationError ? err.message : (err.message || 'Échec du rollback');
    await recordPromotion({
      projectId, fromEnvironmentId: null, toEnvironmentId: environmentId,
      argocdApp: env.argocd_app, revision: target.revision, status: 'error', message,
      triggeredBy, isRollback: true, rollbackOf: target.id
    });
    throw Object.assign(new Error(message), { status: 502 });
  }
}
