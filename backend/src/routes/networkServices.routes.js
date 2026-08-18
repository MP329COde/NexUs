import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { vlans, dhcpRanges, dnsRecords, vpnClients } from '../store/networkServicesStore.js';
import { logAudit } from '../services/auditService.js';

// Suivi déclaratif des VLAN/sous-réseaux, plages DHCP, enregistrements DNS
// internes et IPs VPN — voir store/networkServicesStore.js pour le pourquoi
// (même principe que le stockage : pas d'intégration DHCP/DNS/VPN réelle
// branchée aujourd'hui). Lecture ouverte à tout utilisateur authentifié ;
// écriture réservée à l'admin, cohérent avec les autres domaines réseau
// (routes/proxies.routes.js, routes/dns.routes.js, routes/haproxy.routes.js).
const router = Router();
router.use(requireAuth);

function crudRoutes(path, store, auditPrefix) {
  router.get(`/${path}`, (req, res) => {
    res.json({ ok: true, items: store.list() });
  });
  router.post(`/${path}`, requireRole('admin'), asyncHandler(async (req, res) => {
    const entry = store.create(req.body || {});
    logAudit(req, `${auditPrefix}.create`, { id: entry.id });
    res.status(201).json({ ok: true, item: entry });
  }));
  router.put(`/${path}/:id`, requireRole('admin'), asyncHandler(async (req, res) => {
    const updated = store.update(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ ok: false, error: 'Introuvable' });
    res.json({ ok: true, item: updated });
  }));
  router.delete(`/${path}/:id`, requireRole('admin'), asyncHandler(async (req, res) => {
    const removed = store.remove(req.params.id);
    if (!removed) return res.status(404).json({ ok: false, error: 'Introuvable' });
    logAudit(req, `${auditPrefix}.delete`, { id: req.params.id });
    res.json({ ok: true });
  }));
}

crudRoutes('vlans', vlans, 'network.vlan');
crudRoutes('dhcp-ranges', dhcpRanges, 'network.dhcpRange');
crudRoutes('dns-records', dnsRecords, 'network.dnsRecord');
crudRoutes('vpn-clients', vpnClients, 'network.vpnClient');

export default router;
