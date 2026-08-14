import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import * as orgStore from '../store/orgStore.js';
import { logAudit } from '../services/auditService.js';

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

router.post('/', asyncHandler(async (req, res) => {
  const { name, slug } = req.body || {};
  if (!name || !slug) return res.status(400).json({ ok: false, error: 'Nom et identifiant requis' });
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ ok: false, error: "Identifiant invalide (lettres minuscules, chiffres, tirets)" });
  const org = await orgStore.createOrganization({ name, slug, ownerUserId: req.user.id });
  logAudit(req, 'organization.create', { orgId: org.id, name });
  res.status(201).json({ ok: true, organization: org });
}));

router.get('/:id/projects', asyncHandler(async (req, res) => {
  const role = await orgStore.getOrgRole(req.params.id, req.user.id);
  if (!role && req.user.role !== 'admin') return res.status(404).json({ ok: false, error: 'Organisation introuvable' });
  const items = await orgStore.listProjectsForUser(req.user.id);
  res.json({ ok: true, items: items.filter((p) => p.org_id === req.params.id) });
}));

export default router;
