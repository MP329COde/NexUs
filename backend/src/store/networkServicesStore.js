import { v4 as uuid } from 'uuid';
import { readStore, writeStore } from './jsonStore.js';

// Suivi déclaratif des services réseau internes (VLAN/sous-réseaux, plages
// DHCP, enregistrements DNS internes, IPs VPN) — même principe que
// volumeStore.js pour le stockage : pas de découverte automatique ni
// d'intégration DHCP/DNS/VPN en direct (aucune n'est branchée aujourd'hui),
// l'admin déclare ce qui existe réellement sur son infrastructure pour que
// la console en garde une vue centralisée et cohérente.

function makeCrud(key, requiredFields, normalize) {
  function list() {
    return readStore(key) || [];
  }
  function create(payload) {
    for (const f of requiredFields) {
      if (!payload?.[f]) throw Object.assign(new Error(`Champ requis manquant : ${f}`), { status: 400 });
    }
    const items = list();
    const entry = normalize({ id: uuid(), createdAt: new Date().toISOString(), ...payload });
    items.push(entry);
    writeStore(key, items);
    return entry;
  }
  function update(id, patch) {
    const items = list();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    const next = normalize({ ...items[idx], ...patch });
    items[idx] = next;
    writeStore(key, items);
    return next;
  }
  function remove(id) {
    const items = list();
    const next = items.filter((i) => i.id !== id);
    writeStore(key, next);
    return next.length !== items.length;
  }
  return { list, create, update, remove };
}

export const vlans = makeCrud('networkVlans', ['name', 'vlanId', 'cidr'], (v) => ({
  ...v, vlanId: Number(v.vlanId) || 0, gateway: v.gateway || '', description: v.description || ''
}));

export const dhcpRanges = makeCrud('networkDhcpRanges', ['vlanId', 'rangeStart', 'rangeEnd'], (r) => ({
  ...r, leaseMinutes: Number(r.leaseMinutes) || 1440, notes: r.notes || ''
}));

export const dnsRecords = makeCrud('networkDnsRecords', ['name', 'type', 'value'], (d) => ({
  ...d, type: ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'PTR'].includes(d.type) ? d.type : 'A', ttl: Number(d.ttl) || 3600
}));

export const vpnClients = makeCrud('networkVpnClients', ['name', 'assignedIp'], (c) => ({
  ...c, vlanId: c.vlanId || null, enabled: c.enabled !== false, notes: c.notes || ''
}));
