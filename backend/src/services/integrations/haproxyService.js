import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError, buildHttpsAgentFromConfig } from './httpClient.js';

// Intégration via la HAProxy Data Plane API. Ciblée v3 : testée en direct
// contre une vraie instance (haproxytech/haproxy-alpine, dataplaneapi
// embarqué) en août 2026, l'API v2 documentée à l'origine (guide
// utilisateur, `integrationForms.js`) n'existe plus dans aucune version de
// dataplaneapi encore distribuée (même les images HAProxy 2.9 embarquent un
// dataplaneapi qui ne sert plus que /v3/*) — les endpoints /v2/* renvoient
// 404 partout. v3 change aussi la forme des réponses (tableau JSON brut, pas
// {data:[...]}) et le chemin des sous-ressources (backend dans l'URL,
// ex. /configuration/backends/{name}/servers, plus en paramètre de requête).
function client() {
  const cfg = getRawIntegration('haproxy');
  if (!cfg.dataPlaneUrl) return null;
  return { http: buildClient(cfg.dataPlaneUrl, { auth: cfg.username ? { username: cfg.username, password: cfg.password || '' } : undefined, httpsAgent: buildHttpsAgentFromConfig(cfg) }), cfg };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('HAProxy');
  const info = await request(c.http, { method: 'GET', url: '/v3/info' }, 'HAProxy');
  return { configured: true, ok: true, message: `Data Plane API v${info.api?.version || '?'} joignable` };
}

export async function listBackends() {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/v3/services/haproxy/configuration/backends' }, 'HAProxy');
  return (data || []).map((b) => ({ name: b.name, mode: b.mode || 'tcp', balance: b.balance?.algorithm }));
}

export async function listServers(backend) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/v3/services/haproxy/configuration/backends/${encodeURIComponent(backend)}/servers` }, 'HAProxy');
  return (data || []).map((s) => ({ name: s.name, address: s.address, port: s.port, check: s.check, maxconn: s.maxconn }));
}

export async function listRuntimeServerStates(backend) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: `/v3/services/haproxy/runtime/backends/${encodeURIComponent(backend)}/servers` }, 'HAProxy');
  return (data || []).map((s) => ({ name: s.name, adminState: s.admin_state, operationalState: s.operational_state }));
}

export async function setServerState(backend, server, state) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const version = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: `/v3/services/haproxy/runtime/backends/${encodeURIComponent(backend)}/servers/${encodeURIComponent(server)}`,
    params: { version },
    data: { admin_state: state } // ready | maint | drain
  }, 'HAProxy');
  return { ok: true, message: `Serveur ${server} → ${state}` };
}

async function getConfigVersion(c) {
  const data = await request(c.http, { method: 'GET', url: '/v3/services/haproxy/configuration/version' }, 'HAProxy');
  return data;
}

export async function listFrontends() {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/v3/services/haproxy/configuration/frontends' }, 'HAProxy');
  return (data || []).map((f) => ({ name: f.name, mode: f.mode || 'tcp' }));
}

// Complète le rattachement documenté comme manuel dans applyProxyBackend() :
// crée une ACL "Host: <domaine>" sur le frontend choisi, puis une règle de
// commutation vers le backend du proxy. Idempotent au sens large (les index
// sont recalculés à chaque appel), mais n'essaie pas de détecter un doublon
// exact si la même règle a déjà été ajoutée manuellement.
export async function attachProxyToFrontend(proxy, frontendName) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const backendName = `nexus_${proxy.id}`;
  const aclName = `host_nexus_${proxy.id}`;

  // v3 n'accepte pas de POST unitaire sur ces sous-collections structurées
  // (405 "method POST is not allowed, but [GET,PUT] are") — la seule méthode
  // documentée est un PUT qui remplace la collection entière (tableau complet
  // avec index recalculés), pas un ajout élément par élément comme en v2.
  // Trouvé en testant contre un vrai HAProxy (jamais démontré avant faute
  // d'instance réelle disponible).
  const existingAcls = await request(c.http, {
    method: 'GET', url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(frontendName)}/acls`
  }, 'HAProxy');
  const acls = [...(existingAcls || []), { acl_name: aclName, criterion: 'hdr(host)', value: proxy.domain }]
    .map((a, index) => ({ ...a, index }));

  const v1 = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(frontendName)}/acls`,
    params: { version: v1, force_reload: true },
    data: acls
  }, 'HAProxy');

  const existingRules = await request(c.http, {
    method: 'GET', url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(frontendName)}/backend_switching_rules`
  }, 'HAProxy');
  const rules = [...(existingRules || []), { cond: 'if', cond_test: aclName, name: backendName }]
    .map((r, index) => ({ ...r, index }));

  const v2 = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(frontendName)}/backend_switching_rules`,
    params: { version: v2, force_reload: true },
    data: rules
  }, 'HAProxy');

  return { ok: true, message: `${proxy.domain} → ${backendName} rattaché sur le frontend ${frontendName}` };
}

// Crée (ou remplace) un backend + un serveur pour un proxy géré par la console.
// Le rattachement au frontend (ACL/use_backend) n'est volontairement pas fait
// ici (on ne devine pas quel frontend/quelle priorité choisir) : voir
// attachProxyToFrontend(), déclenché explicitement depuis l'interface.
export async function applyProxyBackend(proxy) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const backendName = `nexus_${proxy.id}`;
  const version = await getConfigVersion(c);
  await request(c.http, {
    method: 'POST',
    url: '/v3/services/haproxy/configuration/backends',
    params: { version, force_reload: true },
    data: { name: backendName, mode: 'http', balance: { algorithm: 'roundrobin' } }
  }, 'HAProxy').catch((err) => {
    if (err.status !== 502) throw err; // tolère "existe déjà", géré par le PUT ci-dessous
  });
  // POST (création) d'abord, PUT (mise à jour) en repli : un serveur n'existe
  // pas encore la première fois qu'un backend est créé — PUT seul échoue alors
  // avec 404 "does not exist" (trouvé en testant contre un vrai cluster HAProxy,
  // jamais démontré avant faute d'instance réelle disponible).
  const serverData = { name: 'srv1', address: proxy.targetService, port: Number(proxy.targetPort), check: 'enabled' };
  const version2 = await getConfigVersion(c);
  await request(c.http, {
    method: 'POST',
    url: `/v3/services/haproxy/configuration/backends/${encodeURIComponent(backendName)}/servers`,
    params: { version: version2, force_reload: true },
    data: serverData
  }, 'HAProxy').catch(async (err) => {
    if (err.status !== 502) throw err; // 502 ici = "existe déjà" (voir httpClient.js), on bascule sur une mise à jour
    const version3 = await getConfigVersion(c);
    await request(c.http, {
      method: 'PUT',
      url: `/v3/services/haproxy/configuration/backends/${encodeURIComponent(backendName)}/servers/srv1`,
      params: { version: version3, force_reload: true },
      data: serverData
    }, 'HAProxy');
  });
  return { ok: true, message: `Backend HAProxy ${backendName} appliqué — utilisez "Attacher à un frontend" pour finaliser le routage` };
}

// Éditeur sécurisé (Priorité 4) : lit/écrit le haproxy.cfg complet via
// l'endpoint "raw" de la Data Plane API v3, plutôt que les sous-ressources
// structurées (backends/frontends/acls) utilisées ailleurs dans ce fichier —
// c'est le seul endpoint qui expose la config texte brute, nécessaire pour un
// diff ligne à ligne lisible par un humain. La réponse JSON documentée est
// {_version, data: "<texte>"} ; on tolère aussi un corps texte brut si
// l'instance ne le wrappe pas (observé selon les versions de dataplaneapi).
export async function getRawConfig() {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/v3/services/haproxy/configuration/raw' }, 'HAProxy');
  if (typeof data === 'string') {
    const version = await getConfigVersion(c);
    return { version, config: data };
  }
  return { version: data?._version ?? (await getConfigVersion(c)), config: data?.data ?? '' };
}

// only_validate=true : demande à HAProxy de parser/valider la config sans
// l'appliquer (paramètre documenté de la Data Plane API v3). N'invente pas de
// validation côté NexUs — si l'instance ne supporte pas ce paramètre, l'appel
// échoue explicitement plutôt que de prétendre avoir validé quoi que ce soit.
export async function validateRawConfig(configText) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const version = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: '/v3/services/haproxy/configuration/raw',
    params: { version, only_validate: true, skip_version_check: true },
    headers: { 'Content-Type': 'text/plain' },
    data: configText
  }, 'HAProxy');
  return { ok: true, message: 'Configuration valide' };
}

export async function applyRawConfig(configText) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const version = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: '/v3/services/haproxy/configuration/raw',
    params: { version, force_reload: true },
    headers: { 'Content-Type': 'text/plain' },
    data: configText
  }, 'HAProxy');
  return { ok: true, message: 'Configuration appliquée et rechargée' };
}

// Crée un nouveau frontend HAProxy (écoute sur un port donné). Manquait jusqu'ici :
// seuls le rattachement à un frontend existant (attachProxyToFrontend) et la
// création de backend/serveur (applyProxyBackend) étaient possibles.
export async function createFrontend({ name, port, mode = 'http', defaultBackend }) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  if (!name || !port) throw new IntegrationError('Nom et port requis', { status: 400 });
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new IntegrationError('Nom de frontend invalide (lettres, chiffres, "-", "_" uniquement)', { status: 400 });
  const portNum = Number(port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) throw new IntegrationError('Port invalide (1-65535)', { status: 400 });
  if (!['http', 'tcp'].includes(mode)) throw new IntegrationError('Mode invalide (http ou tcp)', { status: 400 });

  const existing = await listFrontends();
  if (existing.some((f) => f.name === name)) throw new IntegrationError(`Un frontend "${name}" existe déjà`, { status: 409 });

  const version = await getConfigVersion(c);
  await request(c.http, {
    method: 'POST',
    url: '/v3/services/haproxy/configuration/frontends',
    params: { version, force_reload: true },
    data: {
      name,
      mode,
      ...(defaultBackend ? { default_backend: defaultBackend } : {})
    }
  }, 'HAProxy');

  const version2 = await getConfigVersion(c);
  await request(c.http, {
    method: 'POST',
    url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(name)}/binds`,
    params: { version: version2, force_reload: true },
    data: { name: `${name}_bind`, address: '*', port: Number(port) }
  }, 'HAProxy');

  return { ok: true, message: `Frontend HAProxy ${name} créé sur le port ${port}` };
}

// --- Édition visuelle d'un frontend (bindings, règles ACL/use_backend) ---
// La Data Plane API v3 ne permet pas de PATCH élément par élément sur ces
// sous-collections (405, voir attachProxyToFrontend ci-dessus) : toute
// modification remplace la collection entière via PUT avec des index
// recalculés. C'est pourquoi les fonctions ci-dessous prennent/retournent des
// tableaux complets plutôt que des opérations "ajouter un élément".

export async function getFrontendDetail(name) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  const [frontend, binds, acls, rules] = await Promise.all([
    request(c.http, { method: 'GET', url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(name)}` }, 'HAProxy'),
    request(c.http, { method: 'GET', url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(name)}/binds` }, 'HAProxy'),
    request(c.http, { method: 'GET', url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(name)}/acls` }, 'HAProxy'),
    request(c.http, { method: 'GET', url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(name)}/backend_switching_rules` }, 'HAProxy')
  ]);
  return {
    name: frontend?.name || name,
    mode: frontend?.mode || 'tcp',
    defaultBackend: frontend?.default_backend || null,
    binds: (binds || []).map((b) => ({ name: b.name, address: b.address, port: b.port, ssl: !!b.ssl, sslCertificate: b.ssl_certificate || '' })),
    acls: (acls || []).map((a, index) => ({ index: a.index ?? index, aclName: a.acl_name, criterion: a.criterion, value: a.value })),
    rules: (rules || []).map((r, index) => ({ index: r.index ?? index, cond: r.cond || '', condTest: r.cond_test || '', backend: r.name }))
  };
}

function validateBind({ address, port, ssl, sslCertificate }) {
  if (!address) throw new IntegrationError('Adresse de bind requise', { status: 400 });
  const portNum = Number(port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) throw new IntegrationError('Port de bind invalide (1-65535)', { status: 400 });
  if (ssl && !sslCertificate) throw new IntegrationError('Chemin du certificat requis quand SSL est activé (ex: /etc/haproxy/certs/site.pem)', { status: 400 });
}

// Remplace tous les bindings/listeners d'un frontend. Chaque élément :
// { name, address, port, ssl, sslCertificate }. NexUs ne gère aucun store de
// certificats HAProxy (aucun mécanisme d'upload/chemin découvert lors de
// l'audit) : le chemin du certificat est saisi librement par l'utilisateur et
// doit déjà exister sur l'hôte HAProxy — non vérifié côté NexUs.
export async function setFrontendBinds(name, binds) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  if (!Array.isArray(binds) || binds.length === 0) throw new IntegrationError('Au moins un binding est requis', { status: 400 });
  binds.forEach(validateBind);
  const payload = binds.map((b, index) => ({
    name: b.name || `${name}_bind${index}`,
    address: b.address,
    port: Number(b.port),
    ...(b.ssl ? { ssl: true, ssl_certificate: b.sslCertificate } : {})
  }));
  const version = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(name)}/binds`,
    params: { version, force_reload: true },
    data: payload
  }, 'HAProxy');
  return { ok: true, message: `Bindings du frontend ${name} mis à jour (${payload.length})` };
}

// Remplace toutes les règles ACL + use_backend (backend_switching_rules) d'un
// frontend. rules: [{ aclName, criterion, value, backend }] — une ACL et sa
// règle de commutation sont créées ensemble par simplicité d'édition visuelle
// (une règle sans ACL/condition, backend seul, agit comme use_backend
// inconditionnel).
export async function setFrontendRules(name, rules) {
  const c = client();
  if (!c) throw new IntegrationError('HAProxy non configuré', { status: 409 });
  if (!Array.isArray(rules)) throw new IntegrationError('Liste de règles invalide', { status: 400 });
  for (const r of rules) {
    if (!r.backend) throw new IntegrationError('Backend cible requis pour chaque règle', { status: 400 });
    if (r.aclName && (!r.criterion || !r.value)) throw new IntegrationError(`Règle "${r.aclName}" : critère et valeur requis`, { status: 400 });
  }

  const acls = rules
    .filter((r) => r.aclName)
    .map((r, index) => ({ acl_name: r.aclName, criterion: r.criterion, value: r.value, index }));
  const v1 = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(name)}/acls`,
    params: { version: v1, force_reload: true },
    data: acls
  }, 'HAProxy');

  const switchRules = rules.map((r, index) => ({
    index,
    name: r.backend,
    ...(r.aclName ? { cond: 'if', cond_test: r.aclName } : {})
  }));
  const v2 = await getConfigVersion(c);
  await request(c.http, {
    method: 'PUT',
    url: `/v3/services/haproxy/configuration/frontends/${encodeURIComponent(name)}/backend_switching_rules`,
    params: { version: v2, force_reload: true },
    data: switchRules
  }, 'HAProxy');

  return { ok: true, message: `Règles du frontend ${name} mises à jour (${switchRules.length})` };
}
