import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { createBackup, listBackups, getBackupPath, deleteBackup, importBackup, restoreBackup } from '../services/backupService.js';
import { findUserByEmail } from '../store/usersStore.js';
import { verifyPassword } from '../utils/crypto.js';
import { logAudit } from '../services/auditService.js';

const router = Router();
router.use(requireAuth, requirePermission('backups', 'admin'));

router.get('/', (req, res) => {
  res.json({ ok: true, items: listBackups() });
});

router.post('/', asyncHandler(async (req, res) => {
  const backup = await createBackup();
  logAudit(req, 'backup.create', { file: backup.file });
  res.status(201).json({ ok: true, backup });
}));

// Import en base64 (JSON) plutôt qu'un multipart classique : évite une
// dépendance supplémentaire (multer) pour un fichier de quelques Mo tout au
// plus (borné par la limite globale express.json() de index.js).
router.post('/import', asyncHandler(async (req, res) => {
  const { filename, dataBase64 } = req.body || {};
  if (!dataBase64) return res.status(400).json({ ok: false, error: 'Fichier requis' });
  const buffer = Buffer.from(dataBase64, 'base64');
  const backup = importBackup(buffer, filename);
  logAudit(req, 'backup.import', { file: backup.file });
  res.status(201).json({ ok: true, backup });
}));

router.get('/:file/download', (req, res) => {
  const full = getBackupPath(req.params.file);
  if (!full) return res.status(404).json({ ok: false, error: 'Sauvegarde introuvable' });
  res.download(full);
});

// Action destructrice : exige de ressaisir son propre mot de passe, en plus
// d'être admin, avant de remplacer la base active.
router.post('/:file/restore', asyncHandler(async (req, res) => {
  const { password } = req.body || {};
  const user = findUserByEmail(req.user.email);
  if (!password || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'Mot de passe incorrect' });
  }
  const result = await restoreBackup(req.params.file);
  logAudit(req, 'backup.restore', { file: req.params.file, safetyBackup: result.safetyBackup?.file });
  res.json({ ok: true, ...result });
}));

router.delete('/:file', (req, res) => {
  if (!deleteBackup(req.params.file)) return res.status(404).json({ ok: false, error: 'Sauvegarde introuvable' });
  logAudit(req, 'backup.delete', { file: req.params.file });
  res.json({ ok: true });
});

export default router;
