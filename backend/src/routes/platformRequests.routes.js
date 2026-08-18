import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';

// Platform Requests (ÉTAPE 17 IDP) : demandes d'un développeur à
// l'organisation, tranchées explicitement par un owner/admin — jamais
// exécutées automatiquement (voir migration 0017). Portée organisation,
// comme teams/policies/environment_blueprints.
const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

const KINDS = ['access', 'resource_increase', 'create_production_env', 'other'];

async function requireOrgMember(req, res, orgId) {
  const role = await orgStore.getOrgRole(orgId, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) {
    res.status(404).json({ ok: false, error: 'Organisation introuvable' });
    return null;
  }
  return role;
}

// Vue "mes demandes" (n'importe quel utilisateur, tous organismes confondus) :
// distincte de la vue org (ci-dessous, réservée owner/admin) — même
// séparation que jobs.routes.js entre "mes jobs" et la vue transverse admin.
router.get('/mine', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await orgStore.listPlatformRequestsForUser(req.user.id) });
}));

router.get('/', asyncHandler(async (req, res) => {
  const { orgId, status } = req.query;
  if (!orgId) return res.status(400).json({ ok: false, error: 'orgId requis' });
  const role = await requireOrgMember(req, res, orgId);
  if (role === null && !isPlatformAdmin(req.user)) return;
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  res.json({ ok: true, items: await orgStore.listPlatformRequestsForOrg(orgId, { status }) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { orgId, projectId, kind, title, description } = req.body || {};
  if (!orgId || !kind || !title) return res.status(400).json({ ok: false, error: 'orgId, kind et title requis' });
  if (!KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type de demande invalide' });
  const role = await requireOrgMember(req, res, orgId);
  if (role === null && !isPlatformAdmin(req.user)) return;
  const request = await orgStore.createPlatformRequest({ orgId, projectId, requestedBy: req.user.id, kind, title, description });
  logAudit(req, 'platform_request.create', { requestId: request.id, orgId, kind, title });
  res.status(201).json({ ok: true, request });
}));

// Annulation : réservée à l'auteur de la demande (pas de rôle particulier
// requis — c'est SA demande) tant qu'elle est encore 'pending'.
router.post('/:id/cancel', asyncHandler(async (req, res) => {
  const existing = await orgStore.getPlatformRequest(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Demande introuvable' });
  if (existing.requested_by !== req.user.id && !isPlatformAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: "Réservé à l'auteur de la demande" });
  }
  if (existing.status !== 'pending') return res.status(409).json({ ok: false, error: 'Seule une demande en attente peut être annulée' });
  const request = await orgStore.reviewPlatformRequest(req.params.id, { status: 'cancelled', reviewedBy: req.user.id });
  logAudit(req, 'platform_request.cancel', { requestId: request.id });
  res.json({ ok: true, request });
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const existing = await orgStore.getPlatformRequest(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Demande introuvable' });
  const role = await requireOrgMember(req, res, existing.org_id);
  if (role === null && !isPlatformAdmin(req.user)) return;
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  if (existing.status !== 'pending') return res.status(409).json({ ok: false, error: 'Seule une demande en attente peut être tranchée' });
  const request = await orgStore.reviewPlatformRequest(req.params.id, { status: 'approved', reviewedBy: req.user.id, reviewNote: req.body?.note });
  logAudit(req, 'platform_request.approve', { requestId: request.id });
  res.json({ ok: true, request });
}));

router.post('/:id/reject', asyncHandler(async (req, res) => {
  const existing = await orgStore.getPlatformRequest(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Demande introuvable' });
  const role = await requireOrgMember(req, res, existing.org_id);
  if (role === null && !isPlatformAdmin(req.user)) return;
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  if (existing.status !== 'pending') return res.status(409).json({ ok: false, error: 'Seule une demande en attente peut être tranchée' });
  const request = await orgStore.reviewPlatformRequest(req.params.id, { status: 'rejected', reviewedBy: req.user.id, reviewNote: req.body?.note });
  logAudit(req, 'platform_request.reject', { requestId: request.id });
  res.json({ ok: true, request });
}));

export default router;
