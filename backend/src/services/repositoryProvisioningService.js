import * as github from './integrations/githubService.js';
import * as githubPlatform from './integrations/githubPlatformService.js';
import * as gitlab from './integrations/gitlabService.js';
import * as repoSetup from './integrations/githubRepoSetup.js';
import * as repoStore from '../store/managedRepositoriesStore.js';
import * as orgStore from '../store/orgStore.js';
import { IntegrationError } from './integrations/httpClient.js';

// Provisioning réel d'un dépôt (Priorité 1 — "Ne plus laisser les demandes
// en état pending sans créer réellement le dépôt"). Prend le relais de
// createProvisioningRequest() (store, toujours 'pending' en sortie) :
// appelée explicitement depuis POST /repository-provisioning/:id/provision.
// Ne prétend jamais un succès partiel : chaque étape annexe (protection,
// labels, webhook, variables CI, équipe) est best-effort et son échec est
// consigné dans status_detail sans faire échouer la demande entière — seule
// l'échec de la CRÉATION du dépôt fait passer status à 'failed'.
export async function provision(managedRepo) {
  const { provider, account, owner, name, team_slug: teamSlug, ci_variables: ciVariables, project_id: projectId } = managedRepo;

  let webhookUrl = null;
  let webhookSecret = null;
  if (projectId) {
    const project = await orgStore.getProject(projectId).catch(() => null);
    if (project?.legacy_id && project.webhook_secret) {
      webhookSecret = project.webhook_secret;
      const base = process.env.PUBLIC_BACKEND_URL || '';
      webhookUrl = base ? `${base.replace(/\/$/, '')}/api/webhooks/${provider === 'gitlab' ? 'gitlab' : 'github'}/${project.legacy_id}` : null;
    }
  }

  const warnings = [];
  let repo;

  if (provider === 'github') {
    const service = account === 'platform' ? githubPlatform : github;
    const c = service.getClient();
    if (!c) throw new IntegrationError(`GitHub (${account === 'platform' ? 'compte plateforme' : 'compte personnel'}) non configuré`, { status: 409 });

    repo = account === 'platform'
      ? await githubPlatform.createRepo(name, { private: true, description: `Provisionné par NexUs${projectId ? ` (projet ${projectId})` : ''}` })
      : await github.createRepo(name, { private: true, description: `Provisionné par NexUs${projectId ? ` (projet ${projectId})` : ''}`, autoInit: true });

    const branch = repo.defaultBranch || 'main';
    await repoSetup.protectDefaultBranch(c.http, repo.owner, name, branch).catch((err) => warnings.push(`protection de branche : ${err.message}`));
    await repoSetup.createLabels(c.http, repo.owner, name).catch((err) => warnings.push(`labels : ${err.message}`));
    if (ciVariables && Object.keys(ciVariables).length) {
      await repoSetup.createCiVariables(c.http, repo.owner, name, ciVariables).catch((err) => warnings.push(`variables CI : ${err.message}`));
    }
    if (webhookUrl) {
      await repoSetup.createWebhook(c.http, repo.owner, name, webhookUrl, webhookSecret).catch((err) => warnings.push(`webhook : ${err.message}`));
    }
    if (account === 'platform' && teamSlug) {
      await repoSetup.addTeamPermission(c.http, c.cfg.organization, teamSlug, repo.owner, name).catch((err) => warnings.push(err.message));
    }
  } else if (provider === 'gitlab') {
    const c = gitlab.getClient();
    if (!c) throw new IntegrationError('GitLab non configuré', { status: 409 });
    repo = await gitlab.createProject(name, { visibility: 'private', description: `Provisionné par NexUs${projectId ? ` (projet ${projectId})` : ''}` });
    const branch = repo.defaultBranch || 'main';
    await gitlab.protectBranch(repo.id, branch).catch((err) => warnings.push(`protection de branche : ${err.message}`));
    await gitlab.createLabels(repo.id, DEFAULT_GITLAB_LABELS).catch((err) => warnings.push(`labels : ${err.message}`));
    if (ciVariables && Object.keys(ciVariables).length) {
      await gitlab.createCiVariables(repo.id, ciVariables).catch((err) => warnings.push(`variables CI : ${err.message}`));
    }
    if (webhookUrl) {
      await gitlab.createWebhook(repo.id, webhookUrl, webhookSecret).catch((err) => warnings.push(`webhook : ${err.message}`));
    }
  } else {
    throw new IntegrationError(`Provisioning non supporté pour le fournisseur "${provider}" (github/gitlab uniquement)`, { status: 400 });
  }

  return {
    webUrl: repo.webUrl,
    statusDetail: warnings.length ? `Dépôt créé, avec avertissements : ${warnings.join(' · ')}` : 'Dépôt créé avec succès (branche protégée, labels, webhook et variables CI appliqués selon disponibilité).'
  };
}

const DEFAULT_GITLAB_LABELS = [
  { name: 'type:feature', color: '#1d76db' },
  { name: 'type:bug', color: '#d73a4a' },
  { name: 'type:chore', color: '#c5def5' },
  { name: 'priority:high', color: '#e11d21' },
  { name: 'priority:low', color: '#0e8a16' }
];

// Point d'entrée appelé par la route : exécute provision(), écrit le
// résultat réel (jamais 'success' par défaut) via updateProvisioningStatus.
export async function runProvisioning(id) {
  const item = await repoStore.getManagedRepository(id);
  if (!item) throw new IntegrationError('Demande de provisioning introuvable', { status: 404 });
  if (item.status === 'provisioned') return item;
  try {
    const { webUrl, statusDetail } = await provision(item);
    return repoStore.updateProvisioningStatus(id, { status: 'provisioned', statusDetail, webUrl });
  } catch (err) {
    return repoStore.updateProvisioningStatus(id, { status: 'failed', statusDetail: err.message });
  }
}
