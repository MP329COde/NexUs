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
  return { configured: true, ok: true, message: `${data.data?.length ?? 0} nœud(s) détecté(s)` };
}

export async function listNodes() {
  const c = client();
  if (!c) throw new IntegrationError('Proxmox non configuré', { status: 409 });
  const data = await request(c.http, { method: 'GET', url: '/api2/json/nodes' }, 'Proxmox');
  return (data.data || []).map((n) => ({ node: n.node, status: n.status, cpu: n.cpu, maxmem: n.maxmem, mem: n.mem, uptime: n.uptime }));
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

export async function vmAction(node, vmid, type, action) {
  const c = client();
  if (!c) throw new IntegrationError('Proxmox non configuré', { status: 409 });
  const allowed = ['start', 'stop', 'shutdown', 'reboot'];
  if (!allowed.includes(action)) throw new IntegrationError(`Action non autorisée: ${action}`, { status: 400 });
  await request(c.http, { method: 'POST', url: `/api2/json/nodes/${node}/${type}/${vmid}/status/${action}` }, 'Proxmox');
  return { ok: true, message: `${action} envoyé à ${type}/${vmid} sur ${node}` };
}
