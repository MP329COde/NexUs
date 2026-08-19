import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, isPlatformAdmin } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';
import * as entityCommentsStore from '../store/entityCommentsStore.js';
import { extractMentionedUserIds } from '../services/mentionService.js';
import { notifyUser } from '../services/userNotificationService.js';

const router = Router();
router.use(requireAuth);

// Wiki d'équipe : pages Markdown éditables, rattachées à une organisation
// (et optionnellement à un projet précis), avec historique des révisions.
// N'existe que si Postgres est configuré, comme le reste du socle
// organisations/projets/équipes (voir routes/organizations.routes.js).
router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle organisations indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

async function requireOrgMember(req, res, orgId) {
  const role = await orgStore.getOrgRole(orgId, req.user.id);
  if (!role && !isPlatformAdmin(req.user)) {
    res.status(404).json({ ok: false, error: 'Organisation introuvable' });
    return null;
  }
  return role;
}

// Une page d'équipe reste lisible/éditable par toute l'organisation (même
// politique ouverte que le reste du wiki, cf. commentaire sur POST / plus
// bas) — cette vérification n'exclut donc personne, elle confirme
// seulement que teamId existe réellement dans l'organisation visée, pour ne
// jamais laisser une page pointer vers une équipe d'une autre organisation.
async function requireTeamInOrg(res, teamId, orgId) {
  const team = await orgStore.getTeam(teamId);
  if (!team || team.org_id !== orgId) {
    res.status(404).json({ ok: false, error: 'Équipe introuvable' });
    return false;
  }
  return true;
}

function slugify(title) {
  return title.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
}

router.get('/', asyncHandler(async (req, res) => {
  const { orgId, projectId, teamId, q } = req.query;
  if (!orgId) return res.status(400).json({ ok: false, error: 'orgId requis' });
  const role = await requireOrgMember(req, res, orgId);
  if (role === null && !isPlatformAdmin(req.user)) return;
  if (teamId && !(await requireTeamInOrg(res, teamId, orgId))) return;
  const items = q ? await orgStore.searchWikiPages(orgId, q) : await orgStore.listWikiPages(orgId, { projectId: projectId || null, teamId: teamId || null });
  res.json({ ok: true, items });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const page = await orgStore.getWikiPage(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page introuvable' });
  const role = await requireOrgMember(req, res, page.org_id);
  if (role === null && !isPlatformAdmin(req.user)) return;
  res.json({ ok: true, page });
}));

router.get('/:id/revisions', asyncHandler(async (req, res) => {
  const page = await orgStore.getWikiPage(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page introuvable' });
  const role = await requireOrgMember(req, res, page.org_id);
  if (role === null && !isPlatformAdmin(req.user)) return;
  res.json({ ok: true, items: await orgStore.listWikiRevisions(req.params.id) });
}));

router.get('/:id/revisions/:revisionId', asyncHandler(async (req, res) => {
  const page = await orgStore.getWikiPage(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page introuvable' });
  const role = await requireOrgMember(req, res, page.org_id);
  if (role === null && !isPlatformAdmin(req.user)) return;
  const revision = await orgStore.getWikiRevision(req.params.revisionId);
  if (!revision || revision.page_id !== page.id) return res.status(404).json({ ok: false, error: 'Révision introuvable' });
  res.json({ ok: true, revision });
}));

// Toute personne membre de l'organisation peut créer/éditer une page — un
// wiki d'équipe fonctionne collaborativement, pas sous permission fine par
// page (contrairement au coffre-fort ou aux changements contrôlés).
router.post('/', asyncHandler(async (req, res) => {
  const { orgId, projectId, teamId, title, content } = req.body || {};
  if (!orgId || !title) return res.status(400).json({ ok: false, error: 'orgId et title requis' });
  if (projectId && teamId) return res.status(400).json({ ok: false, error: "Une page ne peut être rattachée qu'à un seul palier : projet OU équipe, jamais les deux" });
  const role = await requireOrgMember(req, res, orgId);
  if (role === null && !isPlatformAdmin(req.user)) return;
  if (teamId && !(await requireTeamInOrg(res, teamId, orgId))) return;
  const page = await orgStore.createWikiPage({ orgId, projectId: projectId || null, teamId: teamId || null, slug: slugify(title), title, content, userId: req.user.id });
  logAudit(req, 'wiki.page.create', { pageId: page.id, orgId, title });
  res.status(201).json({ ok: true, page });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const existing = await orgStore.getWikiPage(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Page introuvable' });
  const role = await requireOrgMember(req, res, existing.org_id);
  if (role === null && !isPlatformAdmin(req.user)) return;
  const { title, content } = req.body || {};
  if (!title) return res.status(400).json({ ok: false, error: 'title requis' });
  const page = await orgStore.updateWikiPage(req.params.id, { title, content: content || '', userId: req.user.id });
  logAudit(req, 'wiki.page.update', { pageId: page.id, orgId: page.org_id, title });
  res.json({ ok: true, page });
}));

// Suppression réservée à l'admin/owner de l'organisation (ou admin
// plateforme), contrairement à la lecture/édition ouvertes à tout membre —
// évite qu'un membre efface accidentellement une page utilisée par toute
// l'équipe.
router.delete('/:id', asyncHandler(async (req, res) => {
  const existing = await orgStore.getWikiPage(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'Page introuvable' });
  const role = await orgStore.getOrgRole(existing.org_id, req.user.id);
  if (!isPlatformAdmin(req.user) && !orgStore.orgRoleAtLeast(role, 'admin')) {
    return res.status(403).json({ ok: false, error: 'Rôle insuffisant pour supprimer cette page' });
  }
  await orgStore.deleteWikiPage(req.params.id);
  logAudit(req, 'wiki.page.delete', { pageId: req.params.id, orgId: existing.org_id, title: existing.title });
  res.json({ ok: true });
}));

// Commentaires génériques sur une page wiki (entity_comments, migration
// 0041, todo.md ligne ~118) — mêmes mentions @utilisateur que les
// commentaires de tâche/incident, ouverts à tout membre de l'organisation
// (même politique que la lecture/édition de la page elle-même).
router.get('/:id/comments', asyncHandler(async (req, res) => {
  const page = await orgStore.getWikiPage(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page introuvable' });
  const role = await requireOrgMember(req, res, page.org_id);
  if (role === null && !isPlatformAdmin(req.user)) return;
  res.json({ ok: true, items: await entityCommentsStore.listComments('wiki_page', page.id) });
}));

router.post('/:id/comments', asyncHandler(async (req, res) => {
  const page = await orgStore.getWikiPage(req.params.id);
  if (!page) return res.status(404).json({ ok: false, error: 'Page introuvable' });
  const role = await requireOrgMember(req, res, page.org_id);
  if (role === null && !isPlatformAdmin(req.user)) return;
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ ok: false, error: 'Commentaire vide' });
  const comment = await entityCommentsStore.addComment('wiki_page', page.id, req.user.id, body.trim());
  for (const mentionedId of extractMentionedUserIds(body)) {
    if (mentionedId === req.user.id) continue;
    notifyUser(mentionedId, {
      type: 'wiki.mention', title: 'Mention dans un commentaire',
      message: `${req.user.name || req.user.email} vous a mentionné sur la page « ${page.title} »`,
      meta: { pageId: page.id, orgId: page.org_id, commentId: comment.id }
    }).catch(() => {});
  }
  res.status(201).json({ ok: true, comment });
}));

export default router;
