import * as proxmox from './integrations/proxmoxService.js';
import { logger } from '../utils/logger.js';

const SAMPLE_INTERVAL_MS = 30_000;
const MAX_SAMPLES = 720; // ~6h à 30s d'intervalle

// Historique en mémoire uniquement (pas persisté en base) : c'est un flux
// "temps réel" pour le graphe de charge de l'accueil, pas un enregistrement
// durable — il se vide au redémarrage du backend, ce qui est acceptable ici.
let samples = [];

async function sample() {
  let nodes;
  try {
    nodes = await proxmox.listNodes();
  } catch {
    return; // Proxmox non configuré : pas d'échantillon, le graphe restera vide
  }
  const online = nodes.filter((n) => n.status === 'online');
  if (online.length === 0) return;
  const cpuPct = Math.round((online.reduce((s, n) => s + (n.cpu || 0), 0) / online.length) * 100);
  const ramPct = Math.round((online.reduce((s, n) => s + (n.maxmem ? n.mem / n.maxmem : 0), 0) / online.length) * 100);
  // Détail par nœud (pas seulement la moyenne globale ci-dessus) : alimente
  // les mini-graphiques par nœud de la page Infrastructure, sans poller
  // Proxmox une deuxième fois pour ça (voir ProxmoxPage.jsx).
  const perNode = {};
  for (const n of online) {
    perNode[n.node] = { cpuPct: Math.round((n.cpu || 0) * 100), ramPct: Math.round((n.maxmem ? n.mem / n.maxmem : 0) * 100) };
  }
  samples.push({ ts: new Date().toISOString(), cpuPct, ramPct, nodes: perNode });
  if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES);
}

export function getSamples() {
  return samples;
}

export function scheduleInfraLoadSampling() {
  const run = () => { sample().catch((err) => logger.error({ err }, 'Échec du relevé de charge infra')); setTimeout(run, SAMPLE_INTERVAL_MS); };
  run();
}

// Répartition des charges (VM/LXC via Proxmox, Pods via Kubernetes) : lue en
// direct à chaque appel plutôt qu'échantillonnée, un simple comptage courant
// suffit pour un donut (pas besoin d'historique).
export async function getWorkloadCounts() {
  let vms = null;
  let lxc = null;
  try {
    const nodes = await proxmox.listNodes();
    const perNode = await Promise.all(nodes.map((n) => proxmox.listVMs(n.node).catch(() => [])));
    const all = perNode.flat();
    vms = all.filter((v) => v.type === 'qemu').length;
    lxc = all.filter((v) => v.type === 'lxc').length;
  } catch {
    // Proxmox non configuré : vms/lxc restent null ("Non configuré")
  }
  return { vms, lxc, docker: null };
}
