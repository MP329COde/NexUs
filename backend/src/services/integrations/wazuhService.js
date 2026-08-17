import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

// L'API Wazuh (gestionnaire, port 55000 par défaut) s'authentifie via
// utilisateur/mot de passe pour obtenir un JWT de courte durée (~15 min) :
// on le met en cache en mémoire process plutôt que de ré-authentifier à
// chaque appel.
let tokenCache = { token: null, expiresAt: 0 };

function baseClient() {
  const cfg = getRawIntegration('wazuh');
  if (!cfg.baseUrl) return null;
  return { http: buildClient(cfg.baseUrl, { timeout: 8000 }), cfg };
}

async function authenticatedClient() {
  const base = baseClient();
  if (!base) return null;
  if (tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return { http: buildClient(base.cfg.baseUrl, { headers: { Authorization: `Bearer ${tokenCache.token}` } }), cfg: base.cfg };
  }
  const authClient = buildClient(base.cfg.baseUrl, { auth: { username: base.cfg.username, password: base.cfg.password || '' } });
  const data = await request(authClient, { method: 'POST', url: '/security/user/authenticate' }, 'Wazuh · authentification');
  tokenCache = { token: data.data.token, expiresAt: Date.now() + 14 * 60 * 1000 };
  return { http: buildClient(base.cfg.baseUrl, { headers: { Authorization: `Bearer ${tokenCache.token}` } }), cfg: base.cfg };
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
