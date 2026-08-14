import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole, toPublicUser } from '../middleware/auth.js';
import { listUsers, createUser, setUserAdminFields, setTerminalTier, deleteUser } from '../store/usersStore.js';
import { logAudit } from '../services/auditService.js';
import { getMinPasswordLength } from '../store/identityStore.js';

// Gestion des comptes : réservée aux administrateurs. Chaque utilisateur gère
// ses propres préférences (nom, avatar, mot de passe) via /api/auth/profile.
const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, items: listUsers().map(toPublicUser) });
});

router.post('/', asyncHandler(async (req, res) => {
  const { email, password, name, role, skipOnboarding } = req.body || {};
  const minLength = getMinPasswordLength();
  if (!email || !password || password.length < minLength) {
    return res.status(400).json({ ok: false, error: `E-mail requis et mot de passe d'au moins ${minLength} caractères` });
  }
  const user = createUser({ email, password, name, role: role === 'admin' ? 'admin' : 'user', mustOnboard: !skipOnboarding });
  logAudit(req, 'user.create', { userId: user.id, email: user.email, role: user.role });
  res.status(201).json({ ok: true, user: toPublicUser(user) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const { role, active } = req.body || {};
  const updated = setUserAdminFields(req.params.id, { role, active });
  if (!updated) return res.status(404).json({ ok: false, error: 'Utilisateur introuvable' });
  logAudit(req, 'user.update', { userId: updated.id, email: updated.email, role, active });
  res.json({ ok: true, user: toPublicUser(updated) });
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
