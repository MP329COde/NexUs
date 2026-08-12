import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listBannedIps, banIp, unbanIp, normalizeIp } from '../store/banlistStore.js';
import { listScans, getLastScan, runScan } from '../services/networkScanService.js';
import { getRecentTraffic, getSuspiciousIps } from '../services/trafficMonitorService.js';
import { getFirewallSettings, setAutoBlockEnabled } from '../store/firewallStore.js';
import { logAudit } from '../services/auditService.js';

// IPs bannies + scans réseau : réservé aux administrateurs.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/banlist', (req, res) => {
  res.json({ ok: true, items: listBannedIps() });
});

router.post('/banlist', asyncHandler(async (req, res) => {
  const { ip, reason } = req.body || {};
  if (ip === normalizeIp(req.ip)) {
    return res.status(400).json({ ok: false, error: 'Impossible de bannir votre propre adresse — vous perdriez immédiatement l\'accès.' });
  }
  const entry = banIp(ip, reason, req.user.email);
  logAudit(req, 'security.ip.banned', { ip, reason });
  res.status(201).json({ ok: true, entry });
}));

router.delete('/banlist/:ip', asyncHandler(async (req, res) => {
  const removed = unbanIp(req.params.ip);
  if (!removed) return res.status(404).json({ ok: false, error: 'Adresse non trouvée dans la liste' });
  logAudit(req, 'security.ip.unbanned', { ip: req.params.ip });
  res.json({ ok: true });
}));

router.get('/scans', (req, res) => {
  res.json({ ok: true, items: listScans(), last: getLastScan() });
});

router.post('/scans', asyncHandler(async (req, res) => {
  const { target } = req.body || {};
  if (!target) return res.status(400).json({ ok: false, error: 'Cible requise (IP ou CIDR)' });
  const scan = await runScan(target);
  logAudit(req, 'security.scan.run', { target, hostCount: scan.hostCount });
  res.status(201).json({ ok: true, scan });
}));

router.get('/traffic', (req, res) => {
  res.json({ ok: true, items: getRecentTraffic(150), suspicious: getSuspiciousIps(), settings: getFirewallSettings() });
});

router.put('/traffic/auto-block', asyncHandler(async (req, res) => {
  const settings = setAutoBlockEnabled(req.body?.enabled);
  logAudit(req, 'security.firewall.autoblock', { enabled: settings.autoBlockEnabled });
  res.json({ ok: true, settings });
}));

export default router;
