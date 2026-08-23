import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError, buildHttpsAgentFromConfig } from './httpClient.js';
import { listHosts } from '../../store/hostsStore.js';

// L'API Wazuh (gestionnaire, port 55000 par défaut) s'authentifie via
// utilisateur/mot de passe pour obtenir un JWT de courte durée (~15 min) :
// on le met en cache en mémoire process plutôt que de ré-authentifier à
// chaque appel.
let tokenCache = { token: null, expiresAt: 0 };

function baseClient() {
  const cfg = getRawIntegration('wazuh');
  if (!cfg.baseUrl) return null;
  return { http: buildClient(cfg.baseUrl, { timeout: 8000, httpsAgent: buildHttpsAgentFromConfig(cfg) }), cfg };
}

async function authenticatedClient() {
  const base = baseClient();
  if (!base) return null;
  const httpsAgent = buildHttpsAgentFromConfig(base.cfg);
  if (tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return { http: buildClient(base.cfg.baseUrl, { headers: { Authorization: `Bearer ${tokenCache.token}` }, httpsAgent }), cfg: base.cfg };
  }
  const authClient = buildClient(base.cfg.baseUrl, { auth: { username: base.cfg.username, password: base.cfg.password || '' }, httpsAgent });
  const data = await request(authClient, { method: 'POST', url: '/security/user/authenticate' }, 'Wazuh · authentification');
  tokenCache = { token: data.data.token, expiresAt: Date.now() + 14 * 60 * 1000 };
  return { http: buildClient(base.cfg.baseUrl, { headers: { Authorization: `Bearer ${tokenCache.token}` }, httpsAgent }), cfg: base.cfg };
}

export async function getStatus() {
  const base = baseClient();
  if (!base) return notConfigured('Wazuh');
  const c = await authenticatedClient();
  const data = await request(c.http, { method: 'GET', url: '/agents/summary/status' }, 'Wazuh');
  const s = data.data;
  return { configured: true, ok: (s.connection?.active ?? 0) > 0, message: `${s.connection?.active ?? 0} agent(s) actif(s) sur ${s.connection?.total ?? 0}` };
}

export async function listAgents() {
  const c = await authenticatedClient();
  if (!c) throw new IntegrationError('Wazuh non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/agents', params: { limit: 200 } }, 'Wazuh');
  return (data.data.affected_items || []).map((a) => ({
    id: a.id,
    name: a.name,
    ip: a.ip,
    os: a.os?.name,
    version: a.version,
    status: a.status,
    lastKeepAlive: a.lastKeepAlive
  }));
}

export async function getAgentSummary() {
  const c = await authenticatedClient();
  if (!c) throw new IntegrationError('Wazuh non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/agents/summary/status' }, 'Wazuh');
  return data.data;
}

// SCA (Security Configuration Assessment) : audits de conformité (CIS
// Benchmarks et équivalents) exécutés localement par chaque agent Wazuh,
// remontés au gestionnaire — reste sur l'API du gestionnaire (port 55000,
// déjà authentifiée ci-dessus), contrairement aux alertes brutes qui vivent
// dans l'indexeur Wazuh (OpenSearch, intégration séparée non couverte ici).
export async function listAgentSCA(agentId) {
  const c = await authenticatedClient();
  if (!c) throw new IntegrationError('Wazuh non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/sca/${encodeURIComponent(agentId)}` }, 'Wazuh');
  return (data.data.affected_items || []).map((p) => ({
    policyId: p.policy_id,
    name: p.name,
    description: p.description,
    pass: p.pass,
    fail: p.fail,
    invalid: p.invalid,
    score: p.score,
    endScan: p.end_scan
  }));
}

// Agrège la conformité SCA sur tous les agents actifs : borné à 25 agents
// (un appel HTTP par agent) pour éviter qu'un grand parc ne ralentisse la
// page Sécurité — au-delà, `agentsScanned < agentsTotal` signale la
// troncature plutôt que de la cacher silencieusement.
export async function getSCASummary() {
  const c = await authenticatedClient();
  if (!c) throw new IntegrationError('Wazuh non configuré', { status: 409 });
  const agents = (await listAgents()).filter((a) => a.status === 'active');
  const sample = agents.slice(0, 25);
  const perAgent = await Promise.all(sample.map(async (a) => {
    const policies = await listAgentSCA(a.id).catch(() => []);
    return { agentId: a.id, agentName: a.name, policies };
  }));
  return { agentsTotal: agents.length, agentsScanned: sample.length, agents: perAgent };
}

// --- Indexeur Wazuh (OpenSearch, port 9200 par défaut) — alertes brutes ---
// Intégration distincte du gestionnaire ci-dessus : auth basique classique
// (pas de JWT à courte durée) sur un utilisateur/mot de passe OpenSearch,
// potentiellement différents de ceux du gestionnaire — stockés sous la clé
// `wazuhIndexer` (voir store/settingsStore.js).
function indexerClient() {
  const cfg = getRawIntegration('wazuhIndexer');
  if (!cfg.baseUrl) return null;
  const http = buildClient(cfg.baseUrl, {
    timeout: 8000,
    httpsAgent: buildHttpsAgentFromConfig(cfg),
    auth: cfg.username ? { username: cfg.username, password: cfg.password || '' } : undefined
  });
  return { http, cfg };
}

export function getIndexerStatusSync() {
  const c = indexerClient();
  if (!c) return notConfigured('Wazuh (alertes)');
  return { configured: true };
}

// Correspondance rule.level -> sévérité, seuils usuels de la documentation
// Wazuh (0-3 informationnel, 4-7 faible/moyenne, 8-11 élevée, 12-15 critique).
// Champ réel utilisé (rule.level), aucune sévérité inventée quand l'alerte
// n'a pas ce champ (retombe sur 'unknown').
export function levelToSeverity(level) {
  if (level === undefined || level === null) return 'unknown';
  if (level >= 12) return 'critical';
  if (level >= 8) return 'high';
  if (level >= 4) return 'medium';
  return 'low';
}

// Relie l'agent source d'une alerte à un hôte géré (Infrastructure → Hôtes)
// par IP ou nom — seule correspondance fiable disponible avec les données
// réellement présentes des deux côtés (aucun identifiant partagé explicite
// entre Wazuh et hostsStore). Retourne null si aucune correspondance : pas
// de lien fabriqué.
async function matchHost(agentIp, agentName) {
  if (!agentIp && !agentName) return null;
  const hosts = await listHosts().catch(() => []);
  const byIp = agentIp && hosts.find((h) => h.address === agentIp);
  if (byIp) return { id: byIp.id, name: byIp.name, address: byIp.address };
  const byName = agentName && hosts.find((h) => h.name?.toLowerCase() === agentName.toLowerCase());
  if (byName) return { id: byName.id, name: byName.name, address: byName.address };
  return null;
}

function mapHit(hit) {
  const src = hit._source || {};
  return {
    id: hit._id,
    timestamp: src['@timestamp'] || src.timestamp || null,
    level: src.rule?.level ?? null,
    severity: levelToSeverity(src.rule?.level),
    ruleId: src.rule?.id ?? null,
    description: src.rule?.description || '(sans description)',
    groups: src.rule?.groups || [],
    agentId: src.agent?.id ?? null,
    agentName: src.agent?.name ?? null,
    agentIp: src.agent?.ip ?? null,
    location: src.location || null,
    fullLog: src.full_log || null,
    raw: src
  };
}

// Recherche paginée dans l'index d'alertes réel (GET /<index>/_search) —
// aucune alerte de démonstration si l'indexeur n'est pas configuré/joignable
// (l'appelant doit distinguer "non configuré" d'une liste vide réelle).
export async function searchAlerts({ q, severity, agentId, from, to, page = 1, pageSize = 25 } = {}) {
  const c = indexerClient();
  if (!c) throw new IntegrationError('Indexeur Wazuh non configuré', { status: 409 });
  const index = c.cfg.index || 'wazuh-alerts-*';

  const filter = [];
  if (from || to) {
    const range = {};
    if (from) range.gte = from;
    if (to) range.lte = to;
    filter.push({ range: { '@timestamp': range } });
  }
  if (agentId) filter.push({ term: { 'agent.id': agentId } });
  if (severity && severity !== 'all') {
    const bounds = { low: [0, 3], medium: [4, 7], high: [8, 11], critical: [12, 15] }[severity];
    if (bounds) filter.push({ range: { 'rule.level': { gte: bounds[0], lte: bounds[1] } } });
  }

  const must = q
    ? [{ query_string: { query: q, fields: ['rule.description', 'full_log', 'agent.name'], default_operator: 'AND' } }]
    : [{ match_all: {} }];

  const body = {
    query: { bool: { must, filter } },
    sort: [{ '@timestamp': { order: 'desc' } }],
    from: Math.max(0, (page - 1) * pageSize),
    size: pageSize
  };

  const data = await request(c.http, { method: 'POST', url: `/${index}/_search`, data: body }, 'Wazuh · alertes');
  const total = typeof data.hits?.total === 'object' ? data.hits.total.value : (data.hits?.total ?? 0);
  const items = await Promise.all((data.hits?.hits || []).map(async (hit) => {
    const mapped = mapHit(hit);
    mapped.host = await matchHost(mapped.agentIp, mapped.agentName);
    return mapped;
  }));
  return { items, total, page, pageSize };
}

export async function getAlertById(id) {
  const c = indexerClient();
  if (!c) throw new IntegrationError('Indexeur Wazuh non configuré', { status: 409 });
  const index = c.cfg.index || 'wazuh-alerts-*';
  const data = await request(
    c.http,
    { method: 'POST', url: `/${index}/_search`, data: { query: { ids: { values: [id] } }, size: 1 } },
    'Wazuh · alerte'
  );
  const hit = data.hits?.hits?.[0];
  if (!hit) throw new IntegrationError('Alerte introuvable', { status: 404 });
  const mapped = mapHit(hit);
  mapped.host = await matchHost(mapped.agentIp, mapped.agentName);
  return mapped;
}
