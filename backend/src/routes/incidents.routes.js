import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as incidentStore from '../store/incidentStore.js';

// Vue globale tous projets confondus : réservée aux administrateurs, comme
// GET /api/jobs (routes/jobs.routes.js) — un incident particulier reste
// consultable via GET /projects/:id/incidents/:incidentId avec le rôle
// projet approprié (routes/projects.routes.js), pas ici.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', asyncHandler(async (req, res) => {
  const status = ['open', 'investigating', 'resolved'].includes(req.query.status) ? req.query.status : undefined;
  const severity = ['low', 'medium', 'high', 'critical'].includes(req.query.severity) ? req.query.severity : undefined;
  res.json({ ok: true, items: await incidentStore.listGlobal({ status, severity }) });
}));

export default router;
