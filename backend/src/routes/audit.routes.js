import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listAuditEntries } from '../services/auditService.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

function parseFilters(req) {
  return {
    limit: Number(req.query.limit) || 200,
    integrationKey: req.query.integrationKey || null,
    action: req.query.action || null,
    q: req.query.q || null,
    since: req.query.since || null,
    until: req.query.until || null
  };
}

router.get('/', (req, res) => {
  res.json({ ok: true, items: listAuditEntries(parseFilters(req)) });
});

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Export limité aux 1000 dernières entrées (MAX_ENTRIES côté auditService —
// le journal ne conserve rien au-delà, l'export ne peut donc pas promettre
// davantage) mais respecte les mêmes filtres que la vue à l'écran : exporter
// "juste ce qui est affiché" plutôt qu'un dump complet non filtré.
router.get('/export.csv', (req, res) => {
  const items = listAuditEntries({ ...parseFilters(req), limit: req.query.limit ? Number(req.query.limit) : 1000 });
  const header = ['date', 'action', 'auteur', 'ip', 'metadonnees'];
  const rows = items.map((e) => [e.at, e.action, e.actorEmail || '', e.ip || '', JSON.stringify(e.meta || {})]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

export default router;
