import { getRawIntegration } from '../store/settingsStore.js';
import { IntegrationError } from './integrations/httpClient.js';
import { createRepo, getAuthenticatedUser } from './integrations/githubService.js';
import { createRemoteMirror, listRemoteMirrors } from './integrations/gitlabService.js';

// Sauvegarde automatique d'un projet GitLab vers un dépôt GitHub, créé
// automatiquement s'il n'existe pas encore — chaque appel exige une action
// explicite de l'utilisateur (bouton "Activer le miroir" + confirmation
// dans l'UI), c'est ça l'"autorisation" mentionnée dans les notes de specs.
// Implémenté via le push mirror natif de GitLab (GitLab pousse lui-même,
// à intervalle régulier) plutôt qu'en réimplémentant un git push nous-mêmes.
export async function enableGitlabToGithubMirror(projectId, githubRepoName) {
  const githubCfg = getRawIntegration('github');
  if (!githubCfg.token) throw new IntegrationError('GitHub non configuré (jeton requis pour le miroir)', { status: 409 });

  const repo = await createRepo(githubRepoName, { private: true, description: `Miroir de sauvegarde automatique (Nexus Console) — projet GitLab #${projectId}` });
  const { login } = await getAuthenticatedUser();
  // Jeton intégré à l'URL : c'est la méthode d'authentification attendue par
  // GitLab pour un push mirror HTTPS. Jamais journalisé ni renvoyé au frontend
  // (voir safe_url côté GitLab, qui masque déjà les identifiants en retour).
  const authenticatedUrl = `https://${login}:${githubCfg.token}@github.com/${login}/${githubRepoName}.git`;
  const mirror = await createRemoteMirror(projectId, authenticatedUrl);

  return { ok: true, githubRepo: repo.fullName, mirror };
}

export async function listMirrors(projectId) {
  return listRemoteMirrors(projectId);
}
