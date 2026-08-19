import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured } from './httpClient.js';

// Distinct de services/integrations/githubService.js : celui-ci lit le compte
// GitHub *personnel* de l'utilisateur connecté (utilisé par le miroir de
// sauvegarde Git). Ici, il s'agit du compte/organisation GitHub *dédié à la
// plateforme* (chantiers #40/#49) — créé et géré par l'utilisateur en dehors
// de Nexus, dont seuls les credentials sont reçus et stockés ici. Aucune
// logique de provisioning de dépôt n'est branchée dessus tant que ce point
// d'intégration n'a pas été validé avec de vrais credentials (voir todo.md).
function client() {
  const cfg = getRawIntegration('githubPlatform');
  if (!cfg.token || !cfg.organization) return null;
  return {
    http: buildClient('https://api.github.com', { headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json' } }),
    cfg
  };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('GitHub (compte plateforme)');
  const org = await request(c.http, { method: 'GET', url: `/orgs/${c.cfg.organization}` }, 'GitHub (compte plateforme)');
  return { configured: true, ok: true, message: `Connecté à l'organisation ${org.login} (${org.plan?.name || 'plan inconnu'}).` };
}
