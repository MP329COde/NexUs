import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

// DuckDNS n'a pas d'API de "lecture" — un unique endpoint /update sert à la
// fois à créer et mettre à jour un sous-domaine <sub>.duckdns.org, voir
// https://www.duckdns.org/spec.jsp. Le token est un UUID unique par compte,
// partagé par tous les sous-domaines de ce compte.
function client() {
  const cfg = getRawIntegration('duckdns');
  if (!cfg.token) return null;
  return { http: buildClient('https://www.duckdns.org'), cfg };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('DuckDNS');
  return { configured: true, ok: true, message: 'Token DuckDNS enregistré — utilisez "Mettre à jour" sur un domaine *.duckdns.org.' };
}

// `ip` vide laisse DuckDNS détecter l'IP publique de la requête sortante de
// cette console — pratique pour un DDNS classique (IP dynamique du domicile).
export async function updateRecord(subdomain, ip) {
  const c = client();
  if (!c) throw new IntegrationError('DuckDNS non configuré', { status: 409 });
  const params = { domains: subdomain, token: c.cfg.token, verbose: 'true' };
  if (ip) params.ip = ip;
  const data = await request(c.http, { method: 'GET', url: '/update', params, responseType: 'text' }, 'DuckDNS');
  const text = String(data).trim();
  if (!text.startsWith('OK')) throw new IntegrationError(`DuckDNS: réponse inattendue (${text || 'vide'})`, { status: 502 });
  const [, resolvedIp] = text.split('\n');
  return { ok: true, message: `${subdomain}.duckdns.org → ${resolvedIp || ip || 'IP détectée automatiquement'}` };
}
