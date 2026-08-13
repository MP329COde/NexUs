import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listVaultEntries, createVaultEntry, updateVaultEntry, deleteVaultEntry, revealVaultEntry, findVaultEntry, generateProdSecret
} from '../store/vaultStore.js';
import { findUserByEmail } from '../store/usersStore.js';
import { verifyPassword } from '../utils/crypto.js';
import { logAudit } from '../services/auditService.js';
import { getProject, isMember } from '../store/projectsStore.js';

function canAccessProjectEntry(entry, user) {
  if (entry.tier !== 'project') return true;
  const project = getProject(entry.projectId);
  return Boolean(project) && (user.role === 'admin' || isMember(project, user.id));
}

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
  const { label, username, secret, notes, url } = req.body || {};
  if (!label || !secret) return res.status(400).json({ ok: false, error: 'Nom et mot de passe requis' });
  const entry = createVaultEntry({ tier: 'dev', label, username, secret, notes, url, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'dev', label });
  res.status(201).json({ ok: true, entry });
}));

router.post('/prod', requireRole('admin'), asyncHandler(async (req, res) => {
  const { label, username, notes, url } = req.body || {};
  if (!label) return res.status(400).json({ ok: false, error: 'Nom requis' });
  const entry = createVaultEntry({ tier: 'prod', label, username, secret: generateProdSecret(), notes, url, actor: req.user });
  logAudit(req, 'vault.create', { id: entry.id, tier: 'prod', label });
  res.status(201).json({ ok: true, entry });
}));

router.post('/:id/reveal', asyncHandler(async (req, res) => {
  const entry = findVaultEntry(req.params.id);
  // 404 générique (pas 403) pour ne pas confirmer l'existence d'une entrée
  // hors de portée — même logique que projects.routes.js.
  if (!entry || !canAccessProjectEntry(entry, req.user)) return res.status(404).json({ ok: false, error: 'Entrée introuvable' });

  if (entry.tier === 'prod' && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
  }

  if (entry.tier === 'prod' || entry.tier === 'project') {
    const me = findUserByEmail(req.user.email);
    if (!verifyPassword(req.body?.currentPassword || '', me.passwordHash)) {
      return res.status(401).json({ ok: false, error: 'Mot de passe incorrect' });
    }
  }

  const secret = revealVaultEntry(entry.id);
  logAudit(req, 'vault.reveal', { id: entry.id, tier: entry.tier, label: entry.label });
  res.json({ ok: true, secret });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const entry = findVaultEntry(req.params.id);
  if (!entry || !canAccessProjectEntry(entry, req.user)) return res.status(404).json({ ok: false, error: 'Entrée introuvable' });
  if (entry.tier !== 'project' && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
  }
  const { label, username, url, notes } = req.body || {};
  const updated = updateVaultEntry(entry.id, { label, username, url, notes });
  logAudit(req, 'vault.update', { id: entry.id, tier: entry.tier, label: updated.label });
  res.json({ ok: true, entry: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const entry = findVaultEntry(req.params.id);
  if (!entry || !canAccessProjectEntry(entry, req.user)) return res.status(404).json({ ok: false, error: 'Entrée introuvable' });
  if (entry.tier !== 'project' && req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Réservé aux administrateurs' });
  }
  deleteVaultEntry(req.params.id);
  logAudit(req, 'vault.delete', { id: req.params.id, tier: entry.tier, label: entry.label });
  res.json({ ok: true });
}));

export default router;
