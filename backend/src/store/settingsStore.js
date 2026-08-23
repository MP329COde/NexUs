import { readStore, writeStore } from './jsonStore.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';

// Déclare, pour chaque intégration, les champs sensibles à chiffrer au repos
// et à ne JAMAIS renvoyer en clair au frontend.
export const SECRET_FIELDS = {
  kubernetes: ['token', 'caCert'],
  argocd: ['token'],
  haproxy: ['password'],
  gitlab: ['token'],
  github: ['token'],
  githubPlatform: ['token'],
  gitea: ['token'],
  proxmox: ['tokenSecret'],
  traefik: ['password'],
  certManager: [],
  grafana: ['apiKey'],
  wazuh: ['password'],
  // Indexeur Wazuh (OpenSearch, port 9200 par défaut) : intégration séparée
  // du gestionnaire (port 55000, clé `wazuh` ci-dessus) — c'est là que
  // vivent les alertes brutes (rule.level, description, agent source),
  // contrairement au SCA qui reste sur l'API du gestionnaire. Authentification
  // souvent distincte (utilisateur OpenSearch dédié plutôt que wazuh-wui).
  wazuhIndexer: ['password'],
  registry: ['password'],
  notificationsWebhook: ['url'],
  ovh: ['appSecret', 'consumerKey'],
  duckdns: ['token'],
  gitBackup: ['token'],
  // Traces distribuées (Priorité 5, Lot 56-nav) : Tempo ou Jaeger, seul le
  // token est sensible (Tempo public sans auth par défaut, Jaeger idem —
  // le champ reste optionnel selon le déploiement).
  tracing: ['token']
};

export const INTEGRATION_KEYS = Object.keys(SECRET_FIELDS);

function assertKnown(key) {
  if (!INTEGRATION_KEYS.includes(key)) throw Object.assign(new Error(`Intégration inconnue: ${key}`), { status: 400 });
}

export function getRawIntegration(key) {
  assertKnown(key);
  const all = readStore('integrations');
  const entry = all[key] || {};
  const secretFields = SECRET_FIELDS[key];
  const decrypted = { ...entry };
  for (const field of secretFields) {
    if (entry[field]) decrypted[field] = decryptSecret(entry[field]);
  }
  return decrypted;
}

// Version sûre pour le frontend: les secrets sont remplacés par un booléen "configured".
export function getRedactedIntegration(key) {
  assertKnown(key);
  const all = readStore('integrations');
  const entry = all[key] || {};
  const secretFields = SECRET_FIELDS[key];
  const redacted = { ...entry };
  for (const field of secretFields) {
    redacted[field] = undefined;
    redacted[`${field}Set`] = Boolean(entry[field]);
  }
  redacted.configured = isConfigured(key, entry);
  return redacted;
}

export function getAllRedacted() {
  return Object.fromEntries(INTEGRATION_KEYS.map((k) => [k, getRedactedIntegration(k)]));
}

export function saveIntegration(key, payload) {
  assertKnown(key);
  const all = readStore('integrations');
  const existing = all[key] || {};
  const secretFields = SECRET_FIELDS[key];
  const next = { ...existing, ...payload, enabled: payload.enabled ?? existing.enabled ?? true };
  for (const field of secretFields) {
    // Une valeur vide/absente conserve le secret déjà stocké (évite de l'écraser
    // à chaque sauvegarde de formulaire depuis le frontend, qui ne la renvoie jamais).
    if (payload[field]) next[field] = encryptSecret(payload[field]);
    else next[field] = existing[field] ?? null;
  }
  all[key] = next;
  writeStore('integrations', all);
  return getRedactedIntegration(key);
}

// Lot B4 (Certificats) : mode TLS global — sert de valeur par défaut affichée
// / documentée pour l'utilisateur, mais NE modifie PAS le comportement réel
// des intégrations : chaque intégration garde son propre `allowSelfSigned`
// (voir buildHttpsAgentFromConfig dans services/integrations/httpClient.js)
// qui prime toujours. C'est un réglage informatif + un défaut visuel proposé
// dans le formulaire d'une nouvelle intégration, pas un interrupteur global
// qui écraserait les réglages déjà faits intégration par intégration.
export function getTlsMode() {
  const s = readStore('tlsSettings') || {};
  return s.mode === 'permissive' ? 'permissive' : 'strict';
}

export function setTlsMode(mode) {
  if (mode !== 'strict' && mode !== 'permissive') {
    throw Object.assign(new Error('Mode TLS invalide (strict|permissive attendu)'), { status: 400 });
  }
  writeStore('tlsSettings', { mode });
  return { mode };
}

// Domaine central de la plateforme (Lot C3 — Groupe C) : un seul domaine
// racine (ex: nexus.example.com) utilisé pour générer les URLs dev/staging
// par déploiement (voir services/devUrlService.js) et affiché dans
// Paramètres → Réseau. Stocké séparément des intégrations car ce n'est pas
// une intégration en soi (pas de token/URL d'API), même pattern de stockage
// que `tlsSettings` ci-dessus (store dédié, pas de chiffrement nécessaire :
// un nom de domaine n'est pas un secret).
export function getNetworkConfig() {
  const s = readStore('networkConfig') || {};
  return { centralDomain: s.centralDomain || null };
}

export function setCentralDomain(domain) {
  const trimmed = (domain || '').trim().toLowerCase();
  if (trimmed && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(trimmed)) {
    throw Object.assign(new Error('Domaine invalide (ex attendu : nexus.example.com)'), { status: 400 });
  }
  const next = { centralDomain: trimmed || null };
  writeStore('networkConfig', next);
  return next;
}

// --- Multi-cluster Kubernetes (Lot C4 — Groupe C) --------------------------
// Avant ce lot, Kubernetes n'existait qu'en une seule config globale, stockée
// comme n'importe quelle autre intégration (`integrations.kubernetes`, voir
// ci-dessus). Ce lot fait évoluer ce modèle vers une LISTE de clusters nommés
// (store dédié `k8sClusters`, même pattern que `tlsSettings`/`networkConfig`
// ci-dessus : config structurée hors du bloc `integrations` générique, car
// ce n'est plus une intégration unique). Un seul cluster peut être marqué
// `isDefault` — c'est celui utilisé par tout appelant qui ne précise pas de
// cluster explicitement (rétrocompatibilité avec les routes/services
// existants avant ce lot, voir kubernetesService.js).
//
// Migration : au premier accès, si `k8sClusters` est vide ET qu'une config
// Kubernetes unique existait déjà (`integrations.kubernetes.apiServer`), elle
// est copiée telle quelle comme premier cluster (id `default-cluster`,
// marqué par défaut) plutôt que d'être perdue. La config legacy
// `integrations.kubernetes` n'est pas supprimée (aucune route ne la lit plus
// après ce lot, mais on évite une suppression destructive non demandée).
const K8S_SECRET_FIELDS = ['token', 'caCert'];

function decryptClusterSecrets(cluster) {
  const out = { ...cluster };
  for (const field of K8S_SECRET_FIELDS) {
    if (out[field]) out[field] = decryptSecret(out[field]);
  }
  return out;
}

function encryptClusterSecrets(cluster, existing) {
  const out = { ...cluster };
  for (const field of K8S_SECRET_FIELDS) {
    if (cluster[field]) out[field] = encryptSecret(cluster[field]);
    else out[field] = existing?.[field] ?? null;
  }
  return out;
}

function migrateK8sClusters() {
  let clusters = readStore('k8sClusters');
  if (!Array.isArray(clusters)) clusters = [];
  if (clusters.length === 0) {
    const legacyAll = readStore('integrations');
    const legacy = legacyAll.kubernetes;
    if (legacy?.apiServer) {
      clusters = [{
        id: 'default-cluster',
        name: 'Cluster par défaut',
        apiServer: legacy.apiServer,
        namespace: legacy.namespace || 'default',
        token: legacy.token || null, // déjà chiffré (copié tel quel depuis le store chiffré)
        caCert: legacy.caCert || null,
        insecureSkipTlsVerify: Boolean(legacy.insecureSkipTlsVerify),
        dashboardUrl: legacy.dashboardUrl || null,
        isDefault: true
      }];
      writeStore('k8sClusters', clusters);
    }
  }
  return clusters;
}

// Liste complète, secrets déchiffrés — usage interne uniquement (services
// d'intégration), jamais renvoyé tel quel au frontend.
export function listK8sClusters() {
  return migrateK8sClusters().map(decryptClusterSecrets);
}

// Version sûre pour le frontend (Paramètres → Kubernetes) : secrets remplacés
// par un booléen, même pattern que getRedactedIntegration ci-dessus.
export function listK8sClustersRedacted() {
  return listK8sClusters().map(({ token, caCert, ...rest }) => ({
    ...rest,
    tokenSet: Boolean(token),
    caCertSet: Boolean(caCert),
    configured: Boolean(rest.apiServer)
  }));
}

// Résout un cluster par id, ou le cluster par défaut si aucun id n'est
// précisé — c'est le point de rétrocompatibilité utilisé par
// kubernetesService.js pour tout appelant antérieur à ce lot.
export function getK8sCluster(id) {
  const clusters = listK8sClusters();
  if (!clusters.length) return null;
  if (!id) return clusters.find((c) => c.isDefault) || clusters[0];
  return clusters.find((c) => c.id === id) || null;
}

export function saveK8sCluster(payload) {
  const clusters = migrateK8sClusters().slice();
  if (!payload?.name || !payload?.apiServer) {
    throw Object.assign(new Error('Nom et URL du serveur API requis'), { status: 400 });
  }
  const id = payload.id || `k8s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const idx = clusters.findIndex((c) => c.id === id);
  const existing = idx >= 0 ? clusters[idx] : null;
  const next = encryptClusterSecrets({
    id,
    name: payload.name,
    apiServer: payload.apiServer,
    namespace: payload.namespace || 'default',
    token: payload.token,
    caCert: payload.caCert,
    insecureSkipTlsVerify: Boolean(payload.insecureSkipTlsVerify),
    dashboardUrl: payload.dashboardUrl || null,
    isDefault: existing?.isDefault ?? clusters.length === 0
  }, existing);
  if (idx >= 0) clusters[idx] = next; else clusters.push(next);
  if (payload.setDefault) {
    for (const c of clusters) c.isDefault = c.id === id;
  }
  writeStore('k8sClusters', clusters);
  return listK8sClustersRedacted().find((c) => c.id === id);
}

export function deleteK8sCluster(id) {
  const clusters = migrateK8sClusters().slice();
  const idx = clusters.findIndex((c) => c.id === id);
  if (idx < 0) throw Object.assign(new Error('Cluster introuvable'), { status: 404 });
  const wasDefault = clusters[idx].isDefault;
  clusters.splice(idx, 1);
  if (wasDefault && clusters.length) clusters[0].isDefault = true;
  writeStore('k8sClusters', clusters);
  return { ok: true };
}

export function setDefaultK8sCluster(id) {
  const clusters = migrateK8sClusters().slice();
  if (!clusters.some((c) => c.id === id)) throw Object.assign(new Error('Cluster introuvable'), { status: 404 });
  for (const c of clusters) c.isDefault = c.id === id;
  writeStore('k8sClusters', clusters);
  return listK8sClustersRedacted();
}

// --- Autorisation de mise à jour des services du catalogue (Lot D3 —
// Groupe D) ---------------------------------------------------------------
// Par défaut, AUCUNE mise à jour n'est autorisée (globalEnabled: false) :
// même avec une nouvelle version détectée, le bouton "Mettre à jour" reste
// désactivé côté frontend et la route backend refuse l'action (403) tant que
// ce réglage n'a pas été explicitement activé par un admin — "si autorisé"
// dans la demande initiale. `perService` permet d'affiner service par
// service une fois l'autorisation globale activée (un service peut être
// explicitement exclu même si globalEnabled=true), même pattern de store
// dédié que tlsSettings/networkConfig ci-dessus.
export function getServiceUpdatePolicy() {
  const s = readStore('serviceUpdatePolicy') || {};
  return { globalEnabled: Boolean(s.globalEnabled), perService: s.perService || {} };
}

export function setServiceUpdatePolicy(payload) {
  const current = getServiceUpdatePolicy();
  const next = {
    globalEnabled: payload.globalEnabled !== undefined ? Boolean(payload.globalEnabled) : current.globalEnabled,
    perService: payload.perService !== undefined ? { ...payload.perService } : current.perService
  };
  writeStore('serviceUpdatePolicy', next);
  return next;
}

// Autorisation effective pour un service donné : globale ET (pas d'override
// explicite à false pour ce service). Un override explicite à true n'a de
// sens que si globalEnabled l'est aussi (pas de contournement par service).
export function isServiceUpdateAllowed(serviceId) {
  const policy = getServiceUpdatePolicy();
  if (!policy.globalEnabled) return false;
  const override = policy.perService[serviceId];
  return override === undefined ? true : Boolean(override);
}

function isConfigured(key, entry) {
  const required = {
    kubernetes: ['apiServer'],
    argocd: ['baseUrl'],
    haproxy: ['dataPlaneUrl'],
    gitlab: ['baseUrl'],
    github: ['token'],
    githubPlatform: ['organization', 'token'],
    gitea: ['baseUrl'],
    proxmox: ['baseUrl'],
    traefik: ['apiUrl'],
    certManager: [],
    grafana: ['baseUrl'],
    wazuh: ['baseUrl'],
    wazuhIndexer: ['baseUrl'],
    registry: ['baseUrl'],
    notificationsWebhook: ['url'],
    ovh: ['appKey', 'appSecret', 'consumerKey'],
    duckdns: ['token'],
    gitBackup: ['remoteUrl', 'token'],
    tracing: ['baseUrl', 'type']
  }[key] || [];
  return required.every((f) => Boolean(entry[f]));
}
