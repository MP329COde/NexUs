import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';

const ICON_PATTERN = /^\p{Extended_Pictographic}(‍\p{Extended_Pictographic})*$|^$/u;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

const router = Router();
router.use(requireAuth);

// Le socle organisations n'existe que si Postgres est configuré (voir
// db/pool.js) : réponse explicite plutôt qu'une 500 opaque quand ce n'est pas
// le cas, cohérent avec la consigne "ne jamais laisser croire qu'une
// fonctionnalité est prête si ses vérifications échouent".
router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

router.get('/', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await orgStore.listOrganizationsForUser(req.user.id) });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Organisation introuvable' });
  const org = await orgStore.getOrganization(req.params.id);
  if (!org) return res.status(404).json({ ok: false, error: 'Organisation introuvable' });
  res.json({ ok: true, organization: { ...org, my_role: role } });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, slug, icon, color } = req.body || {};
  if (!name || !slug) return res.status(400).json({ ok: false, error: 'Nom et identifiant requis' });
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ ok: false, error: "Identifiant invalide (lettres minuscules, chiffres, tirets)" });
  if (icon && !ICON_PATTERN.test(icon)) return res.status(400).json({ ok: false, error: 'Icône invalide (un seul emoji attendu)' });
  if (color && !COLOR_PATTERN.test(color)) return res.status(400).json({ ok: false, error: 'Couleur invalide (format #RRGGBB attendu)' });
  const org = await orgStore.createOrganization({ name, slug, ownerUserId: req.user.id, icon, color });
  logAudit(req, 'organization.create', { orgId: org.id, name });
  res.status(201).json({ ok: true, organization: org });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant pour modifier cette organisation' });
  }
  const { name, icon, color } = req.body || {};
  if (icon && !ICON_PATTERN.test(icon)) return res.status(400).json({ ok: false, error: 'Icône invalide (un seul emoji attendu)' });
  if (color && !COLOR_PATTERN.test(color)) return res.status(400).json({ ok: false, error: 'Couleur invalide (format #RRGGBB attendu)' });
  const org = await orgStore.updateOrganization(req.params.id, { name, icon, color });
  if (!org) return res.status(404).json({ ok: false, error: 'Organisation introuvable' });
  logAudit(req, 'organization.update', { orgId: org.id, name });
  res.json({ ok: true, organization: org });
}));

// Irréversible (cascade réelle sur teams/projects/wiki, voir orgStore.js) :
// réservée à l'owner de l'organisation ou à un admin plateforme, et exige
// ?force=true si l'organisation contient encore des projets, plutôt que de
// les supprimer silencieusement — même politique que POST /backups/:file/restore
// (confirmation explicite avant une action destructrice de grande ampleur).
router.delete('/:id', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'owner')) {
    return res.status(403).json({ ok: false, error: 'Seul le propriétaire de cette organisation (ou un administrateur) peut la supprimer' });
  }
  const projectCount = await orgStore.countOrgProjects(req.params.id);
  if (projectCount > 0 && req.query.force !== 'true') {
    return res.status(409).json({ ok: false, error: `Cette organisation contient ${projectCount} projet(s) — ajoutez ?force=true pour confirmer leur suppression définitive`, projectCount });
  }
  const deleted = await orgStore.deleteOrganization(req.params.id);
  if (!deleted) return res.status(404).json({ ok: false, error: 'Organisation introuvable' });
  logAudit(req, 'organization.delete', { orgId: req.params.id, projectCount });
  res.json({ ok: true });
}));

// Gestion des membres de l'organisation elle-même — jusqu'ici absente :
// seul le créateur (owner) pouvait exister sur une organisation, aucun
// moyen d'y ajouter un collègue. Lecture réservée aux membres ; ajout/retrait
// réservés owner/admin de l'organisation (ou admin plateforme).
router.get('/:id/members', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Organisation introuvable' });
  res.json({ ok: true, items: await orgStore.listOrgMembers(req.params.id) });
}));

router.post('/:id/members', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  const { userId, role: newRole = 'member' } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId requis' });
  if (!['owner', 'admin', 'member'].includes(newRole)) return res.status(400).json({ ok: false, error: 'Rôle invalide' });
  const member = await orgStore.addOrgMember(req.params.id, userId, newRole);
  logAudit(req, 'organization.member.add', { orgId: req.params.id, userId, role: newRole });
  res.status(201).json({ ok: true, member });
}));

router.put('/:id/members/:userId', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  const { role: newRole } = req.body || {};
  if (!['owner', 'admin', 'member'].includes(newRole)) return res.status(400).json({ ok: false, error: 'Rôle invalide' });
  if (newRole !== 'owner' && (await orgStore.getOrgRole(req.params.id, req.params.userId)) === 'owner' && (await orgStore.countOrgOwners(req.params.id)) <= 1) {
    return res.status(409).json({ ok: false, error: "Impossible de retirer le dernier propriétaire de l'organisation" });
  }
  const member = await orgStore.addOrgMember(req.params.id, req.params.userId, newRole);
  logAudit(req, 'organization.member.role', { orgId: req.params.id, userId: req.params.userId, role: newRole });
  res.json({ ok: true, member });
}));

router.delete('/:id/members/:userId', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: "Réservé owner/admin de l'organisation" });
  }
  if ((await orgStore.getOrgRole(req.params.id, req.params.userId)) === 'owner' && (await orgStore.countOrgOwners(req.params.id)) <= 1) {
    return res.status(409).json({ ok: false, error: "Impossible de retirer le dernier propriétaire de l'organisation" });
  }
  const removed = await orgStore.removeOrgMember(req.params.id, req.params.userId);
  if (!removed) return res.status(404).json({ ok: false, error: 'Membre introuvable' });
  logAudit(req, 'organization.member.remove', { orgId: req.params.id, userId: req.params.userId });
  res.json({ ok: true });
}));

router.get('/:id/projects', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) return res.status(404).json({ ok: false, error: 'Organisation introuvable' });
  const items = await orgStore.listProjectsForUser(req.user.id);
  res.json({ ok: true, items: items.filter((p) => p.org_id === req.params.id) });
}));

export default router;
