import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

// Distinct de services/integrations/githubService.js : celui-ci lit le compte
// GitHub *personnel* de l'utilisateur connecté (utilisé par le miroir de
// sauvegarde Git). Ici, il s'agit du compte/organisation GitHub *dédié à la
// plateforme* (chantiers #40/#49) — créé et géré par l'utilisateur en dehors
// de Nexus, dont seuls les credentials sont reçus et stockés ici.
function client() {
  const cfg = getRawIntegration('githubPlatform');
  if (!cfg.token || !cfg.organization) return null;
  return {
    http: buildClient('https://api.github.com', { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } }),
    cfg
  };
}

// Exposé pour repositoryProvisioningService.js.
export function getClient() {
  return client();
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('GitHub (compte plateforme)');
  const org = await request(c.http, { method: 'GET', url: `/orgs/${c.cfg.organization}` }, 'GitHub (compte plateforme)');
  return { configured: true, ok: true, message: `Connecté à l'organisation ${org.login} (${org.plan?.name || 'plan inconnu'}).` };
}

// Crée un dépôt dans l'organisation plateforme (branché au provisioning
// réel — Priorité 1). auto_init:true pour obtenir immédiatement une branche
// par défaut + un README, condition préalable à la protection de branche et
// aux webhooks (qui exigent une branche existante).
export async function createRepo(name, { private: isPrivate = true, description } = {}) {
  const c = client();
  if (!c) throw new IntegrationError('GitHub (compte plateforme) non configuré', { status: 409 });
  try {
    const repo = await request(c.http, {
      method: 'POST', url: `/orgs/${c.cfg.organization}/repos`,
      data: { name, private: isPrivate, description, auto_init: true }
    }, 'GitHub (compte plateforme)');
    return { created: true, owner: c.cfg.organization, fullName: repo.full_name, cloneUrl: repo.clone_url, webUrl: repo.html_url, defaultBranch: repo.default_branch };
  } catch (err) {
    if (err.status === 502 && /422/.test(err.message)) {
      const repo = await request(c.http, { method: 'GET', url: `/repos/${c.cfg.organization}/${name}` }, 'GitHub (compte plateforme)');
      return { created: false, owner: c.cfg.organization, fullName: repo.full_name, cloneUrl: repo.clone_url, webUrl: repo.html_url, defaultBranch: repo.default_branch };
    }
    throw err;
  }
}
