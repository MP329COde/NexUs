import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { createBackup, listBackups, getBackupPath, deleteBackup } from '../services/backupService.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, items: listBackups() });
});

router.post('/', asyncHandler(async (req, res) => {
  res.status(201).json({ ok: true, backup: createBackup() });
}));

router.get('/:file/download', (req, res) => {
  const full = getBackupPath(req.params.file);
  if (!full) return res.status(404).json({ ok: false, error: 'Sauvegarde introuvable' });
  res.download(full);
});

router.delete('/:file', (req, res) => {
  if (!deleteBackup(req.params.file)) return res.status(404).json({ ok: false, error: 'Sauvegarde introuvable' });
  res.json({ ok: true });
});

export default router;
