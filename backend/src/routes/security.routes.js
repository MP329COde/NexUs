import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listBannedIps, banIp, unbanIp, normalizeIp } from '../store/banlistStore.js';
import { listScans, getLastScan, runScan } from '../services/networkScanService.js';
import { getRecentTraffic, getSuspiciousIps } from '../services/trafficMonitorService.js';
import { getFirewallSettings, setAutoBlockEnabled } from '../store/firewallStore.js';
import { logAudit } from '../services/auditService.js';
import * as jobService from '../services/jobService.js';
import { pool } from '../db/pool.js';
import { listCertificates } from '../services/integrations/certManagerService.js';
import { getAgentSummary } from '../services/integrations/wazuhService.js';
import { listGlobal as listIncidents } from '../store/incidentStore.js';

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

// Un scan nmap peut prendre jusqu'à 2 minutes (voir networkScanService.js,
// timeout 120s, et le rate-limiter dédié dans index.js) : ne bloque plus la
// requête HTTP dessus quand le socle relationnel est disponible (jobs
// persistés, voir services/jobService.js) — le job est global (pas rattaché
// à un projet), suivi via GET /api/jobs/:jobId. Repli sur l'ancien
// comportement synchrone si Postgres n'est pas configuré.
router.post('/scans', asyncHandler(async (req, res) => {
  const { target } = req.body || {};
  if (!target) return res.status(400).json({ ok: false, error: 'Cible requise (IP ou CIDR)' });

  if (pool) {
    // Idempotence sur la cible : un double-clic (ou un retry réseau côté
    // navigateur) sur le même scan en cours renvoie le job déjà actif au
    // lieu de lancer un second nmap concurrent sur la même plage.
    const job = await jobService.enqueue(
      { type: 'security.scan', projectId: null, userId: req.user.id, payload: { target }, idempotencyKey: `security.scan:${target}` },
      async () => {
        const scan = await runScan(target);
        logAudit(req, 'security.scan.run', { target, hostCount: scan.hostCount });
        return scan;
      }
    );
    return res.status(202).json({ ok: true, job });
  }

  const scan = await runScan(target);
  logAudit(req, 'security.scan.run', { target, hostCount: scan.hostCount });
  res.status(201).json({ ok: true, scan });
}));

// Relance d'un scan en échec : nouveau job avec la même cible, jamais une
// mutation du job d'origine (conserve l'historique). idempotencyKey dérivée
// du job d'origine : plusieurs clics rapides sur "Relancer" ne créent
// jamais deux relances concurrentes du même scan.
router.post('/scans/:jobId/retry', asyncHandler(async (req, res) => {
  if (!pool) return res.status(503).json({ ok: false, error: "DATABASE_URL n'est pas configuré" });
  const original = await jobService.getJob(req.params.jobId);
  if (!original || original.type !== 'security.scan') return res.status(404).json({ ok: false, error: 'Scan introuvable' });
  if (original.status !== 'failed') return res.status(409).json({ ok: false, error: 'Seul un scan en échec peut être relancé' });
  const { target } = original.payload;
  const job = await jobService.enqueue(
    { type: 'security.scan', projectId: null, userId: req.user.id, payload: { target }, idempotencyKey: `security.scan.retry:${original.id}`, retryOf: original.id },
    async () => {
      const scan = await runScan(target);
      logAudit(req, 'security.scan.run', { target, hostCount: scan.hostCount, retryOf: original.id });
      return scan;
    }
  );
  res.status(202).json({ ok: true, job });
}));

// Tableau de sécurité global : agrège ce qui est réellement disponible
// aujourd'hui — certificats cert-manager proches de l'expiration (30 jours),
// incidents ouverts groupés par gravité (tous projets confondus), agents
// Wazuh déconnectés, dernier scan réseau. Chaque source est interrogée
// indépendamment (Promise.allSettled) : l'échec d'une intégration
// n'empêche jamais d'afficher les autres. Une section reste vide/absente
// plutôt que d'inventer une donnée quand l'intégration correspondante n'est
// pas configurée.
router.get('/overview', asyncHandler(async (req, res) => {
  const [certsResult, wazuhResult] = await Promise.allSettled([
    listCertificates(),
    getAgentSummary()
  ]);

  let expiringCertificates = [];
  if (certsResult.status === 'fulfilled') {
    const in30Days = Date.now() + 30 * 24 * 3600_000;
    expiringCertificates = certsResult.value
      .filter((c) => c.notAfter && new Date(c.notAfter).getTime() < in30Days)
      .map((c) => ({ ...c, expiresInDays: Math.round((new Date(c.notAfter).getTime() - Date.now()) / 86_400_000) }))
      .sort((a, b) => a.expiresInDays - b.expiresInDays);
  }

  const wazuhDisconnected = wazuhResult.status === 'fulfilled' ? (wazuhResult.value.summary?.disconnected || 0) : 0;

  const incidentsBySeverity = pool
    ? await (async () => {
        const [critical, high, medium, low] = await Promise.all([
          listIncidents({ severity: 'critical', status: 'open', limit: 50 }),
          listIncidents({ severity: 'high', status: 'open', limit: 50 }),
          listIncidents({ severity: 'medium', status: 'open', limit: 50 }),
          listIncidents({ severity: 'low', status: 'open', limit: 50 })
        ]);
        return { critical, high, medium, low };
      })()
    : { critical: [], high: [], medium: [], low: [] };

  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    expiringCertificates,
    wazuhDisconnected,
    incidentsBySeverity,
    lastScan: getLastScan(),
    relationalCoreConfigured: Boolean(pool)
  });
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
