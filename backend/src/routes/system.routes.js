import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getVersion, checkForUpdates } from '../services/updateService.js';
import { getStartupStatus } from '../services/startupStatusService.js';
import { integrations } from '../services/integrationRegistry.js';
import { listBackups } from '../services/backupService.js';
import { listRecentJobs } from '../services/jobService.js';
import { listGlobal as listIncidents } from '../store/incidentStore.js';
import { pool } from '../db/pool.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/version', (req, res) => {
  res.json({ ok: true, version: getVersion() });
});

router.get('/updates/check', asyncHandler(async (req, res) => {
  const targetBranch = typeof req.query.targetBranch === 'string' ? req.query.targetBranch.trim().slice(0, 200) : undefined;
  res.json({ ok: true, ...checkForUpdates(targetBranch || undefined) });
}));

// Instantané honnête du démarrage du process (migrations, admin bootstrap,
// planificateurs) — pas l'écran de bootstrap complet (voir Lot D9), juste de
// quoi vérifier que le démarrage s'est bien déroulé sans dépouiller les logs
// serveur.
router.get('/status/startup', (req, res) => {
  res.json({ ok: true, startup: getStartupStatus() });
});

// Vue destinée à un responsable système : agrège en un seul appel ce qui
// mérite son attention immédiate — intégrations en erreur, incidents
// ouverts (gravité haute/critique en premier), jobs en échec récents,
// dernière sauvegarde. N'invente jamais une catégorie vide : incidents et
// jobs restent [] tant que Postgres n'est pas configuré (cohérent avec le
// reste de la plateforme — voir routes/projects.routes.js), plutôt que de
// prétendre "tout va bien" faute de donnée.
router.get('/overview', asyncHandler(async (req, res) => {
  const integrationEntries = await Promise.all(Object.entries(integrations).map(async ([key, def]) => {
    try {
      const status = await def.service.getStatus();
      return { key, label: def.label, domain: def.domain, ...status };
    } catch (err) {
      return { key, label: def.label, domain: def.domain, configured: true, ok: false, message: err.message };
    }
  }));
  const integrationsInError = integrationEntries.filter((e) => e.configured && !e.ok);

  const backups = listBackups();
  const lastBackup = backups[0] || null;
  const lastBackupAgeHours = lastBackup ? (Date.now() - new Date(lastBackup.createdAt).getTime()) / 3_600_000 : null;

  const [openIncidents, criticalIncidents, failedJobs, runningJobs] = pool
    ? await Promise.all([
        listIncidents({ status: 'open', limit: 20 }),
        listIncidents({ severity: 'critical', limit: 10 }),
        listRecentJobs({ status: 'failed', limit: 10 }),
        listRecentJobs({ status: 'running', limit: 20 })
      ])
    : [[], [], [], []];

  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    integrationsInError,
    incidents: { open: openIncidents, critical: criticalIncidents },
    jobs: { recentFailures: failedJobs, running: runningJobs },
    backups: { last: lastBackup, lastAgeHours: lastBackupAgeHours, stale: lastBackupAgeHours !== null && lastBackupAgeHours > 48 },
    relationalCoreConfigured: Boolean(pool)
  });
}));

export default router;
