import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listAssets, createAsset, updateAsset, deleteAsset, ASSET_CATEGORIES, ASSET_STATES } from '../store/inventoryStore.js';
import { logAudit } from '../services/auditService.js';

// Inventaire des actifs matériels : réservé aux administrateurs.
const router = Router();
router.use(requireAuth, requireRole('admin'));

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
