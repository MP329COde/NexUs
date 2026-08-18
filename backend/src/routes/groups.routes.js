import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { listGroups, getGroup, createGroup, updateGroup, deleteGroup, permissionsForUser, PERMISSION_DOMAINS, PERMISSION_LEVELS } from '../store/groupsStore.js';
import { logAudit } from '../services/auditService.js';

// Gestion des groupes et de la matrice de permissions : réservée aux
// administrateurs, comme la gestion des utilisateurs.
const router = Router();
// Gérer la matrice de permissions elle-même = élévation de privilège
// potentielle : exige le niveau max sur 'users', pas juste 'write'.
router.use(requireAuth, requirePermission('users', 'admin'));

const LEVEL_RANK = { none: 0, read: 1, write: 2, admin: 3 };

// users:admin (via un groupe, pas forcément le rôle plateforme 'admin')
// suffit pour créer/modifier n'importe quel groupe — sans ce garde-fou, un
// tel utilisateur pourrait s'ajouter comme membre d'un groupe et s'y
// attribuer n'importe quel niveau sur n'importe quel domaine (vault, users,
// kubernetes...), s'auto-élevant bien au-delà de ce que son rôle réel
// autorise. Un admin plateforme (role === 'admin') n'est pas concerné : le
// bypass de requirePermission le laisse déjà tout faire.
function assertNoSelfEscalation(req, { permissions, memberIds, existingGroup }) {
  if (req.user.role === 'admin') return;
  const willBeMember = memberIds !== undefined
    ? Array.isArray(memberIds) && memberIds.includes(req.user.id)
    : Boolean(existingGroup?.memberIds?.includes(req.user.id));
  if (!willBeMember) return;
  const ceiling = permissionsForUser(req.user.id);
  const resultingPermissions = { ...(existingGroup?.permissions || {}), ...(permissions || {}) };
  for (const domain of PERMISSION_DOMAINS) {
    const level = resultingPermissions[domain] || 'none';
    if (LEVEL_RANK[level] > LEVEL_RANK[ceiling[domain] || 'none']) {
      throw Object.assign(
        new Error(`Vous ne pouvez pas vous accorder vous-même un niveau supérieur au vôtre sur "${domain}" via ce groupe`),
        { status: 403 }
      );
    }
  }
}

router.get('/', (req, res) => {
  res.json({ ok: true, items: listGroups(), domains: PERMISSION_DOMAINS, levels: PERMISSION_LEVELS });
});

router.post('/', asyncHandler(async (req, res) => {
  assertNoSelfEscalation(req, { permissions: req.body?.permissions, memberIds: req.body?.memberIds, existingGroup: null });
  const group = createGroup(req.body || {});
  logAudit(req, 'group.create', { groupId: group.id, name: group.name });
  res.status(201).json({ ok: true, group });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const existingGroup = getGroup(req.params.id);
  if (!existingGroup) return res.status(404).json({ ok: false, error: 'Groupe introuvable' });
  assertNoSelfEscalation(req, { permissions: req.body?.permissions, memberIds: req.body?.memberIds, existingGroup });
  const updated = updateGroup(req.params.id, req.body || {});
  logAudit(req, 'group.update', { groupId: updated.id, name: updated.name });
  res.json({ ok: true, group: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const removed = deleteGroup(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Groupe introuvable' });
  logAudit(req, 'group.delete', { groupId: req.params.id });
  res.json({ ok: true });
}));

export default router;
