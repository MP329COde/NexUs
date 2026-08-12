import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { listVolumes, createVolume, updateVolume, deleteVolume, VOLUME_TYPES } from '../store/volumeStore.js';
import { logAudit } from '../services/auditService.js';

// Suivi des volumes : ouvert à tout utilisateur authentifié, comme les
// proxies réseau (pas réservé aux admins).
const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  res.json({ ok: true, items: listVolumes(), types: VOLUME_TYPES });
});

router.post('/', asyncHandler(async (req, res) => {
  const volume = createVolume(req.body || {});
  logAudit(req, 'volume.create', { volumeId: volume.id, name: volume.name });
  res.status(201).json({ ok: true, volume });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const updated = updateVolume(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ ok: false, error: 'Volume introuvable' });
  res.json({ ok: true, volume: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const removed = deleteVolume(req.params.id);
  if (!removed) return res.status(404).json({ ok: false, error: 'Volume introuvable' });
  logAudit(req, 'volume.delete', { volumeId: req.params.id });
  res.json({ ok: true });
}));

export default router;
