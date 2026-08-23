import { listProxies } from '../store/proxyStore.js';
import * as haproxy from './integrations/haproxyService.js';
import * as traefik from './integrations/traefikService.js';
import * as proxmox from './integrations/proxmoxService.js';
import * as kubernetes from './integrations/kubernetesService.js';
import * as ovh from './integrations/ovhService.js';
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

  // Couche DNS : zones OVH réellement configurées, plus les domaines
  // *.duckdns.org déjà déclarés parmi les proxies (DuckDNS n'a pas d'API de
  // liste des sous-domaines, voir duckdnsService.js — on ne peut afficher que
  // ceux que NexUs connaît déjà via un proxy).
  const dnsNodes = [];
  const ovhCfg = getRawIntegration('ovh');
  if (ovhCfg.appKey) {
    const zones = await safe(() => ovh.listZones());
    for (const z of zones || []) dnsNodes.push({ id: `dns-ovh-${z}`, label: z, meta: 'Zone OVH', tone: 'ok', linkTo: '/network/proxies' });
  }
  const duckdnsCfg = getRawIntegration('duckdns');
  if (duckdnsCfg.token) {
    const proxiesForDns = listProxies().filter((p) => p.domain?.endsWith('.duckdns.org'));
    for (const p of proxiesForDns) dnsNodes.push({ id: `dns-duckdns-${p.id}`, label: p.domain, meta: 'DuckDNS', tone: 'ok', linkTo: '/network/proxies' });
  }
  if (dnsNodes.length) layers.push({ id: 'dns', label: 'DNS', nodes: dnsNodes });

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

      // Dernière couche : les VM/LXC réels de chaque nœud, pas seulement les
      // nœuds Proxmox eux-mêmes — c'est la "vraie topologie des VMs" demandée,
      // au lieu de s'arrêter au niveau hyperviseur. Interrogé nœud par nœud
      // (l'API Proxmox n'a pas d'endpoint global "toutes les VM") et limité
      // pour rester lisible sur un cluster chargé.
      const vmsByNode = await Promise.all(nodes.map((n) => safe(() => proxmox.listVMs(n.node)).then((vms) => ({ node: n.node, vms: vms || [] }))));
      const allVms = vmsByNode.flatMap(({ node, vms }) => vms.map((v) => ({ ...v, node })));
      if (allVms.length) {
        layers.push({
          id: 'proxmox-vms',
          label: `Machines virtuelles & conteneurs (${allVms.length})`,
          nodes: allVms.slice(0, 40).map((v) => ({
            id: `vm-${v.node}-${v.vmid}`,
            label: v.name || `${v.type}/${v.vmid}`,
            meta: `${v.node} · ${v.type.toUpperCase()} #${v.vmid}`,
            tone: v.status === 'running' ? 'ok' : v.status === 'stopped' ? 'mut' : 'warn',
            linkTo: '/infrastructure'
          }))
        });
      }

      // Dernière couche : le stockage Proxmox (used/avail réels par pool,
      // /nodes/{node}/storage) — complète la chaîne demandée jusqu'à "Stockage".
      const allStorage = await safe(() => proxmox.listStorage());
      if (allStorage?.length) {
        layers.push({
          id: 'proxmox-storage',
          label: `Stockage (${allStorage.length})`,
          nodes: allStorage.map((s) => ({
            id: `storage-${s.node}-${s.storage}`,
            label: s.storage,
            meta: `${s.node} · ${s.type}${s.total ? ` · ${Math.round(s.usedFraction * 100)}% utilisé` : ''}`,
            tone: s.usedFraction > 0.9 ? 'crit' : s.usedFraction > 0.75 ? 'warn' : 'ok',
            linkTo: '/infrastructure'
          }))
        });
      }
    }
  }

  return { layers, generatedAt: new Date().toISOString() };
}
