import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getJob, listRecentJobs } from '../services/jobService.js';

// Suivi des jobs sans portée projet (ex. scan réseau — voir
// routes/security.routes.js). Les jobs rattachés à un projet se consultent
// via GET /projects/:id/jobs/:jobId (routes/projects.routes.js), qui
// applique en plus le rôle projet ; ici, un job sans project_id n'est
// visible que par son auteur ou un administrateur — jamais par un tiers qui
// devinerait l'id.
const router = Router();
router.use(requireAuth);

// Vue globale tous projets confondus (jobs en cours, échoués récemment...) :
// réservée aux administrateurs, cohérent avec le reste de la supervision
// transverse de la plateforme (audit, hôtes, sauvegardes...).
router.get('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const status = ['pending', 'running', 'succeeded', 'failed'].includes(req.query.status) ? req.query.status : undefined;
  res.json({ ok: true, items: await listRecentJobs({ status }) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'Job introuvable' });
  if (job.project_id) return res.status(404).json({ ok: false, error: 'Job introuvable' }); // passe par /projects/:id/jobs/:jobId
  if (job.created_by !== req.user.id && req.user.role !== 'admin') {
    return res.status(404).json({ ok: false, error: 'Job introuvable' });
  }
  res.json({ ok: true, job });
}));

export default router;
