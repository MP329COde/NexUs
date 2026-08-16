import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, toPublicUser } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { listUsers, createUser, setUserAdminFields, setTerminalTier, deleteUser } from '../store/usersStore.js';
import { assignUserToGroups, setUserGroups, groupIdsForUser } from '../store/groupsStore.js';
import { logAudit } from '../services/auditService.js';
import { getMinPasswordLength } from '../store/identityStore.js';

// Gestion des comptes : réservée aux administrateurs. Chaque utilisateur gère
// ses propres préférences (nom, avatar, mot de passe) via /api/auth/profile.
const router = Router();
router.use(requireAuth, requirePermission('users', 'admin'));

router.get('/', (req, res) => {
  // groupIds exposé pour préremplir l'éditeur de rôles côté UsersPanel — un
  // utilisateur peut déjà avoir des rôles et il doit être possible d'en
  // ajouter/retirer sans perdre les précédents (voir PUT /:id/groups).
  const items = listUsers().map((u) => ({ ...toPublicUser(u), groupIds: groupIdsForUser(u.id) }));
  res.json({ ok: true, items });
});

router.post('/', asyncHandler(async (req, res) => {
  const { email, password, name, role, skipOnboarding, groupIds, validFrom, validUntil } = req.body || {};
  const minLength = getMinPasswordLength();
  if (!email || !password || password.length < minLength) {
    return res.status(400).json({ ok: false, error: `E-mail requis et mot de passe d'au moins ${minLength} caractères` });
  }
  // isPrimaryAdmin n'est jamais accepté ici : posé uniquement par
  // ensureBootstrapAdmin() sur le tout premier compte (usersStore.js).
  const user = createUser({
    email, password, name, role: role === 'admin' ? 'admin' : 'user', mustOnboard: !skipOnboarding,
    validFrom: validFrom || null, validUntil: validUntil || null
  });
  assignUserToGroups(user.id, Array.isArray(groupIds) ? groupIds : []);
  logAudit(req, 'user.create', { userId: user.id, email: user.email, role: user.role, groupIds: groupIds || [] });
  res.status(201).json({ ok: true, user: toPublicUser(user) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { role, active, validFrom, validUntil } = req.body || {};
  const updated = setUserAdminFields(req.params.id, { role, active, validFrom, validUntil });
  if (!updated) return res.status(404).json({ ok: false, error: 'Utilisateur introuvable' });
  logAudit(req, 'user.update', { userId: updated.id, email: updated.email, role, active });
  res.json({ ok: true, user: toPublicUser(updated) });
}));

// Remplace l'ensemble des rôles/groupes d'un utilisateur EXISTANT — permet
// d'ajouter une permission de plus à un compte qui en a déjà (coche la
// nouvelle case en gardant les précédentes cochées) aussi bien que d'en
// retirer une. Voir groupsStore.setUserGroups pour la logique d'union.
router.put('/:id/groups', asyncHandler(async (req, res) => {
  const { groupIds } = req.body || {};
  setUserGroups(req.params.id, Array.isArray(groupIds) ? groupIds : []);
  logAudit(req, 'user.groups.update', { userId: req.params.id, groupIds: groupIds || [] });
  res.json({ ok: true, groupIds: groupIdsForUser(req.params.id) });
}));

router.put('/:id/terminal-tier', asyncHandler(async (req, res) => {
  const { tier } = req.body || {};
  const updated = setTerminalTier(req.params.id, tier ?? null);
  if (!updated) return res.status(404).json({ ok: false, error: 'Utilisateur introuvable' });
  logAudit(req, 'user.terminal_tier.update', { userId: updated.id, email: updated.email, tier: tier ?? null });
  res.json({ ok: true, user: toPublicUser(updated) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ ok: false, error: 'Impossible de supprimer votre propre compte' });
  }
  const removed = deleteUser(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Utilisateur introuvable' });
  logAudit(req, 'user.delete', { userId: req.params.id });
  res.json({ ok: true });
}));

export default router;
