import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';

// Environment Blueprints (ÉTAPE 10 IDP) : profils de ressources réutilisables
// à l'échelle d'une organisation — voir db/migrations/0014_environment_blueprints.sql.
// Même portée de permission que teams.routes.js : lecture ouverte à tout
// membre de l'organisation, écriture réservée owner/admin.
const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

const KINDS = ['development', 'preview', 'staging', 'production', 'custom'];

function slugify(name) {
  return name.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'blueprint';
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
  res.json({ ok: true, items: await orgStore.listEnvironmentBlueprintsForOrg(orgId) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { orgId, name, kind, namespacePattern, replicas, cpu, memory, storageGb, ingressDomain, ttlMinutes, monitoringEnabled } = req.body || {};
  if (!orgId || !name) return res.status(400).json({ ok: false, error: 'orgId et name requis' });
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type invalide' });
  const role = await requireOrgMember(req, res, orgId);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  const blueprint = await orgStore.createEnvironmentBlueprint({
    orgId, name, slug: slugify(name), kind, namespacePattern, replicas, cpu, memory, storageGb, ingressDomain, ttlMinutes, monitoringEnabled
  });
  logAudit(req, 'environment_blueprint.create', { blueprintId: blueprint.id, orgId, name });
  res.status(201).json({ ok: true, blueprint });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const existing = await orgStore.getEnvironmentBlueprint(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Blueprint introuvable' });
  const role = await requireOrgMember(req, res, existing.org_id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  const { name, kind, namespacePattern, replicas, cpu, memory, storageGb, ingressDomain, ttlMinutes, monitoringEnabled } = req.body || {};
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ ok: false, error: 'Type invalide' });
  const blueprint = await orgStore.updateEnvironmentBlueprint(req.params.id, {
    name, kind, namespacePattern, replicas, cpu, memory, storageGb, ingressDomain, ttlMinutes, monitoringEnabled
  });
  logAudit(req, 'environment_blueprint.update', { blueprintId: blueprint.id, name: blueprint.name });
  res.json({ ok: true, blueprint });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await orgStore.getEnvironmentBlueprint(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Blueprint introuvable' });
  const role = await requireOrgMember(req, res, existing.org_id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  await orgStore.deleteEnvironmentBlueprint(req.params.id);
  logAudit(req, 'environment_blueprint.delete', { blueprintId: req.params.id, name: existing.name });
  res.json({ ok: true });
}));

export default router;
