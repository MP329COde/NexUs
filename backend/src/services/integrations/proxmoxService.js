import { getRawIntegration } from '../../store/settingsStore.js';
import { buildClient, request, notConfigured, IntegrationError } from './httpClient.js';

function client() {
  const cfg = getRawIntegration('proxmox');
  if (!cfg.baseUrl) return null;
  const authHeader = cfg.tokenId && cfg.tokenSecret ? `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}` : undefined;
  return { http: buildClient(cfg.baseUrl, { headers: { Authorization: authHeader } }), cfg };
}

export async function getStatus() {
  const c = client();
  if (!c) return notConfigured('Proxmox');
  const data = await request(c.http, { method: 'GET', url: '/api2/json/nodes' }, 'Proxmox');
  // baseUrl n'est pas un secret (contrairement au token) : exposé ici pour que
  // le bouton "Ouvrir Proxmox" fonctionne pour tout utilisateur authentifié,
  // pas seulement les admins (qui ont seuls accès à /settings).
  return { configured: true, ok: true, message: `${data.data?.length ?? 0} nœud(s) détecté(s)`, baseUrl: c.cfg.baseUrl };
}

export async function listNodes() {
  const c = client();
  if (!c) throw new IntegrationError('Proxmox non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/api2/json/nodes' }, 'Proxmox');
  return (data.data || []).map((n) => ({
    node: n.node, status: n.status, cpu: n.cpu, maxcpu: n.maxcpu,
    maxmem: n.maxmem, mem: n.mem, disk: n.disk, maxdisk: n.maxdisk, uptime: n.uptime
  }));
}

export async function listVMs(node) {
  const c = client();
  if (!c) throw new IntegrationError('Proxmox non configuré', { status: 409 });
  const [qemu, lxc] = await Promise.all([
    request(c.http, { method: 'GET', url: `/api2/json/nodes/${node}/qemu` }, 'Proxmox'),
    request(c.http, { method: 'GET', url: `/api2/json/nodes/${node}/lxc` }, 'Proxmox')
  ]);
  const map = (items, type) => (items.data || []).map((v) => ({ vmid: v.vmid, name: v.name, status: v.status, type, cpu: v.cpu, mem: v.mem, maxmem: v.maxmem }));
  return [...map(qemu, 'qemu'), ...map(lxc, 'lxc')];
}

// Stockage réel Proxmox (agrégé sur tous les nœuds) : chaque entrée de
// /nodes/{node}/storage expose déjà used/avail/total en octets et le type
// de backend (dir, lvmthin, zfspool, nfs, cifs...) — pas besoin de deviner
// depuis /storage (définitions de la config cluster, sans les tailles réelles).
export async function listStorage() {
  const c = client();
  if (!c) throw new IntegrationError('Proxmox non configuré', { status: 409 });
  const nodesData = await request(c.http, { method: 'GET', url: '/api2/json/nodes' }, 'Proxmox');
  const nodes = (nodesData.data || []).map((n) => n.node);
  const perNode = await Promise.all(nodes.map(async (node) => {
    const data = await request(c.http, { method: 'GET', url: `/api2/json/nodes/${node}/storage` }, 'Proxmox').catch(() => ({ data: [] }));
    return (data.data || []).map((s) => ({
      node,
      storage: s.storage,
      type: s.type,
      content: s.content,
      shared: Boolean(s.shared),
      active: Boolean(s.active),
      total: s.total || 0,
      used: s.used || 0,
      avail: s.avail || 0,
      usedFraction: s.total ? s.used / s.total : 0
    }));
  }));
  return perNode.flat();
}

export async function vmAction(node, vmid, type, action) {
  const c = client();
  if (!c) throw new IntegrationError('Proxmox non configuré', { status: 409 });
  const allowed = ['start', 'stop', 'shutdown', 'reboot'];
  if (!allowed.includes(action)) throw new IntegrationError(`Action non autorisée: ${action}`, { status: 400 });
  await request(c.http, { method: 'POST', url: `/api2/json/nodes/${node}/${type}/${vmid}/status/${action}` }, 'Proxmox');
  return { ok: true, message: `${action} envoyé à ${type}/${vmid} sur ${node}` };
}
