import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';

// Policy Engine (ÉTAPE 16 IDP) : CRUD des règles à l'échelle d'une
// organisation — même portée de permission que teams.routes.js et
// environmentBlueprints.routes.js (lecture ouverte aux membres, écriture
// réservée owner/admin). L'évaluation elle-même (POST
// /catalog/components/:id/policy-check) vit dans catalog.routes.js, à côté
// des autres actions sur un composant.
const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

const KINDS = ['require_owner_team', 'require_production_lifecycle', 'require_description', 'require_repository', 'require_linked_environment', 'block_critical_code_scan', 'block_high_dast_scan'];

function slugify(name) {
  return name.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'policy';
}

async function requireOrgMember(req, res, orgId) {
  const role = await orgStore.getOrgRole(orgId, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) {
    res.status(404).json({ ok: false, error: 'Organisation introuvable' });
    return null;
  }
  return role;
}

router.get('/', asyncHandler(async (req, res) => {
  const { orgId } = req.query;
  if (!orgId) return res.status(400).json({ ok: false, error: 'orgId requis' });
  const role = await requireOrgMember(req, res, orgId);
  if (role === null && !isPlatformAdmin(req.user)) return;
  res.json({ ok: true, items: await orgStore.listPoliciesForOrg(orgId) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { orgId, name, kind, enabled, threshold } = req.body || {};
  if (!orgId || !name || !kind) return res.status(400).json({ ok: false, error: 'orgId, name et kind requis' });
  if (!KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type de policy invalide' });
  const role = await requireOrgMember(req, res, orgId);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  const policy = await orgStore.createPolicy({ orgId, name, slug: slugify(name), kind, enabled, threshold });
  logAudit(req, 'policy.create', { policyId: policy.id, orgId, name, kind });
  res.status(201).json({ ok: true, policy });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const existing = await orgStore.getPolicy(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Policy introuvable' });
  const role = await requireOrgMember(req, res, existing.org_id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  const { name, enabled, threshold } = req.body || {};
  const policy = await orgStore.updatePolicy(req.params.id, { name, enabled, threshold });
  logAudit(req, 'policy.update', { policyId: policy.id, name: policy.name, enabled: policy.enabled });
  res.json({ ok: true, policy });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await orgStore.getPolicy(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Policy introuvable' });
  const role = await requireOrgMember(req, res, existing.org_id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  await orgStore.deletePolicy(req.params.id);
  logAudit(req, 'policy.delete', { policyId: req.params.id, name: existing.name });
  res.json({ ok: true });
}));

export default router;
