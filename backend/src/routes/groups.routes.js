import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { listGroups, createGroup, updateGroup, deleteGroup, PERMISSION_DOMAINS, PERMISSION_LEVELS } from '../store/groupsStore.js';
import { logAudit } from '../services/auditService.js';

// Gestion des groupes et de la matrice de permissions : réservée aux
// administrateurs, comme la gestion des utilisateurs.
const router = Router();
// Gérer la matrice de permissions elle-même = élévation de privilège
// potentielle : exige le niveau max sur 'users', pas juste 'write'.
router.use(requireAuth, requirePermission('users', 'admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, items: listGroups(), domains: PERMISSION_DOMAINS, levels: PERMISSION_LEVELS });
});

router.post('/', asyncHandler(async (req, res) => {
  const group = createGroup(req.body || {});
  logAudit(req, 'group.create', { groupId: group.id, name: group.name });
  res.status(201).json({ ok: true, group });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const updated = updateGroup(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false, error: 'Groupe introuvable' });
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
