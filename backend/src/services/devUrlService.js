import { getNetworkConfig, getRawIntegration } from '../store/settingsStore.js';
import * as deploymentStore from '../store/deploymentStore.js';
import * as orgStore from '../store/orgStore.js';

// Lot C3 (Groupe C) — génère une URL de développement/staging par déploiement,
// à partir du domaine central configuré (Paramètres → Réseau) et de
// l'environnement du déploiement. JAMAIS pour la production — exclusion
// explicite ci-dessous, quel que soit le `kind` de l'environnement.
//
// Structure retenue, et pourquoi (voir todo.md pour le détail) :
//  - Si OVH est configuré (services/integrations/ovhService.js#upsertRecord
//    peut réellement créer/mettre à jour n'importe quel enregistrement A/CNAME
//    dans une zone gérée) : sous-domaine dédié
//    `<envPrefix>.<appSlug>.<centralDomain>` — un vrai enregistrement DNS
//    peut être créé par app/environnement, wildcard possible.
//  - Sinon, si seul DuckDNS est configuré : PAS de sous-domaine par app.
//    DuckDNS (voir integrations/duckdnsService.js) n'expose qu'un unique
//    endpoint /update qui met à jour l'IP d'un sous-domaine déjà enregistré
//    sur le compte DuckDNS (5 gratuits, créés manuellement sur duckdns.org) —
//    il n'existe AUCUNE API pour créer un nouveau sous-domaine à la volée.
//    On ne peut donc pas fabriquer un sous-domaine par app/environnement sans
//    action manuelle préalable sur le site DuckDNS pour chacun. La structure
//    retenue est donc un chemin (path) sous le domaine central déjà pointé :
//    `<centralDomain>/<envPrefix>-<appSlug>/<serviceSlug>`, routable par une
//    seule règle HAProxy/Traefik basée sur le path (`use_backend`/PathPrefix),
//    sans dépendre d'un nouvel enregistrement DNS par déploiement.
//  - Si ni HAProxy ni Traefik n'est configuré : aucune URL n'est générée
//    (état vide honnête), même si un domaine central est renseigné — le
//    domaine seul ne route rien.

const ENV_PREFIX_BY_KIND = { dev: 'dev', development: 'dev', staging: 'staging', preview: 'preview' };

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'app';
}

function envPrefix(env) {
  return ENV_PREFIX_BY_KIND[String(env.kind || '').toLowerCase()] || slugify(env.kind || env.name || 'dev');
}

export function isProxyAvailable() {
  const haproxyCfg = getRawIntegration('haproxy');
  const traefikCfg = getRawIntegration('traefik');
  return Boolean(haproxyCfg.dataPlaneUrl || traefikCfg.apiUrl);
}

// Retourne { available, reason } + éventuellement `structure`/`url`/`proposal`.
// `env` : ligne d'environnement (socle relationnel, orgStore#listEnvironments).
// `link` : lien de déploiement (deploymentStore).
export function generateDevUrl(env, link) {
  if (!env) return { available: false, reason: 'Environnement introuvable' };
  if (env.is_production) return { available: false, reason: 'URL dev/staging non générée pour un environnement de production (exclusion volontaire)' };

  const { centralDomain } = getNetworkConfig();
  if (!centralDomain) return { available: false, reason: 'Aucun domaine central configuré (Paramètres → Réseau)' };
  if (!isProxyAvailable()) return { available: false, reason: 'Aucun reverse proxy (HAProxy ou Traefik) configuré' };

  const ovhCfg = getRawIntegration('ovh');
  const ovhAvailable = Boolean(ovhCfg.appKey && ovhCfg.appSecret && ovhCfg.consumerKey);

  const prefix = envPrefix(env);
  const appSlug = slugify(link?.name || env.name);
  const serviceSlug = slugify(link?.k8sDeployment || link?.argocdAppName || 'web');

  if (ovhAvailable) {
    const host = `${prefix}.${appSlug}.${centralDomain}`;
    return {
      available: true,
      structure: 'subdomain',
      structureReason: 'OVH configuré : un sous-domaine dédié peut être créé/pointé réellement via l\'API OVH (voir ovhService.js#upsertRecord).',
      url: `https://${host}`,
      dns: { provider: 'ovh', zone: centralDomain, subdomain: `${prefix}.${appSlug}`, fieldType: 'CNAME' },
      haproxyProposal: { name: `fe-${slugify(env.name)}-${appSlug}`, host, mode: 'http' }
    };
  }

  const duckdnsCfg = getRawIntegration('duckdns');
  const duckdnsAvailable = Boolean(duckdnsCfg.token);
  const path = `/${prefix}-${appSlug}/${serviceSlug}`;
  return {
    available: true,
    structure: 'path',
    structureReason: duckdnsAvailable
      ? 'Seul DuckDNS est configuré : son API ne permet pas de créer de nouveaux sous-domaines à la volée (un seul endpoint /update, sous-domaines pré-créés manuellement sur duckdns.org), donc une URL basée sur un chemin sous le domaine central déjà pointé est utilisée à la place.'
      : 'Aucun fournisseur DNS capable de créer un sous-domaine à la volée n\'est configuré : URL basée sur un chemin sous le domaine central.',
    url: `https://${centralDomain}${path}`,
    haproxyProposal: { name: `fe-${slugify(env.name)}-${appSlug}`, host: centralDomain, pathPrefix: path, mode: 'http' }
  };
}

export async function getDevUrlForLink(linkId) {
  const link = deploymentStore.getLink(linkId);
  if (!link) return { available: false, reason: 'Déploiement introuvable' };
  if (!link.environmentId) return { available: false, reason: 'Déploiement non rattaché à un environnement' };
  const env = await orgStore.getEnvironment(link.environmentId);
  if (!env) return { available: false, reason: 'Environnement introuvable (rattachement obsolète)' };
  return generateDevUrl(env, link);
}
