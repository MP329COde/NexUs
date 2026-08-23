import { listProxies } from '../store/proxyStore.js';
import * as haproxy from './integrations/haproxyService.js';
import * as traefik from './integrations/traefikService.js';
import * as proxmox from './integrations/proxmoxService.js';
import * as kubernetes from './integrations/kubernetesService.js';
import * as argocd from './integrations/argocdService.js';
import * as ovh from './integrations/ovhService.js';
import { getRawIntegration, listK8sClusters } from '../store/settingsStore.js';

async function safe(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// Construit la topologie à partir de ce qui est réellement configuré, plutôt
// que d'illustrer une infrastructure fictive : chaque couche/nœud est absent
// si l'intégration correspondante ne l'est pas.
//
// Deux représentations de la même donnée sont renvoyées :
//  - `layers` (historique, Lot 44) : chaîne de couches consommée par la vue
//    liste conservée dans le frontend — inchangée dans sa forme.
//  - `graph` (ce lot, Groupe C / Lot C1) : nœuds + arêtes explicites, avec un
//    `group` par nœud (regroupement visuel par infrastructure) pour le rendu
//    react-flow. Les arêtes représentent de vraies relations connues (VM →
//    hôte Proxmox via `vm.node`, pod → nœud K8s via `pod.node`, backend
//    HAProxy → routeur, etc.), pas un chaînage générique couche→couche.
export async function getTopology() {
  const layers = [];
  const gNodes = [];
  const gEdges = [];
  const addEdge = (source, target, kind = 'default') => {
    if (!source || !target) return;
    gEdges.push({ id: `${source}=>${target}`, source, target, kind });
  };

  // Nœud racine "réseau" (routeur / entrée) : synthétique, affiché seulement
  // si au moins une ressource réseau réelle existe en aval (DNS ou proxies) —
  // jamais affiché seul, pour ne pas illustrer un routeur fictif.
  let hasNetworkRoot = false;
  const ensureNetworkRoot = () => {
    if (hasNetworkRoot) return;
    hasNetworkRoot = true;
    gNodes.push({
      id: 'net-root',
      label: 'Entrée réseau',
      meta: 'Routeur / reverse proxy',
      tone: 'info',
      type: 'network',
      group: 'network',
      linkTo: '/network/proxies'
    });
  };

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
  if (dnsNodes.length) {
    layers.push({ id: 'dns', label: 'DNS', nodes: dnsNodes });
    ensureNetworkRoot();
    for (const n of dnsNodes) {
      gNodes.push({ ...n, type: 'dns', group: 'network' });
      addEdge('net-root', n.id, 'dns');
    }
  }

  const proxies = listProxies();
  if (proxies.length) {
    const proxyNodes = proxies.map((p) => ({
      id: `proxy-${p.id}`,
      label: p.domain,
      meta: `${p.engine} → ${p.targetService}:${p.targetPort}`,
      tone: p.status === 'applied' ? 'ok' : p.status === 'error' ? 'crit' : 'mut',
      linkTo: '/network/proxies'
    }));
    layers.push({ id: 'proxies', label: 'Proxies gérés par la console', nodes: proxyNodes });
    ensureNetworkRoot();
    for (const [i, n] of proxyNodes.entries()) {
      gNodes.push({ ...n, type: 'proxy', group: 'network', engine: proxies[i].engine });
      // Relié au nœud DNS correspondant si connu, sinon directement à la racine réseau.
      const dnsMatch = dnsNodes.find((d) => d.label === proxies[i].domain);
      addEdge(dnsMatch ? dnsMatch.id : 'net-root', n.id, 'proxy');
    }
  }

  const haproxyCfg = getRawIntegration('haproxy');
  let haproxyBackends = null;
  if (haproxyCfg.dataPlaneUrl) {
    const backends = await safe(() => haproxy.listBackends());
    if (backends?.length) {
      haproxyBackends = backends;
      const nodes = backends.map((b) => ({ id: `hap-${b.name}`, label: b.name, meta: `${b.mode} · ${b.balance || 'roundrobin'}`, tone: 'info', linkTo: '/network/haproxy' }));
      layers.push({ id: 'haproxy', label: 'Backends HAProxy', nodes });
      ensureNetworkRoot();
      for (const n of nodes) {
        gNodes.push({ ...n, type: 'haproxy', group: 'network' });
        addEdge('net-root', n.id, 'haproxy');
      }
    }
  }

  const traefikCfg = getRawIntegration('traefik');
  if (traefikCfg.apiUrl) {
    const routers = await safe(() => traefik.listRouters());
    if (routers?.length) {
      const nodes = routers.map((r) => ({ id: `tr-${r.name}`, label: r.name, meta: r.rule, tone: r.status === 'enabled' ? 'ok' : 'mut', linkTo: '/network/proxies' }));
      layers.push({ id: 'traefik', label: 'Routeurs Traefik', nodes });
      ensureNetworkRoot();
      for (const n of nodes) {
        gNodes.push({ ...n, type: 'traefik', group: 'network' });
        addEdge('net-root', n.id, 'traefik');
      }
    }
  }

  // Lot C4 (multi-cluster) : chaque cluster Kubernetes déclaré (voir
  // store/settingsStore.js#listK8sClusters, qui migre automatiquement
  // l'ancienne config unique en un seul cluster par défaut) devient son
  // propre sous-graphe "k8s-cluster-<id>", posé côte à côte dans le groupe
  // visuel `kubernetes` — pas fusionnés en un seul nœud. C'est l'interprétation
  // retenue pour "relier les clusters les uns aux autres" : les représenter
  // comme plusieurs infrastructures distinctes appartenant à la même vue
  // topologique (regroupement logique/visuel), PAS une fédération technique
  // réelle (type kubefed) — hors de portée de ce lot et non ce qui a été
  // construit ici (voir todo.md pour le détail de cette interprétation).
  const k8sClusters = listK8sClusters().filter((c) => c.apiServer);
  let firstClusterNodeId = null;
  let anyClusterAdded = false;

  for (const cluster of k8sClusters) {
    const clusterNodeId = `k8s-cluster-${cluster.id}`;
    let clusterNodeAdded = false;
    const ensureK8sCluster = () => {
      if (clusterNodeAdded) return;
      clusterNodeAdded = true;
      anyClusterAdded = true;
      if (!firstClusterNodeId) firstClusterNodeId = clusterNodeId;
      gNodes.push({
        id: clusterNodeId,
        label: `Cluster Kubernetes · ${cluster.name}`,
        meta: cluster.apiServer,
        tone: 'vio',
        type: 'k8s-cluster',
        group: 'kubernetes',
        clusterId: cluster.id,
        linkTo: `/kubernetes?cluster=${cluster.id}`
      });
      // Relie chaque cluster à la chaîne réseau amont (HAProxy backend en
      // priorité, sinon la racine réseau) — même approximation qu'avant ce
      // lot : NexUs ne connaît pas la table de routage réelle HAProxy→backend
      // K8s par cluster, seulement que les intégrations sont configurées
      // simultanément (tous les clusters pointent vers la même entrée réseau
      // faute de mapping explicite proxy↔cluster).
      if (haproxyBackends?.length) addEdge(`hap-${haproxyBackends[0].name}`, clusterNodeId, 'route');
      else if (hasNetworkRoot) addEdge('net-root', clusterNodeId, 'route');
    };

    const services = await safe(() => kubernetes.listServices(undefined, cluster.id));
    if (services?.length) {
      ensureK8sCluster();
      const nodes = services.slice(0, 12).map((s) => ({ id: `svc-${cluster.id}-${s.namespace}-${s.name}`, label: s.name, meta: `${s.namespace} · ${s.type}`, tone: 'vio', linkTo: `/kubernetes?cluster=${cluster.id}` }));
      layers.push({ id: `k8s-${cluster.id}`, label: `Services Kubernetes · ${cluster.name}`, nodes });
      for (const [i, n] of nodes.entries()) {
        gNodes.push({ ...n, type: 'k8s-service', group: 'kubernetes', clusterId: cluster.id, namespace: services[i].namespace });
        addEdge(clusterNodeId, n.id, 'service');
      }
    }

    // Nœuds physiques du cluster K8s (kubectl get nodes).
    const clusterNodes = await safe(() => kubernetes.listClusterNodes(cluster.id));
    if (clusterNodes?.length) {
      ensureK8sCluster();
      const nodes = clusterNodes.map((n) => ({
        id: `k8sn-${cluster.id}-${n.name}`,
        label: n.name,
        meta: `${n.roles.length ? n.roles.join(',') : 'worker'} · ${n.kubeletVersion || ''}`,
        tone: n.ready ? 'ok' : 'crit',
        linkTo: `/kubernetes?cluster=${cluster.id}`
      }));
      layers.push({ id: `k8s-nodes-${cluster.id}`, label: `Nœuds Kubernetes · ${cluster.name}`, nodes });
      for (const n of nodes) {
        gNodes.push({ ...n, type: 'k8s-node', group: 'kubernetes', clusterId: cluster.id });
        addEdge(clusterNodeId, n.id, 'node');
      }

      // Pods réels, rattachés à leur nœud physique quand il est connu — c'est
      // la relation "sous-composant" demandée (cluster → nœud → pod), limitée
      // pour rester lisible sur un cluster chargé.
      const pods = await safe(() => kubernetes.listPods(undefined, cluster.id));
      if (pods?.length) {
        const podNodes = pods.slice(0, 60).map((p) => ({
          id: `pod-${cluster.id}-${p.namespace}-${p.name}`,
          label: p.name,
          meta: `${p.namespace} · ${p.phase}${p.restarts ? ` · ${p.restarts} redémarrages` : ''}`,
          tone: p.phase === 'Running' ? 'ok' : p.phase === 'Failed' ? 'crit' : 'warn',
          linkTo: `/kubernetes?cluster=${cluster.id}`
        }));
        layers.push({ id: `k8s-pods-${cluster.id}`, label: `Pods (${pods.length}) · ${cluster.name}`, nodes: podNodes });
        for (const [i, n] of podNodes.entries()) {
          gNodes.push({ ...n, type: 'k8s-pod', group: 'kubernetes', clusterId: cluster.id, namespace: pods[i].namespace });
          const hostNode = clusterNodes.find((cn) => cn.name === pods[i].node);
          addEdge(hostNode ? `k8sn-${cluster.id}-${hostNode.name}` : clusterNodeId, n.id, 'pod');
        }
      }
    }

    // Déploiements : sous-composant demandé, rattachés au cluster (relation
    // exacte deployment→pod nécessiterait un appel par ressource — non fait
    // pour rester dans le budget de ce lot, voir todo.md).
    const deployments = await safe(() => kubernetes.listDeployments(undefined, cluster.id));
    if (deployments?.length) {
      ensureK8sCluster();
      const nodes = deployments.slice(0, 30).map((d) => ({
        id: `deploy-${cluster.id}-${d.namespace}-${d.name}`,
        label: d.name,
        meta: `${d.namespace} · ${d.ready}/${d.replicas} prêts`,
        tone: d.ready >= d.replicas && d.replicas > 0 ? 'ok' : 'warn',
        linkTo: `/kubernetes?cluster=${cluster.id}`
      }));
      layers.push({ id: `k8s-deployments-${cluster.id}`, label: `Déploiements (${deployments.length}) · ${cluster.name}`, nodes });
      for (const [i, n] of nodes.entries()) {
        gNodes.push({ ...n, type: 'k8s-deployment', group: 'kubernetes', clusterId: cluster.id, namespace: deployments[i].namespace });
        addEdge(clusterNodeId, n.id, 'deployment');
      }
    }
  }

  // Argo CD : intégration unique (non multi-instance dans NexUs), rattachée
  // au premier cluster ayant produit un nœud dans le graphe — approximation
  // documentée : NexUs ne sait pas, à ce lot, quel cluster précis une
  // application Argo CD donnée déploie effectivement (limite déjà présente
  // avant ce lot, inchangée ici hormis le nœud d'accroche qui devient le
  // premier cluster plutôt qu'un nœud "k8s-cluster" unique).
  const argocdCfg = getRawIntegration('argocd');
  if (argocdCfg.token && anyClusterAdded) {
    const apps = await safe(() => argocd.listApplications());
    if (apps?.length) {
      const argoNodeId = 'argocd-root';
      gNodes.push({ id: argoNodeId, label: 'Argo CD', meta: `${apps.length} application(s)`, tone: 'info', type: 'argocd', group: 'kubernetes', linkTo: '/deployments' });
      addEdge(firstClusterNodeId, argoNodeId, 'argocd');
      const appNodes = apps.slice(0, 30).map((a) => ({
        id: `argoapp-${a.name}`,
        label: a.name,
        meta: `${a.syncStatus || a.status || ''} ${a.healthStatus ? `· ${a.healthStatus}` : ''}`.trim(),
        tone: (a.healthStatus === 'Healthy' || a.status === 'Healthy') ? 'ok' : (a.syncStatus === 'OutOfSync' ? 'warn' : 'info'),
        linkTo: '/deployments'
      }));
      layers.push({ id: 'argocd', label: 'Applications Argo CD', nodes: appNodes });
      for (const n of appNodes) {
        gNodes.push({ ...n, type: 'argocd-app', group: 'kubernetes' });
        addEdge(argoNodeId, n.id, 'argocd-app');
      }
    }
  }

  const proxmoxCfg = getRawIntegration('proxmox');
  if (proxmoxCfg.baseUrl) {
    const nodes = await safe(() => proxmox.listNodes());
    if (nodes?.length) {
      const pveNodes = nodes.map((n) => ({ id: `pve-${n.node}`, label: n.node, meta: `${Math.round((n.cpu || 0) * 100)}% CPU`, tone: n.status === 'online' ? 'ok' : 'crit', linkTo: '/infrastructure' }));
      layers.push({ id: 'proxmox', label: 'Infrastructure Proxmox', nodes: pveNodes });
      for (const n of pveNodes) {
        gNodes.push({ ...n, type: 'proxmox-host', group: 'proxmox' });
        // Relié à la chaîne réseau/K8s en amont quand elle existe (approximation :
        // NexUs ne connaît pas le câblage physique réel HAProxy→hyperviseur).
        if (anyClusterAdded) addEdge(firstClusterNodeId, n.id, 'infra');
        else if (hasNetworkRoot) addEdge('net-root', n.id, 'infra');
      }

      // Dernière couche : les VM/LXC réels de chaque nœud, pas seulement les
      // nœuds Proxmox eux-mêmes — c'est la "vraie topologie des VMs" demandée,
      // au lieu de s'arrêter au niveau hyperviseur. Interrogé nœud par nœud
      // (l'API Proxmox n'a pas d'endpoint global "toutes les VM") et limité
      // pour rester lisible sur un cluster chargé.
      const vmsByNode = await Promise.all(nodes.map((n) => safe(() => proxmox.listVMs(n.node)).then((vms) => ({ node: n.node, vms: vms || [] }))));
      const allVms = vmsByNode.flatMap(({ node, vms }) => vms.map((v) => ({ ...v, node })));
      if (allVms.length) {
        const vmNodes = allVms.slice(0, 40).map((v) => ({
          id: `vm-${v.node}-${v.vmid}`,
          label: v.name || `${v.type}/${v.vmid}`,
          meta: `${v.node} · ${v.type.toUpperCase()} #${v.vmid}`,
          tone: v.status === 'running' ? 'ok' : v.status === 'stopped' ? 'mut' : 'warn',
          linkTo: '/infrastructure'
        }));
        layers.push({ id: 'proxmox-vms', label: `Machines virtuelles & conteneurs (${allVms.length})`, nodes: vmNodes });
        for (const [i, n] of vmNodes.entries()) {
          gNodes.push({ ...n, type: 'proxmox-vm', group: 'proxmox' });
          // Relation réelle VM → hôte, via le champ `node` déjà remonté par Proxmox.
          addEdge(`pve-${allVms[i].node}`, n.id, 'vm');
        }
      }

      // Dernière couche : le stockage Proxmox (used/avail réels par pool,
      // /nodes/{node}/storage) — complète la chaîne demandée jusqu'à "Stockage".
      const allStorage = await safe(() => proxmox.listStorage());
      if (allStorage?.length) {
        const storageNodes = allStorage.map((s) => ({
          id: `storage-${s.node}-${s.storage}`,
          label: s.storage,
          meta: `${s.node} · ${s.type}${s.total ? ` · ${Math.round(s.usedFraction * 100)}% utilisé` : ''}`,
          tone: s.usedFraction > 0.9 ? 'crit' : s.usedFraction > 0.75 ? 'warn' : 'ok',
          linkTo: '/infrastructure'
        }));
        layers.push({ id: 'proxmox-storage', label: `Stockage (${allStorage.length})`, nodes: storageNodes });
        for (const [i, n] of storageNodes.entries()) {
          gNodes.push({ ...n, type: 'proxmox-storage', group: 'proxmox' });
          addEdge(`pve-${allStorage[i].node}`, n.id, 'storage');
        }
      }
    }
  }

  return {
    layers,
    graph: { nodes: gNodes, edges: gEdges },
    generatedAt: new Date().toISOString()
  };
}
