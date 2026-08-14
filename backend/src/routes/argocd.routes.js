import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import * as argocd from '../services/integrations/argocdService.js';

const router = Router();
router.use(requireAuth);

router.get('/status', asyncHandler(async (req, res) => res.json({ ok: true, status: await argocd.getStatus() })));
router.get('/applications', asyncHandler(async (req, res) => res.json({ ok: true, items: await argocd.listApplications() })));
router.get('/applications/:name', asyncHandler(async (req, res) => res.json({ ok: true, application: await argocd.getApplication(req.params.name) })));
// La synchronisation ne vit plus ici : elle dupliquait, sans aucune
// vérification de portée ni de rôle, POST /projects/:id/deployments/:linkId/sync
// (routes/projects.routes.js — scopé au projet, avec protection production).
// N'était plus appelée par le frontend.

export default router;
