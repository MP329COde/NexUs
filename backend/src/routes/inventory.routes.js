import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { hasPermission } from '../store/groupsStore.js';
import { listAssets, createAsset, updateAsset, deleteAsset, ASSET_CATEGORIES, ASSET_STATES } from '../store/inventoryStore.js';
import { logAudit } from '../services/auditService.js';

// Inventaire des actifs matériels : réservé à l'admin principal (le tout
// premier compte créé au bootstrap) et aux comptes ayant explicitement la
// permission 'inventory' au niveau admin. Volontairement N'utilise PAS
// requirePermission() ici : son bypass implicite pour role==='admin'
// donnerait accès à tout admin de plateforme, ce qui est exactement ce que
// cette restriction doit exclure.
const router = Router();
router.use(requireAuth, (req, res, next) => {
  if (req.user?.isPrimaryAdmin) return next();
  if (hasPermission(req.user.id, 'inventory', 'admin')) return next();
  return res.status(403).json({ ok: false, error: 'Réservé à l\'admin principal ou aux comptes autorisés' });
});

router.get('/', (req, res) => {
  res.json({ ok: true, items: listAssets(), categories: ASSET_CATEGORIES, states: ASSET_STATES });
});

router.post('/', asyncHandler(async (req, res) => {
  const asset = createAsset(req.body || {});
  logAudit(req, 'inventory.create', { assetId: asset.id, name: asset.name });
  res.status(201).json({ ok: true, asset });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const updated = updateAsset(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false, error: 'Actif introuvable' });
  logAudit(req, 'inventory.update', { assetId: updated.id, name: updated.name });
  res.json({ ok: true, asset: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const removed = deleteAsset(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Actif introuvable' });
  logAudit(req, 'inventory.delete', { assetId: req.params.id });
  res.json({ ok: true });
}));

export default router;
