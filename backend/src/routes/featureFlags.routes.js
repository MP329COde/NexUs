import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import { logAudit } from '../services/auditService.js';
import * as flags from '../services/featureFlagService.js';

// Feature flags — gestion réservée aux admins (voir 0035_feature_flags.sql,
// services/featureFlagService.js). Lecture ouverte à tout utilisateur
// authentifié : savoir qu'un flag existe et son statut n'est pas sensible,
// contrairement à la capacité de le modifier.
const router = Router();
router.use(requireAuth);
router.use((req, res, next) => {
  if (!pool) return res.status(503).json({ ok: false, error: 'Socle indisponible (DATABASE_URL non configuré)', configured: false });
  next();
});

router.get('/', asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await flags.listFlags() });
}));

router.put('/:key', requireRole('admin'), asyncHandler(async (req, res) => {
  const { label, description, enabled, orgIds, userIds } = req.body || {};
  if (!label || !label.trim()) return res.status(400).json({ ok: false, error: 'label requis' });
  if (!/^[a-z0-9][a-z0-9-_.]*$/.test(req.params.key)) return res.status(400).json({ ok: false, error: 'Clé invalide (lettres minuscules, chiffres, tirets, points, underscores)' });
  const flag = await flags.upsertFlag(req.params.key, { label: label.trim(), description, enabled, orgIds, userIds, userId: req.user.id });
  logAudit(req, 'featureFlag.upsert', { key: flag.key, enabled: flag.enabled });
  res.json({ ok: true, flag });
}));

router.delete('/:key', requireRole('admin'), asyncHandler(async (req, res) => {
  const deleted = await flags.deleteFlag(req.params.key);
  if (!deleted) return res.status(404).json({ ok: false, error: 'Flag introuvable' });
  logAudit(req, 'featureFlag.delete', { key: req.params.key });
  res.json({ ok: true });
}));

export default router;
