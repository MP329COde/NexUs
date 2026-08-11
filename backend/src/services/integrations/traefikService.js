import fs from 'node:fs';
import path from 'node:path';
import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

function client() {
  const cfg = getRawIntegration('traefik');
  if (!cfg.apiUrl) return null;
  return { http: buildClient(cfg.apiUrl, { auth: cfg.username ? { username: cfg.username, password: cfg.password || '' } : undefined }), cfg };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('Traefik');
  const routers = await request(c.http, { method: 'GET', url: '/api/http/routers' }, 'Traefik');
  return { configured: true, ok: true, message: `${routers.length} routeurs actifs` };
}

export async function listRouters() {
  const c = client();
  if (!c) throw new IntegrationError('Traefik non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/api/http/routers' }, 'Traefik');
  return data.map((r) => ({ name: r.name, rule: r.rule, service: r.service, status: r.status, tls: Boolean(r.tls), entryPoints: r.entryPoints }));
}

export async function listServices() {
  const c = client();
  if (!c) throw new IntegrationError('Traefik non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/api/http/services' }, 'Traefik');
  return data.map((s) => ({ name: s.name, type: s.type, status: s.status, servers: s.serverStatus ? Object.keys(s.serverStatus).length : 0 }));
}

// Provider de fichiers dynamiques Traefik: écrit un fragment YAML par proxy géré
// par la console dans le dossier surveillé par Traefik (providers.file.directory).
export function writeDynamicRoute(proxy) {
  const cfg = getRawIntegration('traefik');
  if (!cfg.dynamicConfigDir) {
    throw new IntegrationError('Aucun dossier de configuration dynamique Traefik défini (Paramètres → Traefik)', { status: 409 });
  }
  fs.mkdirSync(cfg.dynamicConfigDir, { recursive: true });
  const routerName = `nexus-${proxy.id}`;
  const serviceName = `nexus-${proxy.id}-svc`;
  const yaml = `http:
  routers:
    ${routerName}:
      rule: "Host(\`${proxy.domain}\`)"
      service: ${serviceName}
      entryPoints: ["${proxy.tls ? 'websecure' : 'web'}"]
${proxy.tls ? `      tls:\n        certResolver: ${proxy.certResolver || 'default'}\n` : ''}  services:
    ${serviceName}:
      loadBalancer:
        servers:
          - url: "http://${proxy.targetService}:${proxy.targetPort}"
`;
  const file = path.join(cfg.dynamicConfigDir, `${routerName}.yml`);
  fs.writeFileSync(file, yaml, 'utf8');
  return { ok: true, message: `Route Traefik écrite (${file})`, file };
}

export function removeDynamicRoute(proxy) {
  const cfg = getRawIntegration('traefik');
  if (!cfg.dynamicConfigDir) return { ok: true, message: 'Aucune configuration dynamique à retirer' };
  const file = path.join(cfg.dynamicConfigDir, `nexus-${proxy.id}.yml`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { ok: true, message: 'Route Traefik retirée' };
}
