import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listVaultEntries, createVaultEntry, deleteVaultEntry, revealVaultEntry, findVaultEntry, generateProdSecret
} from '../store/vaultStore.js';
import { findUserByEmail } from '../store/usersStore.js';
import { verifyPassword } from '../utils/crypto.js';
import { logAudit } from '../services/auditService.js';

// Mots de passe dev : visibles par tout utilisateur authentifié (aide les
// développeurs à accéder aux machines de test partagées). Mots de passe
// prod : réservés aux admins, générés automatiquement, et ré-protégés par
// mot de passe (l'utilisateur retape le sien pour révéler le secret).
const router = Router();
router.use(requireAuth);

router.get('/dev', (req, res) => {
  res.json({ ok: true, items: listVaultEntries('dev') });
});

router.get('/prod', requireRole('admin'), (req, res) => {
  res.json({ ok: true, items: listVaultEntries('prod') });
});

router.post('/dev', requireRole('admin'), asyncHandler(async (req, res) => {
  const { label, username, secret, notes } = req.body || {};
  if (!label || !secret) return res.status(400).json({ ok: false, error: 'Nom et mot de passe requis' });
  const entry = createVaultEntry({ tier: 'dev', label, username, secret, notes, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'dev', label });
  res.status(201).json({ ok: true, entry });
}));

router.post('/prod', requireRole('admin'), asyncHandler(async (req, res) => {
  const { label, username, notes } = req.body || {};
  if (!label) return res.status(400).json({ ok: false, error: 'Nom requis' });
  const entry = createVaultEntry({ tier: 'prod', label, username, secret: generateProdSecret(), notes, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'prod', label });
  res.status(201).json({ ok: true, entry });
}));

router.post('/:id/reveal', asyncHandler(async (req, res) => {
  const entry = findVaultEntry(req.params.id);
  if (!entry) return res.status(404).json({ ok: false, error: 'Entrée introuvable' });

  if (entry.tier === 'prod') {
    if (req.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
    const me = findUserByEmail(req.user.email);
    if (!verifyPassword(req.body?.currentPassword || '', me.passwordHash)) {
      return res.status(401).json({ ok: false, error: 'Mot de passe incorrect' });
    }
  }

  const secret = revealVaultEntry(entry.id);
  logAudit(req, 'vault.reveal', { id: entry.id, tier: entry.tier, label: entry.label });
  res.json({ ok: true, secret });
}));

router.delete('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  const entry = findVaultEntry(req.params.id);
  const removed = deleteVaultEntry(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Entrée introuvable' });
  logAudit(req, 'vault.delete', { id: req.params.id, tier: entry?.tier, label: entry?.label });
  res.json({ ok: true });
}));

export default router;
