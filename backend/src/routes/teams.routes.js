import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';
import { logActivity, listActivity } from '../services/projectActivityService.js';

// Équipes : regroupement d'utilisateurs à l'échelle d'une organisation,
// distinct des projets (voir store/orgStore.js). Accès en lecture réservé
// aux membres de l'organisation ; création/gestion réservée aux
// owner/admin de l'organisation ou au lead de l'équipe concernée.
const router = Router();
router.use(requireAuth);

router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

async function requireOrgMembership(req, res, orgId) {
  if (isPlatformAdmin(req.user)) return 'owner';
  const role = await orgStore.getOrgRole(orgId, req.user.id);
  if (!role) {
    res.status(404).json({ ok: false, error: 'Organisation introuvable' });
    return null;
  }
  return role;
}

router.get('/org/:orgId', asyncHandler(async (req, res) => {
  const orgRole = await requireOrgMembership(req, res, req.params.orgId);
  if (!orgRole) return;
  res.json({ ok: true, items: await orgStore.listTeamsForOrg(req.params.orgId, req.user.id) });
}));

router.get('/mine', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await orgStore.listTeamsForUser(req.user.id) });
}));

router.post('/org/:orgId', asyncHandler(async (req, res) => {
  const orgRole = await requireOrgMembership(req, res, req.params.orgId);
  if (!orgRole) return;
  if (!['owner', 'admin'].includes(orgRole)) {
    return res.status(403).json({ ok: false, error: "Seul un owner/admin de l'organisation peut créer une équipe" });
  }
  const { name, slug } = req.body || {};
  if (!name || !slug) return res.status(400).json({ ok: false, error: 'Nom et identifiant requis' });
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ ok: false, error: "Identifiant invalide (lettres minuscules, chiffres, tirets)" });
  const team = await orgStore.createTeam({ orgId: req.params.orgId, name, slug, ownerUserId: req.user.id });
  logAudit(req, 'team.create', { orgId: req.params.orgId, teamId: team.id, name });
  await logActivity('organization', req.params.orgId, req.user.id, 'team.create', { teamId: team.id, name }).catch(() => {});
  res.status(201).json({ ok: true, team });
}));

async function loadTeamWithRole(req, res) {
  const team = await orgStore.getTeam(req.params.id);
  if (!team) { res.status(404).json({ ok: false, error: 'Équipe introuvable' }); return null; }
  const orgRole = await requireOrgMembership(req, res, team.org_id);
  if (!orgRole) return null;
  const teamRole = isPlatformAdmin(req.user) ? 'lead' : (await orgStore.getTeamRole(team.id, req.user.id) || (['owner', 'admin'].includes(orgRole) ? 'lead' : null));
  return { team, orgRole, teamRole };
}

router.get('/:id', asyncHandler(async (req, res) => {
  const ctx = await loadTeamWithRole(req, res);
  if (!ctx) return;
  res.json({ ok: true, team: ctx.team, role: ctx.teamRole, members: await orgStore.listTeamMembers(ctx.team.id) });
}));

router.put('/:id/members/:userId', asyncHandler(async (req, res) => {
  const ctx = await loadTeamWithRole(req, res);
  if (!ctx) return;
  if (ctx.teamRole !== 'lead') return res.status(403).json({ ok: false, error: "Réservé au lead de l'équipe (ou owner/admin de l'organisation)" });
  const { role } = req.body || {};
  if (!['lead', 'member'].includes(role)) return res.status(400).json({ ok: false, error: 'Rôle invalide' });
  const wasMember = Boolean(await orgStore.getTeamRole(ctx.team.id, req.params.userId));
  const member = await orgStore.addTeamMember(ctx.team.id, req.params.userId, role);
  const action = wasMember ? 'team.member.role' : 'team.member.add';
  logAudit(req, action, { teamId: ctx.team.id, userId: req.params.userId, role });
  await logActivity('team', ctx.team.id, req.user.id, action, { userId: req.params.userId, role }).catch(() => {});
  res.json({ ok: true, member });
}));

router.delete('/:id/members/:userId', asyncHandler(async (req, res) => {
  const ctx = await loadTeamWithRole(req, res);
  if (!ctx) return;
  if (ctx.teamRole !== 'lead') return res.status(403).json({ ok: false, error: "Réservé au lead de l'équipe (ou owner/admin de l'organisation)" });
  await orgStore.removeTeamMember(ctx.team.id, req.params.userId);
  logAudit(req, 'team.member.remove', { teamId: ctx.team.id, userId: req.params.userId });
  await logActivity('team', ctx.team.id, req.user.id, 'team.member.remove', { userId: req.params.userId }).catch(() => {});
  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const ctx = await loadTeamWithRole(req, res);
  if (!ctx) return;
  if (!['owner', 'admin'].includes(ctx.orgRole)) {
    return res.status(403).json({ ok: false, error: "Seul un owner/admin de l'organisation peut supprimer une équipe" });
  }
  await orgStore.deleteTeam(ctx.team.id);
  logAudit(req, 'team.delete', { teamId: ctx.team.id });
  res.json({ ok: true });
}));

// Activité d'équipe (généralisation todo.md #31/#32, Lot 42) — même pattern
// que /projects/:id/activity et /organizations/:id/activity.
router.get('/:id/activity', asyncHandler(async (req, res) => {
  const ctx = await loadTeamWithRole(req, res);
  if (!ctx) return;
  res.json({ ok: true, items: await listActivity('team', ctx.team.id, Number(req.query.limit) || 50) });
}));

export default router;
