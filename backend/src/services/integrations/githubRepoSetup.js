import { request, IntegrationError } from './httpClient.js';

// Étapes de provisioning communes à un dépôt GitHub, qu'il appartienne au
// compte personnel (github.routes.js/githubService.js) ou au compte
// plateforme NexUs (githubPlatformService.js) — mêmes endpoints REST GitHub
// dans les deux cas, seul le client HTTP (token) et l'URL de création du
// dépôt (/user/repos vs /orgs/{org}/repos) diffèrent. Voir
// services/repositoryProvisioningService.js pour l'orchestration complète
// (branches annexes, Registry...).
const DEFAULT_LABELS = [
  { name: 'type:feature', color: '1d76db', description: 'Nouvelle fonctionnalité' },
  { name: 'type:bug', color: 'd73a4a', description: 'Anomalie' },
  { name: 'type:chore', color: 'c5def5', description: 'Tâche technique' },
  { name: 'priority:high', color: 'e11d21', description: 'Priorité haute' },
  { name: 'priority:low', color: '0e8a16', description: 'Priorité basse' }
];

// Protection de branche minimale mais réelle : review obligatoire, pas de
// force-push, pas de suppression directe. `required_status_checks: null`
// (aucun check imposé au provisioning — la CI du template n'existe pas
// encore tant que le premier commit n'est pas poussé).
export async function protectDefaultBranch(http, owner, repo, branch) {
  await request(http, {
    method: 'PUT',
    url: `/repos/${owner}/${repo}/branches/${branch}/protection`,
    data: {
      required_status_checks: null,
      enforce_admins: false,
      required_pull_request_reviews: { required_approving_review_count: 1 },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false
    }
  }, 'GitHub').catch((err) => {
    // 502 ici = souvent "Upgrade to GitHub Pro" sur un dépôt privé de compte
    // gratuit (la protection de branche sur repo privé nécessite un plan
    // payant) — dégradation attendue, pas une erreur de provisioning fatale.
    if (/protected branches|upgrade/i.test(err.message)) return null;
    throw err;
  });
}

export async function createLabels(http, owner, repo, labels = DEFAULT_LABELS) {
  for (const label of labels) {
    await request(http, { method: 'POST', url: `/repos/${owner}/${repo}/labels`, data: label }, 'GitHub')
      .catch((err) => { if (!/already_exists|422/.test(err.message)) throw err; });
  }
}

// Variables CI non secrètes (GitHub Actions "repository variables") : pas de
// chiffrement à faire côté client contrairement aux secrets, adapté à des
// valeurs comme NODE_ENV ou un nom d'environnement cible.
export async function createCiVariables(http, owner, repo, variables = {}) {
  for (const [name, value] of Object.entries(variables)) {
    await request(http, {
      method: 'POST', url: `/repos/${owner}/${repo}/actions/variables`, data: { name, value: String(value) }
    }, 'GitHub').catch((err) => { if (!/already exists|422/.test(err.message)) throw err; });
  }
}

export async function createWebhook(http, owner, repo, webhookUrl, secret) {
  if (!webhookUrl) return null;
  return request(http, {
    method: 'POST',
    url: `/repos/${owner}/${repo}/hooks`,
    data: { name: 'web', active: true, events: ['push', 'pull_request'], config: { url: webhookUrl, content_type: 'json', secret } }
  }, 'GitHub');
}

export async function addTeamPermission(http, org, teamSlug, owner, repo, permission = 'push') {
  if (!teamSlug) return null;
  return request(http, {
    method: 'PUT',
    url: `/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
    data: { permission }
  }, 'GitHub').catch((err) => {
    throw new IntegrationError(`Rattachement à l'équipe GitHub "${teamSlug}" impossible : ${err.message}`, { status: err.status || 502 });
  });
}
