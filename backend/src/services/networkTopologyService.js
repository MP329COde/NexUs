import { listProxies } from '../store/proxyStore.js';
import * as haproxy from './integrations/haproxyService.js';
import * as traefik from './integrations/traefikService.js';
import * as proxmox from './integrations/proxmoxService.js';
import * as kubernetes from './integrations/kubernetesService.js';
import { getRawIntegration } from '../store/settingsStore.js';

async function safe(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// Construit la topologie à partir de ce qui est réellement configuré, plutôt
// que d'illustrer une infrastructure fictive : chaque couche est absente si
// l'intégration correspondante ne l'est pas. Le nœud Proxmox pointe vers
// /infrastructure plutôt que de dupliquer le détail des VM/LXC ici.
export async function getTopology() {
  const layers = [];

  const proxies = listProxies();
  if (proxies.length) {
    layers.push({
      id: 'proxies',
      label: 'Proxies gérés par la console',
      nodes: proxies.map((p) => ({
        id: `proxy-${p.id}`,
        label: p.domain,
        meta: `${p.engine} → ${p.targetService}:${p.targetPort}`,
        tone: p.status === 'applied' ? 'ok' : p.status === 'error' ? 'crit' : 'mut',
        linkTo: '/network/proxies'
      }))
    });
  }

  const haproxyCfg = getRawIntegration('haproxy');
  if (haproxyCfg.dataPlaneUrl) {
    const backends = await safe(() => haproxy.listBackends());
    if (backends?.length) {
      layers.push({
        id: 'haproxy',
        label: 'Backends HAProxy',
        nodes: backends.map((b) => ({ id: `hap-${b.name}`, label: b.name, meta: `${b.mode} · ${b.balance || 'roundrobin'}`, tone: 'info', linkTo: '/network/haproxy' }))
      });
    }
  }

  const traefikCfg = getRawIntegration('traefik');
  if (traefikCfg.apiUrl) {
    const routers = await safe(() => traefik.listRouters());
    if (routers?.length) {
      layers.push({
        id: 'traefik',
        label: 'Routeurs Traefik',
        nodes: routers.map((r) => ({ id: `tr-${r.name}`, label: r.name, meta: r.rule, tone: r.status === 'enabled' ? 'ok' : 'mut', linkTo: '/network/proxies' }))
      });
    }
  }

  const k8sCfg = getRawIntegration('kubernetes');
  if (k8sCfg.apiServer) {
    const services = await safe(() => kubernetes.listServices());
    if (services?.length) {
      layers.push({
        id: 'k8s',
        label: 'Services Kubernetes',
        nodes: services.slice(0, 12).map((s) => ({ id: `svc-${s.namespace}-${s.name}`, label: s.name, meta: `${s.namespace} · ${s.type}`, tone: 'vio', linkTo: '/kubernetes' }))
      });
    }
  }

  const proxmoxCfg = getRawIntegration('proxmox');
  if (proxmoxCfg.baseUrl) {
    const nodes = await safe(() => proxmox.listNodes());
    if (nodes?.length) {
      layers.push({
        id: 'proxmox',
        label: 'Infrastructure Proxmox',
        nodes: nodes.map((n) => ({ id: `pve-${n.node}`, label: n.node, meta: `${Math.round((n.cpu || 0) * 100)}% CPU`, tone: n.status === 'online' ? 'ok' : 'crit', linkTo: '/infrastructure' }))
      });
    }
  }

  return { layers, generatedAt: new Date().toISOString() };
}
